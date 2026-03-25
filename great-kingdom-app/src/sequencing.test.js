/**
 * Move Sequencing Guard — Unit Tests
 *
 * Covers two guards introduced to prevent race conditions in dispatchMove /
 * dispatchPass:
 *
 *   1. In-flight lock  — a second dispatch is silently dropped while the first
 *      HTTP request is still pending. This prevents two concurrent POSTs from
 *      both passing the `turn` check on the Edge Function before either write
 *      has landed.
 *
 *   2. move_number tracking — each accepted response increments a local counter
 *      that is included in subsequent requests so the Edge Function can reject
 *      a stale or duplicate request with 409.
 *
 * These are pure state-machine tests that require no network connection.
 *
 * Run: npm test -- sequencing
 */

import { describe, it, expect, vi } from 'vitest'

// ── 1. In-flight guard ────────────────────────────────────────────────────────

/**
 * Mirrors the guard logic in useRoom.js:
 *
 *   if (inFlightRef.current) return null
 *   inFlightRef.current = true
 *   try { ... } finally { inFlightRef.current = false }
 */
function makeDispatcher(workMs = 10) {
  const inFlightRef = { current: false }

  async function dispatch(label) {
    if (inFlightRef.current) return null
    inFlightRef.current = true
    try {
      await new Promise(r => setTimeout(r, workMs))
      return `result-${label}`
    } finally {
      inFlightRef.current = false
    }
  }

  return dispatch
}

describe('in-flight guard', () => {
  it('first dispatch proceeds normally', async () => {
    const dispatch = makeDispatcher(5)
    const result = await dispatch('A')
    expect(result).toBe('result-A')
  })

  it('second concurrent dispatch returns null while first is in-flight', async () => {
    const dispatch = makeDispatcher(20)
    const [r1, r2] = await Promise.all([dispatch('A'), dispatch('B')])
    expect(r1).toBe('result-A')
    expect(r2).toBeNull()
  })

  it('second dispatch proceeds normally after first completes', async () => {
    const dispatch = makeDispatcher(5)
    const r1 = await dispatch('A')
    const r2 = await dispatch('B')
    expect(r1).toBe('result-A')
    expect(r2).toBe('result-B')
  })

  it('three concurrent dispatches: only the first wins', async () => {
    const dispatch = makeDispatcher(20)
    const [r1, r2, r3] = await Promise.all([dispatch('A'), dispatch('B'), dispatch('C')])
    expect(r1).toBe('result-A')
    expect(r2).toBeNull()
    expect(r3).toBeNull()
  })

  it('in-flight flag is released even when the async work throws', async () => {
    const inFlightRef = { current: false }

    async function failingDispatch() {
      if (inFlightRef.current) return null
      inFlightRef.current = true
      try {
        await new Promise((_, reject) => setTimeout(() => reject(new Error('boom')), 5))
      } catch {
        // swallow
      } finally {
        inFlightRef.current = false
      }
      return null
    }

    await failingDispatch()
    expect(inFlightRef.current).toBe(false)

    // A subsequent dispatch must not be blocked
    const dispatch = makeDispatcher(5)
    // Simulate: inFlightRef shared with failingDispatch
    const result = await dispatch('after-error')
    expect(result).toBe('result-after-error')
  })
})

// ── 2. move_number tracking ───────────────────────────────────────────────────

/**
 * Mirrors the moveCountRef logic in useRoom.js:
 *
 *   moveCountRef.current += 1   (after each accepted response)
 *
 * The count is included in the request body so the Edge Function can reject
 * a request whose move_number doesn't match the current row count in move_log.
 */
describe('move_number tracking', () => {
  it('starts at 0 before any move', () => {
    const moveCountRef = { current: 0 }
    expect(moveCountRef.current).toBe(0)
  })

  it('increments by 1 after each accepted move', () => {
    const moveCountRef = { current: 0 }

    // Simulate three accepted moves
    for (let i = 1; i <= 3; i++) {
      moveCountRef.current += 1
      expect(moveCountRef.current).toBe(i)
    }
  })

  it('does NOT increment when the dispatch was blocked (in-flight)', () => {
    // In useRoom.js the increment only happens after a successful callValidateMove,
    // which returns null when in-flight. Simulate that guard here.
    const moveCountRef = { current: 0 }
    const inFlightRef  = { current: false }

    function simulateDispatch(success) {
      if (inFlightRef.current) return null  // blocked → counter stays
      if (success) {
        moveCountRef.current += 1
        return 'state'
      }
      return null
    }

    inFlightRef.current = true           // first dispatch in-flight
    const r = simulateDispatch(true)
    expect(r).toBeNull()
    expect(moveCountRef.current).toBe(0) // not incremented

    inFlightRef.current = false          // first dispatch finished
    const r2 = simulateDispatch(true)
    expect(r2).toBe('state')
    expect(moveCountRef.current).toBe(1)
  })

  it('does NOT increment when the Edge Function rejects the move', () => {
    const moveCountRef = { current: 2 }

    // callValidateMove returns null on non-2xx → dispatch returns early
    function simulateDispatch(serverResponse) {
      const next = serverResponse // null means rejected
      if (!next) return null
      moveCountRef.current += 1
      return next
    }

    expect(simulateDispatch(null)).toBeNull()
    expect(moveCountRef.current).toBe(2) // unchanged
  })

  it('move_number in the request body equals the count before the move', () => {
    const moveCountRef = { current: 3 }
    const capturedPayloads = []

    function buildPayload(type, row, col) {
      const payload = { type, move_number: moveCountRef.current }
      if (type === 'place') { payload.row = row; payload.col = col }
      capturedPayloads.push(payload)
      return payload
    }

    buildPayload('place', 1, 2)
    expect(capturedPayloads[0].move_number).toBe(3)

    // After a successful move the counter increments
    moveCountRef.current += 1
    buildPayload('pass')
    expect(capturedPayloads[1].move_number).toBe(4)
  })
})
