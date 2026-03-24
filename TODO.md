# Great Kingdom — Future Work Checklist

## 🐛 Game Logic Bugs

- [x] **Edge territory is excluded** — Removed `touchesEdge` guard. Board edges now act as walls (like neutral pieces), and territory is awarded solely when `hasBlue && !hasOrange` or vice-versa. Open regions that touch the edge but have no surrounding pieces remain untouched.

- [x] **Piece count limit not enforced** — Added `bluePieces` / `orangePieces` counters to state; `placeStone` returns `null` when a player has already placed `MAX_PIECES` (40).

- [x] **Territory not recomputed after `passTurn`** — `passTurn` now calls `computeTerritory` on the current board before determining the winner when both players pass.

- [x] **Suicide moves not considered** — Decision: **not allowed**. `placeStone` checks if the placed group has 0 liberties after placement; if so and no enemy capture occurred, the move is rejected (`null`).

---

## 🎮 Missing Features

- [x] **Piece counter HUD** — `bluePieces` / `orangePieces` from state displayed in a `pieces-bar` above the status line; counts down from 40 as pieces are placed.

- [x] **Undo / take-back** — `history` stack in `App`; every successful move pushes the previous state; Undo button pops it. Disabled when stack is empty. Reset clears the stack.

- [x] **Move history log** — `MoveLog` component in a side panel next to the board. Entries record player, move type (place/pass), and coordinate (e.g. `E5`). Auto-scrolls to latest. Undo removes the last entry in sync.

- [x] **Tutorial / rules overlay** — `RulesOverlay` modal opened by `?` button next to the title. Covers goal, placement restrictions (including suicide indicator), territory rules, alive groups, and key differences from Go. Closes on backdrop click or `✕`.

---

## 🖥️ UI / UX

- [x] **Mobile / responsive layout** — Cell size is now `min(52px, calc((100vw - 96px) / 10))` via a `--cell` CSS custom property on `.wrapper`. Piece, ghost, dot, and `×` sizes all scale with `--cell`. `board-area` wraps so the move log stacks below the board on small screens.

- [x] **Clearer no-entry visual** — Opponent territory cells use a distinct tint (`.blocked`). Suicide cells show a red tint with a `×` marker (`.suicide`), clearly distinct from territory blocks.

- [x] **Piece placement animation** — `@keyframes pieceEnter` scales piece from 0.25→1 in 140 ms. Applied via `.pieceNew` on the last-placed piece (`isLast`).

- [x] **Pass warning** — `handlePass` checks `hasAvailableMoves()` before passing. If moves exist, sets `confirmingPass` state and renders an inline confirmation banner ("Yes, Pass" / "Cancel"). Clears on any board click or cancel.

- [x] **Win overlay** — `WinOverlay` modal appears automatically on game end (capture or territory). Shows winner, reason, territory scores (for territory wins), and "New Game" / "Review Board" buttons.

---

## 🧪 Testing

- [x] **Unit tests for `gameLogic.js`** — 26 tests across 6 suites using Vitest:
  - `createInitialState` — neutral castle, starting turn, zero territory
  - `placeStone` — basic placement, occupied/neutral cell rejection, piece counters, passCount reset
  - Piece count limit — placement rejected after 40 pieces placed
  - No-entry — null returned when placing in opponent's confirmed territory
  - Suicide — single piece, isSuicideMove helper, capture-overrides-suicide
  - Capture win — single piece, multi-piece group
  - `computeTerritory` — interior pocket, corner (2 edges), contested region, all-4-edges open board, neutral-as-wall, neutral cell ownership
  - `passTurn` — passCount, turn switch, double-pass game end, komi (Orange wins on tie, Blue wins with lead), stale territory recompute

---

## 🌐 Multiplayer (Planned)

**Tech stack:** Supabase (Postgres + Realtime + anonymous auth) + `react-router-dom`

**Architecture:** `gameLogic.js` stays unchanged. State moves from local `useState` to Supabase; only the active player can write; both players receive updates via realtime subscription.

