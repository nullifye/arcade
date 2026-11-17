-- Removes Teka Kata's old leaderboard table and functions (cg_scores, cg_submit, cg_top_total,
-- cg_campus_rank, …). Teka Kata now records rounds with arked_record and reads its boards with
-- arked_top / arked_campus_rank, like every other game (supabase/arked.sql).
--
-- Run it ONCE, in the Supabase SQL editor, only after:
--   1. supabase/arked.sql has been run (it copies every cg_scores round into arked_plays), and
--   2. the new Teka Kata (warga-games, using arked_record) is live, so nobody still sends
--      rounds through cg_submit.
--
-- It refuses to drop anything while a cg_scores round is missing from arked_plays, and runs
-- as one transaction: either everything is removed or nothing is. This can't be undone.

begin;

do $$
declare
  v_missing bigint;
begin
  if to_regclass('public.cg_scores') is null then
    raise notice 'cg_scores is already gone; nothing to do.';
    return;
  end if;
  -- Copy anything that arrived since arked.sql last ran.
  insert into public.arked_plays
    (created_at, play_date, player_id, nickname, user_type, campus, game, points, seconds, daily, source_id)
  select s.created_at, s.play_date, s.player_id, s.nickname, s.user_type, s.campus,
         'teka-kata', least(s.score, 100000), s.seconds, s.mode = 'daily', s.id
  from public.cg_scores s
  on conflict do nothing;

  -- A round counts as kept when it was copied, or, for a Cabaran Harian round, when that
  -- player's daily round for that day is already there (played on the new Teka Kata too, so
  -- the copy was skipped: one daily per day).
  select count(*) into v_missing
  from public.cg_scores s
  where not exists (
    select 1 from public.arked_plays p where p.game = 'teka-kata' and p.source_id = s.id
  )
  and not (
    s.mode = 'daily' and exists (
      select 1 from public.arked_plays p
      where p.game = 'teka-kata' and p.daily and p.player_id = s.player_id and p.play_date = s.play_date
    )
  );
  if v_missing > 0 then
    raise exception '% cg_scores round(s) are not in arked_plays; nothing was removed.', v_missing;
  end if;

  drop trigger if exists arked_from_cg_scores on public.cg_scores;
  drop table public.cg_scores;
end;
$$;

drop function if exists public.arked_copy_cg_score();
drop function if exists public.cg_submit(uuid, text, text, text, text, date, int, int, int, int);
drop function if exists public.cg_top_total(uuid, date, int);
drop function if exists public.cg_top_total(uuid, int);
drop function if exists public.cg_top(text, date, uuid, int);
drop function if exists public.cg_campus_rank(int);
drop function if exists public.cg_player_totals(date);
drop function if exists public.cg_compute_score(int, int, int);

commit;
