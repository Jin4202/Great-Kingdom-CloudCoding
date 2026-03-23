# 🏰 Great Kingdom — Complete Rule Reference

> A strategic board game created by **Lee Se-dol (9-dan professional Go player)**, published by Korea Boardgames as part of the *Wizstone Series*  
> Detailed spec document for online game development

---

## 1. Overview

Great Kingdom is a **2-player strategy board game** inspired by Go (Baduk), simplified to lower the barrier to entry.  
Lee Se-dol spent approximately **20 months** developing the game by hand — attaching stickers to Go stones and coins — before finalizing the design.

> *"I simplified the concept of 'two eyes' into the concept of surrounding on all four sides to improve accessibility."*  
> — Lee Se-dol

- **Publisher**: Korea Boardgames (Wizstone Series, Vol. 1)
- **Players**: 2
- **Recommended Age**: 8+
- **Learning Curve**: ~3–4 months to master (vs. 2–3 years for Go)

---

## 2. Components

| Component | Qty | Notes |
|---|---|---|
| Game board | 1 | 9×9 grid (81 intersections) |
| Blue castles (pieces) | 40 | First player's pieces |
| Orange castles (pieces) | 40 | Second player's pieces |
| Neutral castle | 1 | Placed at the center of the board at game start |

> The game can also be played with a Go board and stones, provided a neutral stone is available and a 9×9 grid is marked.

---

## 3. Setup

1. **Place the board**: Lay out the 9×9 grid.
2. **Place the neutral castle**: Put the neutral castle on the **exact center square (row 5, column 5)**.
   - The neutral castle is treated identically to the board edge for all encirclement checks.
3. **Determine turn order**: Decide who goes first (e.g., by rock-paper-scissors).
4. **Distribute pieces**: First player takes **40 blue castles**; second player takes **40 orange castles**.

```
Initial board state (9×9, C = Neutral Castle)

┌─┬─┬─┬─┬─┬─┬─┬─┬─┐
│ │ │ │ │ │ │ │ │ │
├─┼─┼─┼─┼─┼─┼─┼─┼─┤
│ │ │ │ │ │ │ │ │ │
├─┼─┼─┼─┼─┼─┼─┼─┼─┤
│ │ │ │ │ │ │ │ │ │
├─┼─┼─┼─┼─┼─┼─┼─┼─┤
│ │ │ │ │ │ │ │ │ │
├─┼─┼─┼─┼─┼─┼─┼─┼─┤
│ │ │ │ │ C │ │ │ │
├─┼─┼─┼─┼─┼─┼─┼─┼─┤
│ │ │ │ │ │ │ │ │ │
├─┼─┼─┼─┼─┼─┼─┼─┼─┤
│ │ │ │ │ │ │ │ │ │
├─┼─┼─┼─┼─┼─┼─┼─┼─┤
│ │ │ │ │ │ │ │ │ │
├─┼─┼─┼─┼─┼─┼─┼─┼─┤
│ │ │ │ │ │ │ │ │ │
└─┴─┴─┴─┴─┴─┴─┴─┴─┘
```

---

## 4. Gameplay Rules

### 4-1. Turn Structure

Players alternate turns. On each turn, a player must do exactly one of the following:

1. **Place a piece**: Place one of your pieces on any legal empty square.
2. **Pass**: Forfeit your turn and pass to the opponent.

### 4-2. Placement Restrictions

- A player **cannot place a piece inside the opponent's completed territory**.
  - This makes securing territory much easier than in Go.
  - Even a single enclosed space (including a "false eye") is enough to make a group **alive** — the opponent cannot invade.

### 4-3. Encirclement Rules

- A piece or group is surrounded when all **orthogonal (up/down/left/right) neighbors** are occupied by enemy pieces, your own pieces, board edges, or the neutral castle.
- **Diagonal directions do not count** for encirclement.
- You may surround using any combination of: your own pieces, board edges, and/or the neutral castle.

### 4-4. Territory Rules

| Situation | Result |
|---|---|
| Empty square(s) enclosed by your pieces / edges | → Confirmed as **your territory** |
| Enclosed area contains an enemy piece | → **Not counted** as territory |
| Neutral castle is included in the enclosure | → **Counts** as territory |
| Area enclosed only by the 4 board edges (no pieces) | → **Not counted** as territory |

### 4-5. Alive vs. Dead Groups

| Rule | Go | Great Kingdom |
|---|---|---|
| Condition for alive group | Two independent eyes required | **One eye is enough** (even a false eye) |
| Edge survival | Typically needs 2+ eyes | **2 pieces** on the edge suffice |

Once a group is alive (has one enclosed space), the opponent **cannot place inside it**, making it permanently safe.

