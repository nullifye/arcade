-- Arked Warga: every game's rounds in one table, for combined points and per-game boards.
-- Run in the Supabase SQL editor of the same project as Teka Kata, AFTER Teka Kata's
-- supabase/schema.sql (it reads public.cg_scores). Safe to re-run.
--
-- Security model (as for cg_scores):
--   * RLS is on and there are NO table policies, so anon/authenticated can't read or write
--     the tables directly (player_id stays private).
--   * The browser can only call these SECURITY DEFINER functions:
--       arked_record          a game reports one finished round
--       arked_player_summary  one player's points, play time and rounds, per game (the hub)
--       arked_top             players by points: one game or all, one day or all time
--       arked_campus_rank     campuses by points: one game or all
--   * Teka Kata doesn't call arked_record: a trigger copies each of its rounds from cg_scores.
--   * Games are client-trusted, so the checks bound abuse; they can't fully prevent it.

-- ---------------------------------------------------------------- tables

-- Games that may report rounds. Add a row when a new game goes live (same id as the hub's
-- js/games.js). A round may score at most max_points, and at most max_points_per_sec for
-- each second it lasted.
create table if not exists public.arked_games (
  id                  text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                text not null check (char_length(name) between 1 and 40),
  max_points          int  not null default 100000 check (max_points between 1 and 100000),
  max_points_per_sec  int  not null default 1000   check (max_points_per_sec >= 1)
);

insert into public.arked_games (id, name, max_points, max_points_per_sec) values
  ('teka-kata', 'Teka Kata UiTM', 100000, 1000),
  -- Ular: 15 points a food with walls on, a 20×20 board holds at most 397 foods.
  ('ular',      'Ular',           6000,   75)
on conflict (id) do update
  set name = excluded.name,
      max_points = excluded.max_points,
      max_points_per_sec = excluded.max_points_per_sec;

