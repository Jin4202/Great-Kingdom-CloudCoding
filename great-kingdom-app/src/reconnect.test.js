/**
 * Channel Resubscribe — Unit Tests
 *
 * Verifies the resubscribe state machine that fires when a previously-healthy
 * Realtime channel drops with CHANNEL_ERROR or TIMED_OUT.
 *
 * Supabase's auto-reconnect restores the WebSocket transport but does NOT
 * reliably re-apply `postgres_changes` row filters.  The fix is to tear down
 * the channel, wait 2 s, and recreate it from scratch; on the new SUBSCRIBED
 * event, re-fetch the current game state from the DB to recover missed updates.
 *
 * All timing is fake; no network calls are made.
 *
 * Run: npm test -- reconnect
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── state machine under test ──────────────────────────────────────────────────
//
// This mirrors the logic that lives inside the useRoom hook.
// It is extracted here as a pure function so it can be unit-tested without
// React or Supabase.

function makeResubscribeStateMachine({
  onRemoveChannel,
  onCreateChannel,
  onRefetchState,
  onSetConnectionLost,
  delay = 2000,
}) {
  let everSubscribed = false
  let connectionLost = false
  let resubscribeScheduled = false

  async function handleStatus(status, channel) {
    if (status === 'SUBSCRIBED') {
      everSubscribed     = true
      connectionLost     = false
      resubscribeScheduled = false
      onSetConnectionLost(false)
      onRefetchState()    // re-sync on every (re-)connect
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      if (!everSubscribed) return   // transient setup race — ignore
      if (resubscribeScheduled) return // already scheduled

      connectionLost       = true
      resubscribeScheduled = true
      onSetConnectionLost(true)

      await new Promise(r => setTimeout(r, delay))

      onRemoveChannel(channel)
      onCreateChannel()
    }
  }

  return { handleStatus, getState: () => ({ everSubscribed, connectionLost, resubscribeScheduled }) }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('resubscribe state machine', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.restoreAllMocks())

  it('does NOT trigger resubscribe on CHANNEL_ERROR before first SUBSCRIBED', async () => {
    const onRemoveChannel  = vi.fn()
    const onCreateChannel  = vi.fn()
    const onRefetchState   = vi.fn()
    const onSetConnectionLost = vi.fn()

    const sm = makeResubscribeStateMachine({ onRemoveChannel, onCreateChannel, onRefetchState, onSetConnectionLost })

    const p = sm.handleStatus('CHANNEL_ERROR', 'ch')
    await vi.runAllTimersAsync()
    await p

    expect(onRemoveChannel).not.toHaveBeenCalled()
    expect(onCreateChannel).not.toHaveBeenCalled()
    expect(onSetConnectionLost).not.toHaveBeenCalled()
  })

  it('does NOT trigger resubscribe on TIMED_OUT before first SUBSCRIBED', async () => {
    const onRemoveChannel  = vi.fn()
    const onCreateChannel  = vi.fn()
    const onRefetchState   = vi.fn()
    const onSetConnectionLost = vi.fn()

    const sm = makeResubscribeStateMachine({ onRemoveChannel, onCreateChannel, onRefetchState, onSetConnectionLost })

    const p = sm.handleStatus('TIMED_OUT', 'ch')
    await vi.runAllTimersAsync()
    await p

    expect(onRemoveChannel).not.toHaveBeenCalled()
    expect(onCreateChannel).not.toHaveBeenCalled()
  })

  it('triggers resubscribe on CHANNEL_ERROR after a prior SUBSCRIBED', async () => {
    const onRemoveChannel  = vi.fn()
    const onCreateChannel  = vi.fn()
    const onRefetchState   = vi.fn()
    const onSetConnectionLost = vi.fn()

    const sm = makeResubscribeStateMachine({ onRemoveChannel, onCreateChannel, onRefetchState, onSetConnectionLost, delay: 100 })

    await sm.handleStatus('SUBSCRIBED', 'ch')

    const p = sm.handleStatus('CHANNEL_ERROR', 'ch')
    await vi.runAllTimersAsync()
    await p

    expect(onRemoveChannel).toHaveBeenCalledWith('ch')
    expect(onCreateChannel).toHaveBeenCalledTimes(1)
  })

  it('triggers resubscribe on TIMED_OUT after a prior SUBSCRIBED', async () => {
    const onRemoveChannel  = vi.fn()
    const onCreateChannel  = vi.fn()
    const onRefetchState   = vi.fn()
    const onSetConnectionLost = vi.fn()

    const sm = makeResubscribeStateMachine({ onRemoveChannel, onCreateChannel, onRefetchState, onSetConnectionLost, delay: 100 })

    await sm.handleStatus('SUBSCRIBED', 'ch')

    const p = sm.handleStatus('TIMED_OUT', 'ch')
    await vi.runAllTimersAsync()
    await p

    expect(onCreateChannel).toHaveBeenCalledTimes(1)
  })

  it('sets connectionLost = true immediately when CHANNEL_ERROR fires post-subscribe', async () => {
    const onSetConnectionLost = vi.fn()
    const sm = makeResubscribeStateMachine({
      onRemoveChannel: vi.fn(), onCreateChannel: vi.fn(),
      onRefetchState: vi.fn(), onSetConnectionLost, delay: 10000,
    })

    await sm.handleStatus('SUBSCRIBED', 'ch')

    // Kick off the error handler (don't await — it's held by the timer)
    sm.handleStatus('CHANNEL_ERROR', 'ch')

    // connectionLost is set synchronously before the delay
    expect(onSetConnectionLost).toHaveBeenLastCalledWith(true)
  })

  it('clears connectionLost when new channel reaches SUBSCRIBED', async () => {
    const onSetConnectionLost = vi.fn()
    const sm = makeResubscribeStateMachine({
      onRemoveChannel: vi.fn(), onCreateChannel: vi.fn(),
      onRefetchState: vi.fn(), onSetConnectionLost, delay: 100,
    })

    await sm.handleStatus('SUBSCRIBED', 'ch')

    const p = sm.handleStatus('CHANNEL_ERROR', 'ch')
    await vi.runAllTimersAsync()
    await p

    // Simulate the new channel coming up
    await sm.handleStatus('SUBSCRIBED', 'new-ch')

    const calls = onSetConnectionLost.mock.calls.map(c => c[0])
    expect(calls.at(-1)).toBe(false)
  })

  it('does NOT schedule a second resubscribe while one is already pending', async () => {
    const onCreateChannel = vi.fn()
    const sm = makeResubscribeStateMachine({
      onRemoveChannel: vi.fn(), onCreateChannel,
      onRefetchState: vi.fn(), onSetConnectionLost: vi.fn(), delay: 5000,
    })

    await sm.handleStatus('SUBSCRIBED', 'ch')

    // Two errors arrive before the delay fires
    sm.handleStatus('CHANNEL_ERROR', 'ch')
    sm.handleStatus('CHANNEL_ERROR', 'ch')

    await vi.runAllTimersAsync()

    // Only one new channel should be created
    expect(onCreateChannel).toHaveBeenCalledTimes(1)
  })

  it('re-fetches game state on every successful (re-)subscribe', async () => {
    const onRefetchState = vi.fn()
    const sm = makeResubscribeStateMachine({
      onRemoveChannel: vi.fn(), onCreateChannel: vi.fn(),
      onRefetchState, onSetConnectionLost: vi.fn(), delay: 100,
    })

    // Initial subscribe
    await sm.handleStatus('SUBSCRIBED', 'ch')
    expect(onRefetchState).toHaveBeenCalledTimes(1)

    // Disconnect + resubscribe cycle
    const p = sm.handleStatus('CHANNEL_ERROR', 'ch')
    await vi.runAllTimersAsync()
    await p

    await sm.handleStatus('SUBSCRIBED', 'new-ch')
    expect(onRefetchState).toHaveBeenCalledTimes(2)
  })
})
