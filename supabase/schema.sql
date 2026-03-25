-- Great Kingdom — Supabase Schema
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.rooms (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,           -- 6-char join code shown to players
  status        text not null default 'waiting' -- 'waiting' | 'playing' | 'finished'
                check (status in ('waiting', 'playing', 'finished')),
  blue_user     uuid references auth.users(id) on delete set null,
  orange_user   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.game_states (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references public.rooms(id) on delete cascade,
  board             jsonb not null,              -- 9×9 number[][]
  territory         jsonb not null,              -- 9×9 number[][]
  turn              int  not null default 1,     -- 1=BLUE, 2=RED
  pass_count        int  not null default 0,
  blue_pieces       int  not null default 0,
  orange_pieces     int  not null default 0,
  blue_territory    int  not null default 0,
  orange_territory  int  not null default 0,
  game_over         boolean not null default false,
  winner            int,                         -- null | 1 | 2
  win_reason        text,                        -- null | 'capture' | 'territory'
  last_move         jsonb,                       -- {row, col} | null
  updated_at        timestamptz not null default now(),
  unique (room_id)                               -- one active state per room
);

create table if not exists public.move_log (
  id            bigint primary key generated always as identity,
  room_id       uuid not null references public.rooms(id) on delete cascade,
  move_number   int  not null,
  player        int  not null,                   -- 1=BLUE, 2=RED
  type          text not null                    -- 'place' | 'pass'
                check (type in ('place', 'pass')),
  row           int,                             -- null for pass
  col           int,                             -- null for pass
  created_at    timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists rooms_code_idx        on public.rooms(code);
create index if not exists game_states_room_idx  on public.game_states(room_id);
create index if not exists move_log_room_idx     on public.move_log(room_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.rooms        enable row level security;
alter table public.game_states  enable row level security;
alter table public.move_log     enable row level security;

-- rooms: anyone can read (needed to join by code); only the creator can insert
create policy "rooms_select" on public.rooms
  for select using (true);

create policy "rooms_insert" on public.rooms
  for insert with check (auth.uid() = blue_user);

create policy "rooms_update" on public.rooms
  for update
  using (
    auth.uid() = blue_user
    or auth.uid() = orange_user
    or (orange_user is null and status = 'waiting')  -- allow a new player to claim the orange slot
  )
  with check (
    auth.uid() = blue_user
    or auth.uid() = orange_user  -- after the update the caller must be a member
  );

-- game_states: room members can read; only the current turn's player can update
create policy "game_states_select" on public.game_states
  for select using (
    exists (
      select 1 from public.rooms r
      where r.id = room_id
        and (r.blue_user = auth.uid() or r.orange_user = auth.uid())
    )
  );

create policy "game_states_insert" on public.game_states
  for insert with check (
    exists (
      select 1 from public.rooms r
      where r.id = room_id
        and r.blue_user = auth.uid()   -- only room creator inserts the initial state
    )
  );

create policy "game_states_update" on public.game_states
  for update using (
    exists (
      select 1 from public.rooms r
      where r.id = room_id
        and (
          (turn = 1 and r.blue_user   = auth.uid()) or
          (turn = 2 and r.orange_user = auth.uid())
        )
    )
  );

-- move_log: room members can read; active player can insert
create policy "move_log_select" on public.move_log
  for select using (
    exists (
      select 1 from public.rooms r
      where r.id = room_id
        and (r.blue_user = auth.uid() or r.orange_user = auth.uid())
    )
  );

create policy "move_log_insert" on public.move_log
  for insert with check (
    exists (
      select 1 from public.rooms r
      join public.game_states gs on gs.room_id = r.id
      where r.id = room_id
        and (
          (gs.turn = 1 and r.blue_user   = auth.uid()) or
          (gs.turn = 2 and r.orange_user = auth.uid())
        )
    )
  );

-- ============================================================
-- REALTIME
-- Enable in Dashboard: Database → Replication → supabase_realtime
-- Add tables: rooms, game_states
-- (move_log does not need realtime)
-- ============================================================

-- ============================================================
-- PHASE 8 MIGRATION — Server-side move validation
-- Run in Supabase SQL Editor AFTER deploying the validate-move
-- Edge Function.
--
-- Rationale: the validate-move Edge Function now owns all
-- game_states mutations.  It uses the service-role key (which
-- bypasses RLS), so no update policy is needed for the function.
-- Dropping the client-facing update policy means a cheating
-- client can no longer push arbitrary board state directly to
-- the database.
-- ============================================================

-- Drop the policy that allowed the current-turn player to
-- update game_states directly from the client.
drop policy if exists "game_states_update" on public.game_states;

-- Drop the policy that allowed the active player to insert
-- move_log rows directly; the Edge Function handles this now.
drop policy if exists "move_log_insert" on public.move_log;

-- ============================================================
-- PHASE 9 MIGRATION — Public / password rooms
-- Run in Supabase SQL Editor after Phase 8.
--
-- Adds:
--   • visibility column  ('private' | 'public') on rooms
--   • has_password boolean column on rooms (safe to expose)
--   • room_secrets table — password stored here, no client SELECT
--   • Index for the public lobby browser query
--   • join_room(p_code, p_password) SECURITY DEFINER function
--     — atomically checks password + claims orange slot
--
-- Why room_secrets instead of a column on rooms:
--   Postgres column-level REVOKE cannot override a table-level
--   SELECT grant, so any client with table SELECT can still read
--   a column even after REVOKE SELECT (col).  A separate table
--   with no SELECT RLS policy is the only reliable way to hide
--   the password from clients while still letting a SECURITY
--   DEFINER function read it.
-- ============================================================

-- 1. Clean up any partial Phase 9 run (idempotent)
--    Drop has_password first — it was a generated column depending on room_password
alter table public.rooms
  drop column if exists has_password;

alter table public.rooms
  drop column if exists room_password;

-- 2. New columns on rooms
alter table public.rooms
  add column if not exists visibility  text not null default 'private'
    check (visibility in ('private', 'public')),
  add column if not exists has_password boolean not null default false;

-- 3. Separate table for passwords — no client SELECT policy
create table if not exists public.room_secrets (
  room_id  uuid primary key references public.rooms(id) on delete cascade,
  password text not null
);

alter table public.room_secrets enable row level security;

-- Room creator can insert a secret for their own room
create policy "room_secrets_insert" on public.room_secrets
  for insert with check (
    exists (
      select 1 from public.rooms r
      where r.id = room_id and r.blue_user = auth.uid()
    )
  );
-- No SELECT policy → clients can never read passwords via the API

-- 4. Index for lobby browser (public + waiting rooms, newest first)
create index if not exists rooms_public_idx
  on public.rooms (visibility, status, created_at desc);

-- 5. join_room RPC
--    SECURITY DEFINER  → runs as the function owner (postgres), bypasses RLS
--    FOR UPDATE        → row-level lock prevents concurrent double-joins
create or replace function public.join_room(
  p_code     text,
  p_password text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room   public.rooms;
  v_secret public.room_secrets;
  v_me     uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  select * into v_room
    from public.rooms
    where code = p_code
    for update;                         -- lock the row for the duration

  if not found then
    return jsonb_build_object('error', 'room_not_found');
  end if;

  if v_room.status <> 'waiting' or v_room.orange_user is not null then
    return jsonb_build_object('error', 'room_not_available');
  end if;

  if v_room.blue_user = v_me then
    return jsonb_build_object('error', 'already_creator');
  end if;

  if v_room.has_password then
    select * into v_secret
      from public.room_secrets
      where room_id = v_room.id;

    if not found or p_password is null or p_password <> v_secret.password then
      return jsonb_build_object('error', 'wrong_password');
    end if;
  end if;

  update public.rooms
    set orange_user = v_me,
        status      = 'playing'
    where id = v_room.id;

  return jsonb_build_object('ok', true, 'code', v_room.code);
end;
$$;

-- 6. Allow authenticated (and anonymous) users to call the function
grant execute on function public.join_room(text, text) to anon, authenticated;

-- ============================================================
-- PHASE 10 MIGRATION — Move sequencing + idempotency
-- Run in Supabase SQL Editor after Phase 9.
--
-- Adds:
--   • UNIQUE(room_id, move_number)  on move_log
--     Prevents the same move_number from being recorded twice for a
--     given room, making the Edge Function's 409 conflict guard DB-backed.
--
--   • idempotency_key text UNIQUE   on move_log
--     Allows the Edge Function to detect and safely replay a request
--     that was retried after a transient 5xx response.  The UNIQUE
--     constraint ensures a retried insert is rejected at the DB level
--     so the function can return the already-committed state instead of
--     double-applying the move.
--
-- NOTE: The old Edge Function used a non-atomic COUNT → INSERT pattern,
-- so duplicate (room_id, move_number) rows can exist.  Step 1 repairs
-- them by reassigning move_numbers within each room using insertion order
-- before the unique constraint is applied.
-- ============================================================

-- 1. Repair any duplicate move_numbers left by the old non-atomic insert.
--    Rows are renumbered 1…N within each room ordered by (created_at, id).
--    Finished / test rooms that were never played will have no rows; live
--    rooms in progress get a clean sequential sequence.
with ranked as (
  select id,
         row_number() over (
           partition by room_id
           order by created_at, id
         ) as new_move_number
  from public.move_log
)
update public.move_log ml
set    move_number = r.new_move_number
from   ranked r
where  ml.id = r.id;

-- 2. Unique move sequence per room (safe now that duplicates are gone)
alter table public.move_log
  add constraint move_log_room_seq_unique unique (room_id, move_number);

-- 3. Idempotency key column (nullable — older clients don't send it).
--    PostgreSQL treats each NULL as distinct, so multiple NULL values are
--    allowed by the unique index.
alter table public.move_log
  add column if not exists idempotency_key text,
  add constraint move_log_idempotency_key_unique unique (idempotency_key);
