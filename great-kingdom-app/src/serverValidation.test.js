/**
 * Server-Side Move Validation — Unit Tests
 *
 * These tests define the exact validation contract the Edge Function must enforce.
 * They run against gameLogic.js with no Supabase connection needed.
 *
 * The Edge Function handler will do exactly what `serverValidate` does here:
 *   1. Resolve caller's color from room.blue_user / room.orange_user
 *   2. Guard: callerColor === state.turn && !state.gameOver
 *   3. Bounds-check coordinates
 *   4. Call placeStone() or passTurn() — null → reject, state → accept
 */

import { describe, it, expect } from 'vitest'
import {
  EMPTY, BLUE, RED, NEUTRAL,
  BOARD_SIZE, CENTER, MAX_PIECES,
  computeTerritory,
  createInitialBoard,
  createInitialState,
  placeStone,
  passTurn,
} from './gameLogic'

// ── Spec helper — mirrors the Edge Function handler logic ────────────────────

/**
 * Simulates the Edge Function's core validation step.
 * Returns { ok: true, state } or { ok: false, error }.
 */
function serverValidate(state, callerColor, type, row = null, col = null) {
  if (state.turn !== callerColor) return { ok: false, error: 'not_your_turn' }
  if (state.gameOver)             return { ok: false, error: 'game_over' }

  if (type === 'pass') {
    return { ok: true, state: passTurn(state) }
  }

  // type === 'place'
  if (row == null || col == null || row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return { ok: false, error: 'out_of_bounds' }
  }

  const next = placeStone(state, row, col)
  if (!next) return { ok: false, error: 'illegal_move' }
  return { ok: true, state: next }
}

// ── Board helpers ─────────────────────────────────────────────────────────────

function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY))
}

function place(board, pieces) {
  const b = board.map(r => [...r])
  for (const { r, c, player } of pieces) b[r][c] = player
  return b
}

function stateWith(overrides) {
  return { ...createInitialState(), ...overrides }
}

// ── 1. Authorization / turn enforcement ──────────────────────────────────────

describe('server validation — turn enforcement', () => {
  it('accepts a placement from the correct-turn player', () => {
    const state = createInitialState() // Blue's turn
    const result = serverValidate(state, BLUE, 'place', 0, 0)
    expect(result.ok).toBe(true)
    expect(result.state.board[0][0]).toBe(BLUE)
  })

  it('rejects a placement from the wrong-turn player', () => {
    const state = createInitialState() // Blue's turn
    const result = serverValidate(state, RED, 'place', 0, 0)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('not_your_turn')
  })

  it('accepts Red after Blue has moved', () => {
    let state = createInitialState()
    state = placeStone(state, 0, 0) // Blue places → now Red's turn
    const result = serverValidate(state, RED, 'place', 0, 1)
    expect(result.ok).toBe(true)
    expect(result.state.board[0][1]).toBe(RED)
  })

  it('rejects Blue again when it is Red\'s turn', () => {
    let state = createInitialState()
    state = placeStone(state, 0, 0) // Blue → Red's turn
    const result = serverValidate(state, BLUE, 'place', 0, 1)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('not_your_turn')
  })
})

// ── 2. Game-over guard ────────────────────────────────────────────────────────

describe('server validation — game-over guard', () => {
  it('rejects any placement when game is already over', () => {
    const state = stateWith({ gameOver: true, winner: BLUE, winReason: 'capture', turn: RED })
    const result = serverValidate(state, RED, 'place', 0, 0)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('game_over')
  })

  it('rejects a pass when game is already over', () => {
    const state = stateWith({ gameOver: true, winner: RED, winReason: 'territory', turn: BLUE })
    const result = serverValidate(state, BLUE, 'pass')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('game_over')
  })
})

// ── 3. Input / bounds validation ─────────────────────────────────────────────

