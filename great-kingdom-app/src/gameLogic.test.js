import { describe, it, expect } from 'vitest';
import {
  EMPTY, BLUE, RED, NEUTRAL,
  BOARD_SIZE, CENTER, MAX_PIECES,
  computeTerritory,
  isSuicideMove,
  createInitialBoard,
  createInitialState,
  placeStone,
  passTurn,
} from './gameLogic';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a blank 9×9 board (no neutral castle). */
function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
}

/**
 * Place a list of pieces onto a board without going through game logic.
 * pieces: [{ r, c, player }]
 */
function place(board, pieces) {
  const b = board.map((row) => [...row]);
  for (const { r, c, player } of pieces) b[r][c] = player;
  return b;
}

/** Advance state by placing a sequence of [row, col] moves alternating turns. */
function playMoves(moves) {
  let state = createInitialState();
  for (const [r, c] of moves) {
    const next = placeStone(state, r, c);
    expect(next).not.toBeNull(); // move must be legal
    state = next;
  }
  return state;
}

// ── createInitialState ─────────────────────────────────────────────────────────

describe('createInitialState', () => {
  it('places neutral castle at center', () => {
    const { board } = createInitialState();
    expect(board[CENTER][CENTER]).toBe(NEUTRAL);
  });

  it('starts on Blue turn with zero pieces placed', () => {
    const s = createInitialState();
    expect(s.turn).toBe(BLUE);
    expect(s.bluePieces).toBe(0);
    expect(s.redPieces).toBe(0);
  });

  it('starts with no territory and game not over', () => {
    const s = createInitialState();
    expect(s.gameOver).toBe(false);
    expect(s.blueTerritory).toBe(0);
    expect(s.redTerritory).toBe(0);
  });
});

// ── placeStone — basic rules ───────────────────────────────────────────────────

describe('placeStone — basic placement', () => {
  it('places a piece and switches turn', () => {
    const s = createInitialState();
    const next = placeStone(s, 0, 0);
    expect(next).not.toBeNull();
    expect(next.board[0][0]).toBe(BLUE);
    expect(next.turn).toBe(RED);
  });

  it('returns null when placing on an occupied cell', () => {
    const s = createInitialState();
    const s2 = placeStone(s, 0, 0);
    expect(placeStone(s2, 0, 0)).toBeNull();
  });

  it('returns null when placing on the neutral castle', () => {
    const s = createInitialState();
    expect(placeStone(s, CENTER, CENTER)).toBeNull();
  });

  it('increments the correct piece counter', () => {
    const s = createInitialState();
    const s2 = placeStone(s, 0, 0);   // Blue
    const s3 = placeStone(s2, 0, 1);  // Red
    expect(s3.bluePieces).toBe(1);
    expect(s3.redPieces).toBe(1);
  });

  it('resets passCount to 0 after a placement', () => {
    let s = createInitialState();
    s = passTurn(s);               // passCount = 1
    s = placeStone(s, 0, 0);       // Blue places — passCount resets
    expect(s.passCount).toBe(0);
  });
});

// ── Piece count limit ──────────────────────────────────────────────────────────

describe('placeStone — piece count limit', () => {
  it('returns null when a player has used all 40 pieces', () => {
    let state = createInitialState();
    // Alternate placements filling the first 40 blue + 40 red positions
    // across rows 0–7 (72 cells, well within limits and no captures possible)
    let placed = 0;
    outer: for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (r === CENTER && c === CENTER) continue; // skip neutral
        const next = placeStone(state, r, c);
        if (next) { state = next; placed++; }
        if (placed >= 80) break outer; // 40 blue + 40 red
      }
    }
    // Whoever's turn it is should have exhausted their 40 pieces.
    // Find an empty cell and confirm placement is rejected.
    let rejected = false;
    for (let r = 0; r < BOARD_SIZE && !rejected; r++) {
      for (let c = 0; c < BOARD_SIZE && !rejected; c++) {
        if (state.board[r][c] === EMPTY) {
          const attempt = placeStone(state, r, c);
          if (attempt === null) rejected = true;
        }
      }
    }
    expect(rejected).toBe(true);
  });
});

// ── No-entry (opponent territory) ─────────────────────────────────────────────

describe('placeStone — no-entry into opponent territory', () => {
  it('returns null when placing inside opponent confirmed territory', () => {
    // Build a board where Blue encloses the top-left corner:
    // Blue pieces at (0,1) and (1,0); corner (0,0) becomes Blue territory.
    const board = place(emptyBoard(), [
      { r: 0, c: 1, player: BLUE },
      { r: 1, c: 0, player: BLUE },
    ]);
    const { territory } = computeTerritory(board);
    expect(territory[0][0]).toBe(BLUE);

    // Craft a state where it is Red's turn with that territory
    const state = {
      ...createInitialState(),
      board,
      territory,
      turn: RED,
    };
    expect(placeStone(state, 0, 0)).toBeNull();
  });
});

