-- Arked Warga: every game's rounds in one table, for combined points and per-game boards
-- (Hari Ini, Keseluruhan, Kampus). Every game, Teka Kata included, records rounds with
-- arked_record and reads boards with arked_top / arked_campus_rank.
--
-- Run in the Supabase SQL editor. Safe to re-run. It also upgrades a database that ran an
-- earlier version of this file, and, while Teka Kata's old public.cg_scores table still
-- exists, copies its rounds in (and keeps copying any that older Teka Kata pages still send).
-- Once that's done, supabase/retire-cg-scores.sql removes the old cg_* table and functions.
--
-- Security model:
--   * RLS is on and there are NO table policies, so anon/authenticated can't read or write
--     the tables directly (player_id stays private).
--   * The browser can only call these SECURITY DEFINER functions:
--       arked_record          a game reports one finished round
--       arked_player_summary  one player's points, play time and rounds, per game (the hub)
--       arked_top             players by points: one game or all, one day or all time
--       arked_campus_rank     campuses by points: one game or all
--   * Games are client-trusted (points and time come from the browser), so the checks bound
--     abuse; they can't fully prevent it.

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

-- Upgrade from the first version of this file, whose arked_games had only id and name.
alter table public.arked_games
  add column if not exists max_points int not null default 100000 check (max_points between 1 and 100000),
  add column if not exists max_points_per_sec int not null default 1000 check (max_points_per_sec >= 1);

insert into public.arked_games (id, name, max_points, max_points_per_sec) values
  -- Teka Kata: the longest phrase hides 36 letters, worth at most 4,500; the fastest time
  -- (half a second a letter) gives 250 a second. Room left for longer phrases.
  ('teka-kata', 'Teka Kata', 10000, 260),
  -- Ular: 15 points a food with walls on, a 20×20 board holds at most 397 foods.
  ('ular',      'Ular',           6000,   75),
  -- Duga Kata: a win scores 1,000 (one guess) down to 200 (six), plus up to 360 for speed; the
  -- best round is a one-guess win in 1 second, 1,358 points.
  ('duga-kata', 'Duga Kata',      2000, 1400)
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
  -- A game's daily challenge round: one per player, game and day.
  daily       boolean     not null default false,
  -- The row's id in Teka Kata's old cg_scores table, so each is copied once. Null otherwise.
  source_id   bigint
);

-- Upgrade from earlier versions of this file (no date, profile or daily flag on rounds).
alter table public.arked_plays
  add column if not exists play_date date,
  add column if not exists nickname  text check (char_length(nickname) between 1 and 20),
  add column if not exists user_type text check (user_type in ('pelajar', 'staf', 'alumni', 'awam')),
  add column if not exists campus    text check (char_length(campus) between 1 and 60),
  add column if not exists daily     boolean not null default false;

-- Copies of Teka Kata rounds take their date, profile and mode from their cg_scores row.
do $$
begin
  if to_regclass('public.cg_scores') is not null then
    update public.arked_plays p
    set play_date = coalesce(p.play_date, s.play_date),
        nickname  = coalesce(p.nickname,  s.nickname),
        user_type = coalesce(p.user_type, s.user_type),
        campus    = coalesce(p.campus,    s.campus),
        daily     = (s.mode = 'daily')
    from public.cg_scores s
    where p.game = 'teka-kata' and p.source_id = s.id
      and (p.play_date is null or p.nickname is null or p.user_type is null or p.campus is null
           or p.daily is distinct from (s.mode = 'daily'));
  end if;
end;
$$;

-- Anything left without a profile (not expected) gets a neutral one rather than being deleted.
update public.arked_plays
set play_date = coalesce(play_date, (created_at at time zone 'Asia/Kuala_Lumpur')::date),
    nickname  = coalesce(nickname, 'Pemain'),
    user_type = coalesce(user_type, 'awam'),
    campus    = coalesce(campus, 'Bukan warga UiTM')
where play_date is null or nickname is null or user_type is null or campus is null;