describe('server validation — input bounds', () => {
  it('rejects negative row', () => {
    const result = serverValidate(createInitialState(), BLUE, 'place', -1, 0)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('out_of_bounds')
  })

  it('rejects row >= BOARD_SIZE', () => {
    const result = serverValidate(createInitialState(), BLUE, 'place', BOARD_SIZE, 0)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('out_of_bounds')
  })

  it('rejects negative col', () => {
    const result = serverValidate(createInitialState(), BLUE, 'place', 0, -1)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('out_of_bounds')
  })

  it('rejects col >= BOARD_SIZE', () => {
    const result = serverValidate(createInitialState(), BLUE, 'place', 0, BOARD_SIZE)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('out_of_bounds')
  })

  it('rejects null coordinates for a place move', () => {
    const result = serverValidate(createInitialState(), BLUE, 'place', null, null)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('out_of_bounds')
  })
})

// ── 4. Illegal move rejection (key security boundary) ────────────────────────

describe('server validation — illegal move rejection', () => {
  it('rejects placement on an occupied cell', () => {
    let state = createInitialState()
    state = placeStone(state, 0, 0)          // Blue at (0,0)
    const result = serverValidate(state, RED, 'place', 0, 0)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('illegal_move')
  })

  it('rejects placement on the neutral castle', () => {
    const result = serverValidate(createInitialState(), BLUE, 'place', CENTER, CENTER)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('illegal_move')
  })

  it('rejects a suicide move', () => {
    // Surround (1,1) with Blue — Red cannot play there
    const board = place(emptyBoard(), [
      { r: 0, c: 1, player: BLUE },
      { r: 2, c: 1, player: BLUE },
      { r: 1, c: 0, player: BLUE },
      { r: 1, c: 2, player: BLUE },
    ])
    const state = stateWith({
      board,
      territory: computeTerritory(board).territory,
      turn: RED,
    })
    const result = serverValidate(state, RED, 'place', 1, 1)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('illegal_move')
  })

  it('rejects placement inside opponent confirmed territory', () => {
    // Blue encloses the top-left corner → (0,0) is Blue territory
    const board = place(emptyBoard(), [
      { r: 0, c: 1, player: BLUE },
      { r: 1, c: 0, player: BLUE },
    ])
    const { territory } = computeTerritory(board)
    expect(territory[0][0]).toBe(BLUE)
    const state = stateWith({ board, territory, turn: RED })
    const result = serverValidate(state, RED, 'place', 0, 0)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('illegal_move')
  })

  it('rejects placement when piece limit is reached', () => {
    // Fill 40 Blue + 40 Orange pieces; whoever's turn it is should be blocked
    let state = createInitialState()
    let placed = 0
    outer: for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (r === CENTER && c === CENTER) continue
        const next = placeStone(state, r, c)
        if (next) { state = next; placed++ }
        if (placed >= 80) break outer
      }
    }
    // Find any remaining empty cell and confirm server rejects it
    let rejected = false
    for (let r = 0; r < BOARD_SIZE && !rejected; r++) {
      for (let c = 0; c < BOARD_SIZE && !rejected; c++) {
        if (state.board[r][c] === EMPTY) {
          const result = serverValidate(state, state.turn, 'place', r, c)
          if (!result.ok) rejected = true
        }
      }
    }
    expect(rejected).toBe(true)
  })
})

// ── 5. Valid move acceptance ──────────────────────────────────────────────────

describe('server validation — valid move acceptance', () => {
  it('returns updated board state on legal placement', () => {
    const state = createInitialState()
    const result = serverValidate(state, BLUE, 'place', 3, 3)
    expect(result.ok).toBe(true)
    expect(result.state.board[3][3]).toBe(BLUE)
    expect(result.state.turn).toBe(RED)
    expect(result.state.bluePieces).toBe(1)
    expect(result.state.passCount).toBe(0)
  })

  it('detects capture win and sets gameOver in returned state', () => {
    // Red piece at (1,1); Blue has 3 sides; Blue completes at (1,0)
    const board = place(emptyBoard(), [
      { r: 1, c: 1, player: RED },
      { r: 0, c: 1, player: BLUE },
      { r: 2, c: 1, player: BLUE },
      { r: 1, c: 2, player: BLUE },
    ])
    board[CENTER][CENTER] = NEUTRAL
    const state = stateWith({ board, territory: computeTerritory(board).territory, turn: BLUE })
    const result = serverValidate(state, BLUE, 'place', 1, 0)
    expect(result.ok).toBe(true)
    expect(result.state.gameOver).toBe(true)
    expect(result.state.winner).toBe(BLUE)
    expect(result.state.winReason).toBe('capture')
  })

  it('a capture-overrides-suicide move is accepted by the server', () => {
    // Blue piece at (1,1) surrounded by Red — but Red (1,0) would also
    // capture Blue, so it is NOT a suicide move.
    const board = place(emptyBoard(), [
      { r: 1, c: 1, player: BLUE },
      { r: 0, c: 1, player: RED },
      { r: 2, c: 1, player: RED },
      { r: 1, c: 2, player: RED },
    ])
    const state = stateWith({
      board,
      territory: computeTerritory(board).territory,
      turn: RED,
      redPieces: 3,
    })
    const result = serverValidate(state, RED, 'place', 1, 0)
    expect(result.ok).toBe(true)
    expect(result.state.gameOver).toBe(true)
    expect(result.state.winner).toBe(RED)
  })
})

