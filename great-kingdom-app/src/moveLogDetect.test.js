/**
 * Unit tests for detectMoveLogEntry — the pure function that decides whether
 * a new move-log entry should be appended after a gameState update.
 *
 * The key regression covered here is the duplicate-entry bug caused by
 * JSON.stringify key-order sensitivity: the edge function returns
 * lastMove as {row, col} while Supabase postgres_changes may return the
 * same value as {col, row}, making the string representations differ even
 * though the coordinates are identical.
 *
 * Run: npm test -- moveLogDetect
 */

import { describe, it, expect } from 'vitest'
import { detectMoveLogEntry } from './moveLogDetect'

const BLUE = 1
const RED  = 2

function makeState(overrides = {}) {
  return {
    turn:      BLUE,
    lastMove:  null,
    passCount: 0,
    gameOver:  false,
    ...overrides,
  }
}

// ── placements ────────────────────────────────────────────────────────────────

describe('detectMoveLogEntry — placements', () => {

  it('returns a place entry for the first move (lastMove was null)', () => {
    const prev     = makeState({ turn: BLUE,   lastMove: null })
    const next     = makeState({ turn: RED, lastMove: { row: 3, col: 5 } })
    const lastLogged = { lastMove: null, passCount: 0 }

    const entry = detectMoveLogEntry(prev, next, lastLogged)

    expect(entry).not.toBeNull()
    expect(entry.player).toBe(BLUE)
    expect(entry.type).toBe('place')
    expect(entry.lastMove).toEqual({ row: 3, col: 5 })
  })

  it('returns null when called again with the same lastMove (optimistic vs realtime — same key order)', () => {
    const prev       = makeState({ turn: RED, lastMove: { row: 3, col: 5 } })
    const next       = makeState({ turn: RED, lastMove: { row: 3, col: 5 } })
    const lastLogged = { lastMove: { row: 3, col: 5 }, passCount: 0 }

    const entry = detectMoveLogEntry(prev, next, lastLogged)

    expect(entry).toBeNull()
  })

  it('returns null when the same coordinates arrive with different key order (the duplicate-log bug)', () => {
    // The edge function returns {row, col}; postgres_changes may return {col, row}.
    // JSON.stringify would treat these as different — direct comparison must not.
    const prev       = makeState({ turn: RED, lastMove: { row: 3, col: 5 } })
    const next       = makeState({ turn: RED, lastMove: { col: 5, row: 3 } }) // ← key-order flipped
    const lastLogged = { lastMove: { row: 3, col: 5 }, passCount: 0 }

    const entry = detectMoveLogEntry(prev, next, lastLogged)

    expect(entry).toBeNull()
  })

  it('returns an entry for a genuinely new move after the previous was logged', () => {
    const prev       = makeState({ turn: RED, lastMove: { row: 3, col: 5 } })
    const next       = makeState({ turn: BLUE,   lastMove: { row: 4, col: 6 } })
    const lastLogged = { lastMove: { row: 3, col: 5 }, passCount: 0 }

    const entry = detectMoveLogEntry(prev, next, lastLogged)

    expect(entry).not.toBeNull()
    expect(entry.player).toBe(RED)
    expect(entry.lastMove).toEqual({ row: 4, col: 6 })
  })

  it('returns null when there is no previous state (initial load)', () => {
    const next       = makeState({ turn: RED, lastMove: { row: 0, col: 0 } })
    const lastLogged = { lastMove: null, passCount: 0 }

    const entry = detectMoveLogEntry(null, next, lastLogged)

    expect(entry).toBeNull()
  })

})

// ── passes ────────────────────────────────────────────────────────────────────

describe('detectMoveLogEntry — passes', () => {

  it('returns a pass entry when passCount increments', () => {
    const prev       = makeState({ turn: BLUE, lastMove: null, passCount: 0 })
    const next       = makeState({ turn: RED,                  passCount: 1 })
    const lastLogged = { lastMove: null, passCount: 0 }

    const entry = detectMoveLogEntry(prev, next, lastLogged)

    expect(entry).not.toBeNull()
    expect(entry.player).toBe(BLUE)
    expect(entry.type).toBe('pass')
  })

  it('returns null when passCount is the same as lastLogged (duplicate pass event)', () => {
    const prev       = makeState({ turn: RED, lastMove: null, passCount: 1 })
    const next       = makeState({ turn: RED,                 passCount: 1 })
    const lastLogged = { lastMove: null, passCount: 1 }

    const entry = detectMoveLogEntry(prev, next, lastLogged)

    expect(entry).toBeNull()
  })

})