### Phase 1 — Supabase Setup
- [x] Create Supabase project, get `SUPABASE_URL` + `SUPABASE_ANON_KEY` *(manual — dashboard)*
- [x] Create `rooms` table (`id`, `code`, `status`, `blue_user`, `orange_user`) — SQL in `supabase/schema.sql`
- [x] Create `game_states` table (`room_id`, `board`, `territory`, `turn`, `pass_count`, `blue_pieces`, `orange_pieces`, `game_over`, `winner`, `win_reason`, `last_move`, timestamps) — SQL in `supabase/schema.sql`
- [x] Create `move_log` table (`room_id`, `move_number`, `player`, `type`, `row`, `col`) — SQL in `supabase/schema.sql`
- [x] Run `supabase/schema.sql` in Supabase SQL Editor *(manual — dashboard)*
- [x] Enable Realtime on `rooms` + `game_states` tables *(manual — Database → Replication)*
- [x] Create `great-kingdom-app/.env.local` with placeholder env vars (gitignored via `*.local`)

### Phase 2 — Supabase Client + Auth
- [x] Install `@supabase/supabase-js`
- [x] Create `src/lib/supabase.js` — singleton client from `import.meta.env`
- [x] Anonymous sign-in (`supabase.auth.signInAnonymously()`) — `ensureAuth()` helper in `src/lib/supabase.js`

### Phase 3 — Lobby + Waiting Room UI
- [x] Install `react-router-dom`, add 4 routes: `/` (Lobby), `/play` (local), `/room/:code/wait` (WaitingRoom), `/room/:code/play` (online)
- [x] Create `src/components/Lobby.jsx` — Local 2-Player / Create Game / Join Game with code input
- [x] Create `src/components/WaitingRoom.jsx` — display 6-char room code, copy button, pulse indicator, realtime subscription
- [x] Create Game flow: generate 6-char code → insert `rooms` + initial `game_states` → navigate to WaitingRoom → subscribe for opponent joining
- [x] Join Game flow: lookup room by code → validate status/ownership → update `orange_user` + status → navigate to game
- [x] Update `App.jsx` — add `mode` prop, Back button, online badge, disable Undo in online mode

### Phase 4 — Game State Sync (core)
- [x] Create `src/hooks/useRoom.js`:
  - Fetch room + `game_states` on mount, resolve `myColor` from `blue_user`/`orange_user`
  - Subscribe to realtime `UPDATE` on `game_states` → update local React state
  - Expose `gameState`, `myColor`, `isMyTurn`, `status`, `error`, `dispatchMove`, `dispatchPass`
- [x] `dispatchMove`: guard `isMyTurn` → `placeStone()` → optimistic update → upsert to Supabase → insert `move_log` row
- [x] `dispatchPass`: guard `isMyTurn` → `passTurn()` → optimistic update → upsert to Supabase → insert `move_log` row
- [x] Create `src/components/OnlineGame.jsx` — full game UI wired to `useRoom`; derives move log from state diffs; shows "Your turn" / "Waiting for opponent…"; connecting/error screens
- [x] Route `/room/:code/play` → `OnlineGame` (replaces `App mode="online"` placeholder)

### Phase 5 — Turn Enforcement + Color Assignment
- [x] Compare `user.id` vs `rooms.blue_user` / `orange_user` to determine `myColor` *(done in Phase 4 — `useRoom.js`)*
- [x] Add `isOpponentTurn` prop to `Board.jsx` — disables all cell clicks and hover effects
- [x] Disable Undo button entirely in online mode *(done in Phase 4 — `OnlineGame.jsx` has no Undo)*
- [x] Status bar shows "Waiting for opponent…" when it's not your turn *(done in Phase 4 — `OnlineGame.jsx`)*

### Phase 6 — Connection + Error Handling
- [ ] "Connecting..." overlay while subscription establishes
- [ ] Detect `CHANNEL_ERROR` / `CLOSED` → show "Connection lost — reconnecting..." banner
- [ ] Use Supabase Presence to detect opponent tab close → show "Opponent disconnected" warning
- [ ] Handle room-not-found and already-full errors in Join flow

### Phase 7 — Routing
- [ ] Wrap `main.jsx` with `BrowserRouter`, define the 3 routes
- [ ] Update `App.jsx` to accept `mode` prop (`'local'` | `'online'`) and branch accordingly

---

## 🔮 Future / Nice-to-Have

- [ ] **Game replay** — Step through a completed game (move_log table already planned).
- [ ] **Handicap / variant modes** — Different komi values or piece counts.
- [ ] **Accessibility** — Keyboard navigation, screen reader labels (coordinates are already on `aria-label`, but focus management is missing).
- [ ] **Server-side move validation** — Move game logic to a Supabase Edge Function to prevent cheating.