// ── 6. Pass flow ──────────────────────────────────────────────────────────────

describe('server validation — pass', () => {
  it('accepts a pass and switches turn', () => {
    const state = createInitialState()
    const result = serverValidate(state, BLUE, 'pass')
    expect(result.ok).toBe(true)
    expect(result.state.passCount).toBe(1)
    expect(result.state.turn).toBe(RED)
  })

  it('accepts a pass by Red on Red\'s turn', () => {
    let state = createInitialState()
    state = passTurn(state) // Blue passes → Red's turn
    const result = serverValidate(state, RED, 'pass')
    expect(result.ok).toBe(true)
    expect(result.state.passCount).toBe(2)
    expect(result.state.gameOver).toBe(true)
    expect(result.state.winReason).toBe('territory')
  })

  it('rejects a pass by the wrong-turn player', () => {
    const state = createInitialState() // Blue's turn
    const result = serverValidate(state, RED, 'pass')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('not_your_turn')
  })

  it('double pass ends the game and applies komi correctly', () => {
    const state = createInitialState()
    const afterBluePass = serverValidate(state, BLUE, 'pass')
    const afterRedPass  = serverValidate(afterBluePass.state, RED, 'pass')
    expect(afterRedPass.state.gameOver).toBe(true)
    // Both 0 territory → Blue needs ≥ red + 3 → Red wins
    expect(afterRedPass.state.winner).toBe(RED)
  })

  it('a pass resets passCount to 0 if the next player places a stone', () => {
    let state = createInitialState()
    state = passTurn(state)              // passCount = 1
    const result = serverValidate(state, RED, 'place', 0, 0)
    expect(result.ok).toBe(true)
    expect(result.state.passCount).toBe(0)
  })
})

// ── 7. State integrity (server must not accept a corrupt write) ───────────────

describe('server validation — state integrity', () => {
  it('returned state has the board matching the move', () => {
    const state = createInitialState()
    const result = serverValidate(state, BLUE, 'place', 5, 5)
    expect(result.ok).toBe(true)
    // All other cells must be unmodified
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (r === 5 && c === 5) {
          expect(result.state.board[r][c]).toBe(BLUE)
        } else if (r === CENTER && c === CENTER) {
          expect(result.state.board[r][c]).toBe(NEUTRAL)
        } else {
          expect(result.state.board[r][c]).toBe(EMPTY)
        }
      }
    }
  })

  it('territory array dimensions are always 9×9 in returned state', () => {
    const result = serverValidate(createInitialState(), BLUE, 'place', 0, 0)
    expect(result.state.territory.length).toBe(BOARD_SIZE)
    result.state.territory.forEach(row => expect(row.length).toBe(BOARD_SIZE))
  })

  it('piece counters never go negative or exceed MAX_PIECES', () => {
    let state = createInitialState()
    for (let i = 0; i < 5; i++) {
      const r = i
      const result = serverValidate(state, state.turn, 'place', r, 0)
      expect(result.ok).toBe(true)
      state = result.state
      expect(state.bluePieces).toBeGreaterThanOrEqual(0)
      expect(state.redPieces).toBeGreaterThanOrEqual(0)
      expect(state.bluePieces).toBeLessThanOrEqual(MAX_PIECES)
      expect(state.redPieces).toBeLessThanOrEqual(MAX_PIECES)
    }
  })
})