// ── Suicide ────────────────────────────────────────────────────────────────────

describe('placeStone — suicide prevention', () => {
  it('returns null for a single-piece suicide into a fully surrounded cell', () => {
    // Surround (1,1) with Blue on all 4 sides; Red tries to play at (1,1)
    const board = place(emptyBoard(), [
      { r: 0, c: 1, player: BLUE },
      { r: 2, c: 1, player: BLUE },
      { r: 1, c: 0, player: BLUE },
      { r: 1, c: 2, player: BLUE },
    ]);
    const state = { ...createInitialState(), board, territory: computeTerritory(board).territory, turn: RED };
    expect(placeStone(state, 1, 1)).toBeNull();
  });

  it('isSuicideMove returns true for the same scenario', () => {
    const board = place(emptyBoard(), [
      { r: 0, c: 1, player: BLUE },
      { r: 2, c: 1, player: BLUE },
      { r: 1, c: 0, player: BLUE },
      { r: 1, c: 2, player: BLUE },
    ]);
    expect(isSuicideMove(board, 1, 1, RED)).toBe(true);
  });

  it('isSuicideMove returns false for a move that captures (not suicide)', () => {
    // Blue piece at (1,1) surrounded by Red on 3 sides; Red completes at (1,0).
    // Placing Red at (1,0) captures Blue — not suicide.
    const board = place(emptyBoard(), [
      { r: 1, c: 1, player: BLUE },
      { r: 0, c: 1, player: RED },
      { r: 2, c: 1, player: RED },
      { r: 1, c: 2, player: RED },
    ]);
    expect(isSuicideMove(board, 1, 0, RED)).toBe(false);
  });
});

// ── Capture detection ──────────────────────────────────────────────────────────

describe('placeStone — capture win', () => {
  it('detects win when a single enemy piece is surrounded', () => {
    // Red piece at (1,1). Blue surrounds it from 3 sides then closes.
    const s0 = createInitialState();
    // Manually set up the board: Red at (1,1), Blue at (0,1),(2,1),(1,2)
    const board = place(emptyBoard(), [
      { r: 1, c: 1, player: RED },
      { r: 0, c: 1, player: BLUE },
      { r: 2, c: 1, player: BLUE },
      { r: 1, c: 2, player: BLUE },
    ]);
    board[CENTER][CENTER] = NEUTRAL;
    const state = {
      ...s0,
      board,
      territory: computeTerritory(board).territory,
      turn: BLUE,
    };
    // Blue plays (1,0) — completes the encirclement
    const next = placeStone(state, 1, 0);
    expect(next).not.toBeNull();
    expect(next.gameOver).toBe(true);
    expect(next.winner).toBe(BLUE);
    expect(next.winReason).toBe('capture');
  });

  it('detects win when a multi-piece enemy group is surrounded', () => {
    // Two Red pieces at (1,1) and (1,2) surrounded by Blue
    const board = place(emptyBoard(), [
      { r: 1, c: 1, player: RED },
      { r: 1, c: 2, player: RED },
      // Blue walls
      { r: 0, c: 1, player: BLUE },
      { r: 0, c: 2, player: BLUE },
      { r: 1, c: 3, player: BLUE },
      { r: 2, c: 1, player: BLUE },
      { r: 2, c: 2, player: BLUE },
    ]);
    board[CENTER][CENTER] = NEUTRAL;
    const state = {
      ...createInitialState(),
      board,
      territory: computeTerritory(board).territory,
      turn: BLUE,
    };
    const next = placeStone(state, 1, 0);
    expect(next.gameOver).toBe(true);
    expect(next.winner).toBe(BLUE);
    expect(next.winReason).toBe('capture');
  });
});

// ── Territory calculation ──────────────────────────────────────────────────────