create table if not exists public.arked_plays (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  play_date   date        not null default (now() at time zone 'Asia/Kuala_Lumpur')::date,
  player_id   uuid        not null,
  nickname    text        not null check (char_length(nickname) between 1 and 20),
  user_type   text        not null check (user_type in ('pelajar', 'staf', 'alumni', 'awam')),
  campus      text        not null check (char_length(campus) between 1 and 60),
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
-- Hari Ini boards: one day's rows.
create index if not exists arked_plays_day
  on public.arked_plays (play_date, game);
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
  insert into public.arked_plays
    (created_at, play_date, player_id, nickname, user_type, campus, game, points, seconds, source_id)
  values
    (new.created_at, new.play_date, new.player_id, new.nickname, new.user_type, new.campus,
     'teka-kata', least(new.score, 100000), new.seconds, new.id)
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
insert into public.arked_plays
  (created_at, play_date, player_id, nickname, user_type, campus, game, points, seconds, source_id)
select s.created_at, s.play_date, s.player_id, s.nickname, s.user_type, s.campus,
       'teka-kata', least(s.score, 100000), s.seconds, s.id
from public.cg_scores s
on conflict do nothing;

-- ---------------------------------------------------------------- functions

drop function if exists public.arked_record(uuid, text, int, int);
drop function if exists public.arked_record(uuid, text, int, int, text, text, text);
drop function if exists public.arked_player_summary(uuid);
drop function if exists public.arked_top(text, uuid, date, int);
drop function if exists public.arked_campus_rank(text, int);
drop function if exists public.arked_player_totals(text, date);

-- A game reports one finished round, with the player's current profile.
create function public.arked_record(
  p_player_id  uuid,
  p_game       text,
  p_points     int,
  p_seconds    int,
  p_nickname   text,
  p_user_type  text,
  p_campus     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.arked_games;
begin
  if p_player_id is null then
    raise exception 'Data permainan tidak sah' using errcode = '22023';
  end if;
  select * into v_game from public.arked_games g where g.id = p_game;
  if not found or p_game = 'teka-kata' then
    raise exception 'Permainan tidak dikenali' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_nickname, ''))) not between 1 and 20
     or p_user_type is null or p_user_type not in ('pelajar', 'staf', 'alumni', 'awam')
     or char_length(btrim(coalesce(p_campus, ''))) not between 1 and 60 then
    raise exception 'Profil tidak sah' using errcode = '22023';
  end if;
  if p_points is null or p_seconds is null
     or p_points not between 0 and v_game.max_points
     or p_seconds not between 1 and 86400
     or p_points > p_seconds::bigint * v_game.max_points_per_sec then
    raise exception 'Markah tidak munasabah' using errcode = '22023';
  end if;
  -- At most one round per player per game every 10 seconds.
  if exists (
    select 1 from public.arked_plays p
    where p.player_id = p_player_id and p.game = p_game
      and p.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'Terlalu kerap. Cuba sebentar lagi.' using errcode = '54000';
  end if;
  insert into public.arked_plays (player_id, nickname, user_type, campus, game, points, seconds)
  values (p_player_id, btrim(p_nickname), p_user_type, btrim(p_campus), p_game, p_points, p_seconds);
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

-- Every player's totals for one game (or all, p_game null) over one day (p_play_date) or
-- all time (null), ranked: points, then less time, then who played first. Nickname, type
-- and campus are from the player's latest round in the range. Internal, like cg_player_totals.
create function public.arked_player_totals(p_game text, p_play_date date)
returns table (
  rank           bigint,
  player_id      uuid,
  nickname       text,
  user_type      text,
  campus         text,
  total_points   bigint,
  total_seconds  bigint,
  plays          bigint
)
language sql
stable
set search_path = ''
as $$
  select row_number() over (
           order by sum(p.points) desc, sum(p.seconds) asc, min(p.created_at) asc
         ),
         p.player_id,
         (array_agg(p.nickname  order by p.created_at desc))[1],
         (array_agg(p.user_type order by p.created_at desc))[1],
         (array_agg(p.campus    order by p.created_at desc))[1],
         sum(p.points)::bigint,
         sum(p.seconds)::bigint,
         count(*)
  from public.arked_plays p
  where (p_game is null or p.game = p_game)
    and (p_play_date is null or p.play_date = p_play_date)
  group by p.player_id;
$$;

-- Hari Ini (p_play_date given) or Keseluruhan (null) board for one game (or all), top
-- p_limit (1–100), plus the caller's own row when they're further down. player_id never
-- leaves the database; is_me marks the caller's row.
create function public.arked_top(
  p_game       text default null,
  p_player_id  uuid default null,
  p_play_date  date default null,
  p_limit      int  default 50
)
returns table (
  rank           bigint,
  nickname       text,
  user_type      text,
  campus         text,
  total_points   bigint,
  total_seconds  bigint,
  plays          bigint,
  is_me          boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.rank, t.nickname, t.user_type, t.campus, t.total_points, t.total_seconds, t.plays,
         coalesce(t.player_id = p_player_id, false)
  from public.arked_player_totals(p_game, p_play_date) t
  where t.rank <= least(greatest(coalesce(p_limit, 50), 1), 100)
     or t.player_id = p_player_id
  order by t.rank;
$$;

-- Kampus board for one game (or all): campuses by the points of every round played under
-- them, with play time, rounds and players. Ties go to less time. Top p_limit (1–100).
create function public.arked_campus_rank(p_game text default null, p_limit int default 50)
returns table (
  rank           bigint,
  campus         text,
  players        bigint,
  total_points   bigint,
  total_seconds  bigint,
  plays          bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select row_number() over (order by sum(p.points) desc, sum(p.seconds) asc),
         p.campus,
         count(distinct p.player_id),
         sum(p.points)::bigint,
         sum(p.seconds)::bigint,
         count(*)
  from public.arked_plays p
  where p_game is null or p.game = p_game
  group by p.campus
  order by 1
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- ---------------------------------------------------------------- access

revoke all on function public.arked_player_totals(text, date) from public, anon, authenticated;
revoke all on function public.arked_record(uuid, text, int, int, text, text, text) from public;
revoke all on function public.arked_player_summary(uuid) from public;
revoke all on function public.arked_top(text, uuid, date, int) from public;
revoke all on function public.arked_campus_rank(text, int) from public;
grant execute on function public.arked_record(uuid, text, int, int, text, text, text) to anon, authenticated;
grant execute on function public.arked_player_summary(uuid) to anon, authenticated;
grant execute on function public.arked_top(text, uuid, date, int) to anon, authenticated;
grant execute on function public.arked_campus_rank(text, int) to anon, authenticated;
