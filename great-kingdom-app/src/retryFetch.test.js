/**
 * retryFetch — Unit Tests
 *
 * Covers the retry helper that wraps the validate-move Edge Function call:
 *
 *   - 2xx / 4xx responses are returned immediately (no retry)
 *   - 5xx responses are retried up to maxRetries times with configurable delays
 *   - Network errors (fetch throws) are retried the same way
 *   - After all retries are exhausted the helper throws the last error
 *   - The same idempotency_key must be carried through all retry attempts
 *
 * All timing is controlled via vi.useFakeTimers() so the suite runs in < 1 ms.
 *
 * Run: npm test -- retryFetch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { retryFetch } from './lib/retryFetch'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeResponse(status, body = {}) {
  return {
    ok:     status >= 200 && status < 300,
    status,
    json:   () => Promise.resolve(body),
  }
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('retryFetch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── immediate returns ──────────────────────────────────────────────────────

  it('returns immediately on 200 without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { state: 'ok' }))
    const p = retryFetch('url', {}, { fetchFn: fetchMock })
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns 4xx immediately without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(400, { error: 'illegal_move' }))
    const p = retryFetch('url', {}, { fetchFn: fetchMock })
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.status).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns 401 immediately without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(401))
    const p = retryFetch('url', {}, { fetchFn: fetchMock })
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns 409 immediately without retrying (move conflict — do not retry)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(409))
    const p = retryFetch('url', {}, { fetchFn: fetchMock })
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.status).toBe(409)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // ── 5xx retry ─────────────────────────────────────────────────────────────

  it('retries once on 500 and succeeds on the second attempt', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(500))
      .mockResolvedValueOnce(makeResponse(200, { state: 'ok' }))

    const p = retryFetch('url', {}, { fetchFn: fetchMock, delays: [50, 100, 200] })
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries on 503 and 504', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(504))
      .mockResolvedValueOnce(makeResponse(200, { state: 'ok' }))

    const p = retryFetch('url', {}, { fetchFn: fetchMock, delays: [10, 10, 10] })
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('throws after all retries are exhausted (3 × 5xx)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(500))
    const p = retryFetch('url', {}, { fetchFn: fetchMock, maxRetries: 3, delays: [10, 10, 10] })
    await vi.runAllTimersAsync()
    await expect(p).rejects.toThrow(/HTTP 500/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  // ── network error retry ───────────────────────────────────────────────────

  it('retries on network error and succeeds on the second attempt', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(makeResponse(200))

    const p = retryFetch('url', {}, { fetchFn: fetchMock, delays: [10] })
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws after all retries are exhausted (network errors)', async () => {
    const err = new TypeError('Failed to fetch')
    const fetchMock = vi.fn().mockRejectedValue(err)
    const p = retryFetch('url', {}, { fetchFn: fetchMock, maxRetries: 3, delays: [10, 10, 10] })
    await vi.runAllTimersAsync()
    await expect(p).rejects.toThrow('Failed to fetch')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  // ── delay sequencing ──────────────────────────────────────────────────────

  it('waits for the configured delay between retries', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(500))
      .mockResolvedValueOnce(makeResponse(200))

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    const p = retryFetch('url', {}, { fetchFn: fetchMock, delays: [300, 900, 2700] })
    await vi.runAllTimersAsync()
    await p

    // The first delay (300 ms) must have been scheduled
    const delays = setTimeoutSpy.mock.calls.map(c => c[1])
    expect(delays).toContain(300)
  })

  // ── options pass-through ──────────────────────────────────────────────────

  it('passes the provided options object to every fetch attempt', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(500))
      .mockResolvedValueOnce(makeResponse(200))

    const opts = { method: 'POST', headers: { Authorization: 'Bearer tok' }, body: '{}' }
    const p = retryFetch('https://example.com/fn', opts, { fetchFn: fetchMock, delays: [10] })
    await vi.runAllTimersAsync()
    await p

    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe('https://example.com/fn')
      expect(call[1]).toEqual(opts)
    }
  })
})
