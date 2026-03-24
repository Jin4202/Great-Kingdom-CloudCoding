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
  turn              int  not null default 1,     -- 1=BLUE, 2=ORANGE
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
  player        int  not null,                   -- 1=BLUE, 2=ORANGE
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
