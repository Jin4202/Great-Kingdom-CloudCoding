# Great Kingdom — Future Work Checklist

## 🐛 Game Logic Bugs

- [x] **Edge territory is excluded** — Removed `touchesEdge` guard. Board edges now act as walls (like neutral pieces), and territory is awarded solely when `hasBlue && !hasOrange` or vice-versa. Open regions that touch the edge but have no surrounding pieces remain untouched.

- [x] **Piece count limit not enforced** — Added `bluePieces` / `orangePieces` counters to state; `placeStone` returns `null` when a player has already placed `MAX_PIECES` (40).

- [x] **Territory not recomputed after `passTurn`** — `passTurn` now calls `computeTerritory` on the current board before determining the winner when both players pass.

- [x] **Suicide moves not considered** — Decision: **not allowed**. `placeStone` checks if the placed group has 0 liberties after placement; if so and no enemy capture occurred, the move is rejected (`null`).

---

## ✅ Rules to Verify with Real Play

- [ ] **Eye rule via no-entry** — The eye rule (§4-5) is currently implemented *implicitly*: enclosed territory → no-entry → group can't be captured. Verify this holds correctly for edge groups once the edge territory bug is fixed.

- [ ] **Territory containing neutral castle** — §4-4 says neutral castle inside an enclosure still counts as territory. Confirm the BFS correctly treats neutral as a wall (stops expansion) and doesn't subtract the neutral cell from the count. Currently neutral stops BFS but isn't subtracted — which matches the rule.

- [ ] **Both-player enclosure** — An enclosed empty region bordered by both Blue and Orange is correctly not counted as territory. Verify this renders correctly on the board (no tint).

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

## 🔮 Future / Nice-to-Have

- [ ] **Online multiplayer** — WebSocket or peer-to-peer via WebRTC.
- [ ] **Game replay** — Step through a completed game.
- [ ] **Handicap / variant modes** — Different komi values or piece counts.
- [ ] **Accessibility** — Keyboard navigation, screen reader labels (coordinates are already on `aria-label`, but focus management is missing).