describe('computeTerritory', () => {
  it('counts an interior pocket as territory', () => {
    // Blue pieces completely surrounding (4,3) interior cell
    const board = place(emptyBoard(), [
      { r: 3, c: 3, player: BLUE },
      { r: 5, c: 3, player: BLUE },
      { r: 4, c: 2, player: BLUE },
      { r: 4, c: 4, player: BLUE },
    ]);
    const { territory, blueCount } = computeTerritory(board);
    expect(territory[4][3]).toBe(BLUE);
    expect(blueCount).toBeGreaterThanOrEqual(1);
  });

  it('counts a corner region as territory (2 edges)', () => {
    // Blue pieces at (0,1) and (1,0) enclose (0,0)
    const board = place(emptyBoard(), [
      { r: 0, c: 1, player: BLUE },
      { r: 1, c: 0, player: BLUE },
    ]);
    const { territory } = computeTerritory(board);
    expect(territory[0][0]).toBe(BLUE);
  });

  it('does not count a region bordered by both players', () => {
    // Empty cell (1,1) bordered by Blue on top/left and Red on bottom/right
    const board = place(emptyBoard(), [
      { r: 0, c: 1, player: BLUE },
      { r: 1, c: 0, player: BLUE },
      { r: 2, c: 1, player: RED },
      { r: 1, c: 2, player: RED },
    ]);
    const { territory } = computeTerritory(board);
    expect(territory[1][1]).toBe(EMPTY);
  });

  it('does not count a region touching all 4 edges (open board)', () => {
    // Mostly empty board — the open region touches all 4 edges
    const board = place(emptyBoard(), [
      { r: 4, c: 4, player: BLUE }, // single piece, not an enclosure
    ]);
    const { territory, blueCount } = computeTerritory(board);
    // The entire open region touches all 4 edges → not territory
    expect(blueCount).toBe(0);
  });

  it('treats neutral castle as a wall and counts surrounded area', () => {
    // Blue pieces around the neutral castle at (CENTER, CENTER) create a pocket
    // Surround (CENTER, CENTER-1) with Blue + neutral acting as right wall
    const board = createInitialBoard(); // has neutral at (4,4)
    const b = place(board, [
      { r: CENTER - 1, c: CENTER - 1, player: BLUE },
      { r: CENTER + 1, c: CENTER - 1, player: BLUE },
      { r: CENTER, c: CENTER - 2, player: BLUE },
    ]);
    const { territory } = computeTerritory(b);
    // (CENTER, CENTER-1) is enclosed by Blue pieces and the neutral castle
    expect(territory[CENTER][CENTER - 1]).toBe(BLUE);
  });

  it('does not subtract the neutral cell from territory count', () => {
    // The neutral castle cell itself is not EMPTY so BFS never visits it —
    // confirm it stays 0 (no ownership) in the territory grid
    const { territory } = computeTerritory(createInitialBoard());
    expect(territory[CENTER][CENTER]).toBe(EMPTY);
  });
});

// ── passTurn / territory win ───────────────────────────────────────────────────

describe('passTurn', () => {
  it('increments passCount and switches turn', () => {
    const s = createInitialState();
    const s2 = passTurn(s);
    expect(s2.passCount).toBe(1);
    expect(s2.turn).toBe(RED);
  });

  it('ends the game after two consecutive passes', () => {
    const s = createInitialState();
    const s2 = passTurn(passTurn(s));
    expect(s2.gameOver).toBe(true);
    expect(s2.winReason).toBe('territory');
  });

  it('Red wins territory when scores are equal (Blue needs +3)', () => {
    const s = createInitialState();
    const end = passTurn(passTurn(s));
    // Both have 0 territory → Blue doesn't reach +3 → Red wins
    expect(end.winner).toBe(RED);
  });

  it('Blue wins territory when Blue has enough lead', () => {
    // Give Blue a large interior territory; Orange has none
    // 3×3 pocket enclosed entirely by Blue in the top-left area
    const board = place(emptyBoard(), [
      { r: 0, c: 3, player: BLUE },
      { r: 1, c: 3, player: BLUE },
      { r: 2, c: 3, player: BLUE },
      { r: 3, c: 0, player: BLUE },
      { r: 3, c: 1, player: BLUE },
      { r: 3, c: 2, player: BLUE },
      { r: 3, c: 3, player: BLUE },
    ]);
    board[CENTER][CENTER] = NEUTRAL;
    const { blueCount } = computeTerritory(board);
    expect(blueCount).toBeGreaterThanOrEqual(3); // at least the 3×3 = 9 cells

    const state = {
      ...createInitialState(),
      board,
      territory: computeTerritory(board).territory,
      blueTerritory: blueCount,
      redTerritory: 0,
      passCount: 1, // Red already passed
      turn: BLUE,
    };
    const end = passTurn(state); // Blue passes → game over
    expect(end.gameOver).toBe(true);
    expect(end.winner).toBe(BLUE);
  });

  it('recomputes territory at game end (not stale from last placement)', () => {
    // Build a state where blueTerritory is stale (0) but actual territory is large.
    const board = place(emptyBoard(), [
      { r: 0, c: 3, player: BLUE },
      { r: 1, c: 3, player: BLUE },
      { r: 2, c: 3, player: BLUE },
      { r: 3, c: 0, player: BLUE },
      { r: 3, c: 1, player: BLUE },
      { r: 3, c: 2, player: BLUE },
      { r: 3, c: 3, player: BLUE },
    ]);
    board[CENTER][CENTER] = NEUTRAL;
    const staleState = {
      ...createInitialState(),
      board,
      territory: computeTerritory(board).territory,
      blueTerritory: 0,   // intentionally stale
      redTerritory: 0,
      passCount: 1,
      turn: BLUE,
    };
    const end = passTurn(staleState);
    // Fresh recompute should make Blue win
    expect(end.blueTerritory).toBeGreaterThan(0);
    expect(end.winner).toBe(BLUE);
  });
});