alter table public.arked_plays
  alter column play_date set default (now() at time zone 'Asia/Kuala_Lumpur')::date,
  alter column play_date set not null,
  alter column nickname  set not null,
  alter column user_type set not null,
  alter column campus    set not null;

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
-- One daily challenge round per player, game and day (also arked_record's duplicate check).
create unique index if not exists arked_plays_daily_once
  on public.arked_plays (player_id, game, play_date) where daily;
-- Each copied cg_scores row at most once.
create unique index if not exists arked_plays_source
  on public.arked_plays (game, source_id) where source_id is not null;

-- ---------------------------------------------------------------- Teka Kata's old table

-- While cg_scores exists: copy its rounds, and keep copying any an older (cached) Teka Kata
-- page still sends through cg_submit. supabase/retire-cg-scores.sql removes all of this.
create or replace function public.arked_copy_cg_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.arked_plays
    (created_at, play_date, player_id, nickname, user_type, campus, game, points, seconds, daily, source_id)
  values
    (new.created_at, new.play_date, new.player_id, new.nickname, new.user_type, new.campus,
     'teka-kata', least(new.score, 100000), new.seconds, new.mode = 'daily', new.id)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.arked_copy_cg_score() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.cg_scores') is not null then
    drop trigger if exists arked_from_cg_scores on public.cg_scores;
    create trigger arked_from_cg_scores
      after insert on public.cg_scores
      for each row execute function public.arked_copy_cg_score();

    insert into public.arked_plays
      (created_at, play_date, player_id, nickname, user_type, campus, game, points, seconds, daily, source_id)
    select s.created_at, s.play_date, s.player_id, s.nickname, s.user_type, s.campus,
           'teka-kata', least(s.score, 100000), s.seconds, s.mode = 'daily', s.id
    from public.cg_scores s
    on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------- functions

drop function if exists public.arked_record(uuid, text, int, int);
drop function if exists public.arked_record(uuid, text, int, int, text, text, text);
drop function if exists public.arked_record(uuid, text, int, int, text, text, text, boolean, date);
drop function if exists public.arked_player_summary(uuid);
drop function if exists public.arked_top(text, uuid, date, int);
drop function if exists public.arked_campus_rank(text, int);
drop function if exists public.arked_player_totals(text, date);

-- A game reports one finished round, with the player's current profile.
--   p_daily      true for a daily challenge round: at most one per player, game and day
--                (a second one fails with code 23505).
--   p_play_date  the round's day (YYYY-MM-DD, Malaysia); null = today. Must be within a day
--                of today, so a daily challenge started just before midnight still counts.
create function public.arked_record(
  p_player_id  uuid,
  p_game       text,
  p_points     int,
  p_seconds    int,
  p_nickname   text,
  p_user_type  text,
  p_campus     text,
  p_daily      boolean default false,
  p_play_date  date    default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game  public.arked_games;
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_date  date := coalesce(p_play_date, (now() at time zone 'Asia/Kuala_Lumpur')::date);
  v_daily boolean := coalesce(p_daily, false);
begin
  if p_player_id is null then
    raise exception 'Data permainan tidak sah' using errcode = '22023';
  end if;
  select * into v_game from public.arked_games g where g.id = p_game;
  if not found then
    raise exception 'Permainan tidak dikenali' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_nickname, ''))) not between 1 and 20
     or p_user_type is null or p_user_type not in ('pelajar', 'staf', 'alumni', 'awam')
     or char_length(btrim(coalesce(p_campus, ''))) not between 1 and 60 then
    raise exception 'Profil tidak sah' using errcode = '22023';
  end if;
  if v_date not between v_today - 1 and v_today + 1 then
    raise exception 'Tarikh permainan tidak sah' using errcode = '22023';
  end if;
  if p_points is null or p_seconds is null
     or p_points not between 0 and v_game.max_points
     or p_seconds not between 1 and 86400
     or p_points > p_seconds::bigint * v_game.max_points_per_sec then
    raise exception 'Markah tidak munasabah' using errcode = '22023';
  end if;
  -- Before the rate limit, so a retried daily round gets "already recorded", not "too often".
  if v_daily and exists (
    select 1 from public.arked_plays p
    where p.player_id = p_player_id and p.game = p_game and p.daily and p.play_date = v_date
  ) then
    raise exception 'Markah Cabaran Harian sudah direkodkan' using errcode = '23505';
  end if;
  -- At most one round per player per game every 10 seconds.
  if exists (
    select 1 from public.arked_plays p
    where p.player_id = p_player_id and p.game = p_game
      and p.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'Terlalu kerap. Cuba sebentar lagi.' using errcode = '54000';
  end if;
  insert into public.arked_plays
    (play_date, player_id, nickname, user_type, campus, game, points, seconds, daily)
  values
    (v_date, p_player_id, btrim(p_nickname), p_user_type, btrim(p_campus), p_game, p_points, p_seconds, v_daily);
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
-- and campus are from the player's latest round in the range. Internal.
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
revoke all on function public.arked_record(uuid, text, int, int, text, text, text, boolean, date) from public;
revoke all on function public.arked_player_summary(uuid) from public;
revoke all on function public.arked_top(text, uuid, date, int) from public;
revoke all on function public.arked_campus_rank(text, int) from public;
grant execute on function public.arked_record(uuid, text, int, int, text, text, text, boolean, date) to anon, authenticated;
grant execute on function public.arked_player_summary(uuid) to anon, authenticated;
grant execute on function public.arked_top(text, uuid, date, int) to anon, authenticated;
grant execute on function public.arked_campus_rank(text, int) to anon, authenticated;
