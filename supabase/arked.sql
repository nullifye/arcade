-- Arked Warga: combined points across every game.
-- Run in the Supabase SQL editor of the same project as Teka Kata, AFTER Teka Kata's
-- supabase/schema.sql (it reads public.cg_scores). Safe to re-run.
--
-- Security model (as for cg_scores):
--   * RLS is on and there are NO table policies, so anon/authenticated can't read or write
--     the tables directly (player_id stays private).
--   * The browser can only call these SECURITY DEFINER functions:
--       arked_record          a game on any host reports one finished round
--       arked_player_summary  one player's points, play time and rounds, per game
--   * Teka Kata needs no change: a trigger copies each of its recorded rounds from cg_scores.
--   * Games are client-trusted, so the checks bound abuse; they can't fully prevent it.

-- ---------------------------------------------------------------- tables

-- Games that may report points. Add a row when a new game goes live (same id as js/games.js).
create table if not exists public.arked_games (
  id    text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name  text not null check (char_length(name) between 1 and 40)
);

insert into public.arked_games (id, name) values
  ('teka-kata', 'Teka Kata UiTM')
on conflict (id) do update set name = excluded.name;

create table if not exists public.arked_plays (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  player_id   uuid        not null,
  game        text        not null references public.arked_games (id),
  points      int         not null check (points between 0 and 100000),
  seconds     int         not null check (seconds between 0 and 86400),
  -- The row's id in the game's own table (cg_scores.id for Teka Kata), so copies happen once.
  source_id   bigint
);

alter table public.arked_games enable row level security;
alter table public.arked_plays enable row level security;
revoke all on table public.arked_games from anon, authenticated;
revoke all on table public.arked_plays from anon, authenticated;

-- ---------------------------------------------------------------- indexes

-- A player's summary, and arked_record's rate limit (newest rows first).
create index if not exists arked_plays_player
  on public.arked_plays (player_id, game, created_at desc);
-- Each copied source row at most once (the trigger and the backfill below).
create unique index if not exists arked_plays_source
  on public.arked_plays (game, source_id) where source_id is not null;

-- ---------------------------------------------------------------- Teka Kata (cg_scores)

create or replace function public.arked_copy_cg_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.arked_plays (created_at, player_id, game, points, seconds, source_id)
  values (new.created_at, new.player_id, 'teka-kata', least(new.score, 100000), new.seconds, new.id)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.arked_copy_cg_score() from public, anon, authenticated;

drop trigger if exists arked_from_cg_scores on public.cg_scores;
create trigger arked_from_cg_scores
  after insert on public.cg_scores
  for each row execute function public.arked_copy_cg_score();

-- Rounds recorded before this file was run.
insert into public.arked_plays (created_at, player_id, game, points, seconds, source_id)
select s.created_at, s.player_id, 'teka-kata', least(s.score, 100000), s.seconds, s.id
from public.cg_scores s
on conflict do nothing;

-- ---------------------------------------------------------------- functions

drop function if exists public.arked_record(uuid, text, int, int);
drop function if exists public.arked_player_summary(uuid);

-- A game reports one finished round. Teka Kata doesn't call this (its trigger does the work).
create function public.arked_record(p_player_id uuid, p_game text, p_points int, p_seconds int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_player_id is null then
    raise exception 'player id is required' using errcode = '22023';
  end if;
  if p_game = 'teka-kata' or not exists (select 1 from public.arked_games g where g.id = p_game) then
    raise exception 'unknown game' using errcode = '22023';
  end if;
  if p_points is null or p_points not between 0 and 100000
     or p_seconds is null or p_seconds not between 0 and 86400 then
    raise exception 'points or seconds out of range' using errcode = '22023';
  end if;
  -- At most one round per player per game every 10 seconds.
  if exists (
    select 1 from public.arked_plays p
    where p.player_id = p_player_id and p.game = p_game
      and p.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'too many rounds, slow down' using errcode = '54000';
  end if;
  insert into public.arked_plays (player_id, game, points, seconds)
  values (p_player_id, p_game, p_points, p_seconds);
end;
$$;

-- One player's totals per game, most points first. Games they haven't played aren't listed.
create function public.arked_player_summary(p_player_id uuid)
returns table (game text, name text, points bigint, seconds bigint, plays bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.game, g.name, sum(p.points)::bigint, sum(p.seconds)::bigint, count(*)::bigint
  from public.arked_plays p
  join public.arked_games g on g.id = p.game
  where p.player_id = p_player_id
  group by p.game, g.name
  order by 3 desc, 1;
$$;

revoke all on function public.arked_record(uuid, text, int, int) from public;
revoke all on function public.arked_player_summary(uuid) from public;
grant execute on function public.arked_record(uuid, text, int, int) to anon, authenticated;
grant execute on function public.arked_player_summary(uuid) to anon, authenticated;
