# Great Kingdom — Future Work Checklist

## 🐛 Game Logic Bugs

- [ ] **Edge territory is excluded** — `touchesEdge` fix prevents any territory touching the board edge from counting. This breaks the "2 pieces on the edge suffice for an eye" rule (§4-5). Need a smarter fix: require at least one piece on the boundary **and** the region must have no escape to open space (i.e., `hasBlue || hasOrange` must be true, which the original code already does). The real fix for "open board ≠ territory" is `hasBlue || hasOrange` as the guard — not the edge check.

- [ ] **Piece count limit not enforced** — Each player has 40 pieces. Nothing prevents placing more than 40.

- [ ] **Territory not recomputed after `passTurn`** — If both players pass, `state.blueTerritory / orangeTerritory` reflect values from the last stone placement. Fine in most cases, but the counts should be recomputed at game end to be safe.

- [ ] **Suicide moves not considered** — Rules only restrict placing in opponent's territory (§4-2). No explicit rule on suicide. Verify the physical game's intent and decide: allow, forbid, or warn.

---

## ✅ Rules to Verify with Real Play

- [ ] **Eye rule via no-entry** — The eye rule (§4-5) is currently implemented *implicitly*: enclosed territory → no-entry → group can't be captured. Verify this holds correctly for edge groups once the edge territory bug is fixed.

- [ ] **Territory containing neutral castle** — §4-4 says neutral castle inside an enclosure still counts as territory. Confirm the BFS correctly treats neutral as a wall (stops expansion) and doesn't subtract the neutral cell from the count. Currently neutral stops BFS but isn't subtracted — which matches the rule.

- [ ] **Both-player enclosure** — An enclosed empty region bordered by both Blue and Orange is correctly not counted as territory. Verify this renders correctly on the board (no tint).

---

## 🎮 Missing Features

- [ ] **Piece counter HUD** — Show remaining pieces per player (40 − placed).

- [ ] **Undo / take-back** — Essential for casual play. Store move history as an array of states.

- [ ] **Move history log** — List of moves (e.g., "Blue → E5", "Orange → Pass") in a side panel.

- [ ] **Score breakdown on game end** — Show territory map, final counts, and effective score (Blue: X, Orange: Y, komi: −3, result: Z) instead of just the win banner.

- [ ] **AI opponent** — Even a random-move bot would allow solo testing. A greedy/heuristic bot would make it playable.

- [ ] **Tutorial / rules overlay** — In-game rule summary or step-by-step tutorial for new players.

---

## 🖥️ UI / UX

- [ ] **Mobile / responsive layout** — Board is hardcoded at `52px × 9 = 468px`. Needs fluid sizing (`min(52px, calc(100vw / 10))`) to fit smaller screens.

- [ ] **Clearer no-entry visual** — Blocked cells and territory cells use the same tint. Add a distinct pattern (e.g., `×` icon, striped overlay, or darker tint) to make "you can't play here" more obvious.

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