---

## 5. Win Conditions

### ✅ Instant Win (Highest Priority)

> If you **capture even a single enemy piece**, the game **ends immediately** and you win.

**How to capture**: Completely surround an enemy piece on all four orthogonal sides (using your pieces, board edges, or the neutral castle).

### ✅ Territory Win (After Game End)

When both players pass consecutively, the game ends and territory is counted.

| Condition | Winner |
|---|---|
| First player's territory ≥ Second player's territory + 3 | **First player wins** |
| First player's territory < Second player's territory + 3 | **Second player wins** |

> The **+3 handicap** compensates for the first-player advantage — equivalent to *komi* in Go.  
> A tie or a difference of 2 or fewer squares in the first player's favor still results in a **second player win**.

---

## 6. Loss Conditions

- Any of your pieces is **captured** → **Immediate loss**
- After territory count: first player has fewer than 3 more territories than the second player → **First player loses**

---

## 7. Game End Conditions

| Trigger | Outcome |
|---|---|
| Both players pass consecutively | Game ends → territory count → winner determined |
| A piece is captured | Game ends immediately → capturing player wins |

---

## 8. Key Differences from Go

| Rule | Go | Great Kingdom |
|---|---|---|
| Board size | 19×19 | **9×9** |
| Neutral stone | None | **1 piece at center** |
| Alive group condition | Two independent eyes | **One eye (even false)** |
| Placing inside opponent's territory | Allowed | **Not allowed** |
| Capturing a piece | Game continues | **Immediate game end** |
| Ko rule | Exists | **Does not exist** |
| Komi / handicap | ~6.5 points | **3 territories** |

---

## 9. Strategy Tips

- Prioritize **building your own territory** while keeping pressure on the opponent — don't focus purely on capturing.
- Aggressively invading enemy territory is **high risk, high reward**: if your invading piece is captured, you lose immediately.
- Use the **neutral castle** strategically — it acts as a wall and can be incorporated into your enclosures.
- **Second player has an advantage** at beginner level due to the komi structure.
- The small 9×9 board means you can be **cornered quickly** if you're not careful.

---

## 10. Online Implementation — Core Logic

### 10-1. Encirclement Detection

```
- After each piece placement, run a BFS/DFS flood-fill from the placed piece's neighbors
- Check whether any enemy piece group is fully surrounded on all 4 orthogonal sides
  by: enemy pieces, board edges, neutral castle, or own pieces
- If fully enclosed → capture triggered → instant win
```

### 10-2. Instant Win Trigger

```
- After every placement, check if any enemy piece is now fully surrounded
- If 1 or more enemy pieces are captured → end game immediately → current player wins
```

### 10-3. Placement Restriction (No-Entry Zones)

```
- After each move, recalculate all confirmed territory regions
- Mark opponent's confirmed territory squares as non-clickable / invalid placements
- Territory is confirmed when an enclosed area contains no enemy pieces
```

### 10-4. Territory Calculation (End of Game)

```
- Traverse all empty squares on the board
- For each empty square, run a flood-fill to identify its connected empty region
- Check all border cells of that region:
    - If ALL borders are: own pieces + edges + neutral castle → your territory
    - If ANY border is an enemy piece → not territory
    - If region is enclosed only by board edges (no pieces at all) → not territory
- Sum territory counts for each player
- Compare: if first_player_territory >= second_player_territory + 3 → first player wins
          else → second player wins
```

### 10-5. Game Flow

```
[Piece Placed]
      ↓
[Encirclement Check] → Enemy piece captured? → YES → Game Over: Current Player Wins
      ↓ NO
[Update Territory Regions]
      ↓
[Update No-Entry Zones for Opponent]
      ↓
[Switch Turn]
      ↓
[Both Players Passed Consecutively?] → YES → Territory Count → Final Result
      ↓ NO
[Continue Game]
```

### 10-6. Board State Data Model (Suggested)

```javascript
// Cell states
const EMPTY    = 0;
const BLUE     = 1;  // First player
const ORANGE   = 2;  // Second player
const NEUTRAL  = 3;  // Fixed at center

// Territory states (overlay)
const NO_TERRITORY  = 0;
const BLUE_TERR     = 1;
const ORANGE_TERR   = 2;

// Game state
{
  board: number[][],         // 9x9 grid of cell states
  territory: number[][],     // 9x9 grid of territory ownership
  turn: 'blue' | 'orange',
  passCount: number,         // Resets to 0 on any placement; game ends at 2
  blueTerritory: number,
  orangeTerritory: number,
  gameOver: boolean,
  winner: 'blue' | 'orange' | null
}
```

---

*References: Namu Wiki, Inven, Asia Times*
