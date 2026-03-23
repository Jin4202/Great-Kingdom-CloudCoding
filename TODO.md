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

- [ ] **Mobile / responsive layout** — Board is hardcoded at `52px × 9 = 468px`. Needs fluid sizing (`min(52px, calc(100vw / 10))`) to fit smaller screens.

- [x] **Clearer no-entry visual** — Opponent territory cells use a distinct tint (`.blocked`). Suicide cells show a red tint with a `×` marker (`.suicide`), clearly distinct from territory blocks.

- [ ] **Piece placement animation** — A short scale-in animation on stone placement would improve feel.

- [ ] **Pass warning** — If a player passes when they have good moves available, show a confirmation ("Are you sure you want to pass?").

- [ ] **Win overlay** — Replace the status bar text with a centered modal/overlay for game-over state.

---

## 🧪 Testing

- [ ] **Unit tests for `gameLogic.js`** — Critical cases to cover:
  - Capture detection (win by capture)
  - Territory calculation: interior only, edge groups, neutral-castle-bounded
  - No-entry enforcement
  - Both-pass → territory win with komi
  - Piece count limits
  - Capture of multi-piece groups

---

## 🔮 Future / Nice-to-Have

- [ ] **Online multiplayer** — WebSocket or peer-to-peer via WebRTC.
- [ ] **Game replay** — Step through a completed game.
- [ ] **Handicap / variant modes** — Different komi values or piece counts.
- [ ] **Accessibility** — Keyboard navigation, screen reader labels (coordinates are already on `aria-label`, but focus management is missing).
