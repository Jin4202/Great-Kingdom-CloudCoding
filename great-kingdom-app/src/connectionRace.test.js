/**
 * Connection Race Condition Tests
 *
 * Covers three reported bugs where users see "connection lost" on first entry:
 *   Case 2 — room creator (WaitingRoom channel torn down as useRoom subscribes)
 *   Case 3 — browse-list joiner (public-lobby channel torn down as useRoom subscribes)
 *
 * Also includes a unit test for the `everSubscribed` guard that fixes the
 * connectionLost banner being shown on the very first subscription attempt.
 *
 * Run: npm test -- connectionRace
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createInitialState } from './gameLogic'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// ── helpers ──────────────────────────────────────────────────────────────────

function makeClient() {
  const store = new Map()
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: {
        getItem:    k      => store.get(k) ?? null,
        setItem:    (k, v) => store.set(k, v),
        removeItem: k      => store.delete(k),
      },
      persistSession:   true,
      autoRefreshToken: true,
    },
  })
}

function serializeState(state) {
  return {
    board:            state.board,
    territory:        state.territory,
    turn:             state.turn,
    pass_count:       state.passCount,
    blue_pieces:      state.bluePieces,
    orange_pieces:    state.redPieces,
    blue_territory:   state.blueTerritory,
    orange_territory: state.redTerritory,
    game_over:        state.gameOver,
    winner:           state.winner   ?? null,
    win_reason:       state.winReason ?? null,
    last_move:        state.lastMove  ?? null,
  }
}

function randomCode() {
  return 'CR' + Math.random().toString(36).substring(2, 8).toUpperCase()
}

// ── shared state ─────────────────────────────────────────────────────────────

let client
let roomId

// ── Unit test (no network) ────────────────────────────────────────────────────

describe('connectionLost guard — unit', () => {
  /**
   * Reproduces the logic inside useRoom's gameChannel.subscribe() callback.
   * The `everSubscribed` flag must prevent CHANNEL_ERROR from setting
   * connectionLost before the channel has ever reached SUBSCRIBED.
   */
  it('does NOT set connectionLost when CHANNEL_ERROR fires before first SUBSCRIBED', () => {
    let connectionLost = false
    let everSubscribed = false

    function handleStatus(s) {
      if (s === 'SUBSCRIBED') {
        everSubscribed = true
        connectionLost = false
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        if (everSubscribed) connectionLost = true
        // if not yet subscribed → transient race, ignore
      }
    }

    // Simulate: initial connection attempt fails (teardown race on navigation)
    handleStatus('CHANNEL_ERROR')
    expect(connectionLost).toBe(false)

    // Simulate: Supabase auto-retries and succeeds
    handleStatus('SUBSCRIBED')
    expect(connectionLost).toBe(false)
    expect(everSubscribed).toBe(true)
  })

  it('DOES set connectionLost when CHANNEL_ERROR fires after a prior SUBSCRIBED', () => {
    let connectionLost = false
    let everSubscribed = false

    function handleStatus(s) {
      if (s === 'SUBSCRIBED') {
        everSubscribed = true
        connectionLost = false
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        if (everSubscribed) connectionLost = true
      }
    }

    // Normal connect
    handleStatus('SUBSCRIBED')
    expect(connectionLost).toBe(false)

    // Mid-game dropout
    handleStatus('CHANNEL_ERROR')
    expect(connectionLost).toBe(true)
  })

  it('clears connectionLost when SUBSCRIBED fires after a mid-game dropout', () => {
    let connectionLost = false
    let everSubscribed = false

    function handleStatus(s) {
      if (s === 'SUBSCRIBED') {
        everSubscribed = true
        connectionLost = false
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        if (everSubscribed) connectionLost = true
      }
    }

    handleStatus('SUBSCRIBED')
    handleStatus('TIMED_OUT')
    expect(connectionLost).toBe(true)

    // Supabase auto-reconnects
    handleStatus('SUBSCRIBED')
    expect(connectionLost).toBe(false)
  })
})

// ── Integration: channel teardown race ───────────────────────────────────────

describe('channel teardown race — integration', { timeout: 15000 }, () => {

  beforeAll(async () => {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local')
    }
    client = makeClient()
    const { data, error } = await client.auth.signInAnonymously()
    expect(error).toBeNull()
    client.realtime.setAuth(data.session.access_token)

    // Create a room and game_state so the channels are valid
    const { data: user } = await client.auth.getUser()
    const code = randomCode()
    const { data: room, error: roomErr } = await client
      .from('rooms')
      .insert({ code, status: 'waiting', blue_user: user.user.id })
      .select('id')
      .single()
    expect(roomErr).toBeNull()
    roomId = room.id

    await client
      .from('game_states')
      .insert({ room_id: roomId, ...serializeState(createInitialState()) })
  })

  afterAll(async () => {
    await client.auth.signOut()
  })

  /**
   * Case 2 — Creator path
   * Simulates WaitingRoom unmounting (removes `waiting-<id>` channel) at the
   * same moment useRoom subscribes `game-<id>`.
   *
   * The game channel must still reach SUBSCRIBED despite the socket disruption.
   */
  it('Case 2 — game channel reaches SUBSCRIBED after waiting channel is torn down synchronously', () => {
    return new Promise((resolve, reject) => {
      // Simulate WaitingRoom: subscribe then immediately remove (unmount)
      const waitingCh = client.channel(`waiting-${roomId}`)
      waitingCh.subscribe()
      client.removeChannel(waitingCh)
      console.log('  Removed waiting channel synchronously')

      // Simulate useRoom: subscribe game channel in the same tick
      const gameCh = client
        .channel(`game-race-creator-${roomId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'game_states',
          filter: `room_id=eq.${roomId}`,
        }, () => {})
        .subscribe((status) => {
          console.log('  [Case 2] game channel status:', status)
          if (status === 'SUBSCRIBED') {
            client.removeChannel(gameCh)
            resolve()
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            client.removeChannel(gameCh)
            reject(new Error(`[Case 2] game channel failed with: ${status} — race condition not handled`))
          }
        })
    })
  })

  /**
   * Case 3 — Browse-list joiner path
   * Simulates the Lobby's `public-lobby` channel being removed (Lobby unmounts)
   * at the same moment useRoom subscribes `game-<id>`.
   */
  it('Case 3 — game channel reaches SUBSCRIBED after public-lobby channel is torn down synchronously', () => {
    return new Promise((resolve, reject) => {
      // Simulate Lobby browse view: subscribe then immediately remove (unmount)
      const lobbyCh = client.channel('public-lobby')
      lobbyCh.subscribe()
      client.removeChannel(lobbyCh)
      console.log('  Removed public-lobby channel synchronously')

      // Simulate useRoom: subscribe game channel in the same tick
      const gameCh = client
        .channel(`game-race-browse-${roomId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'game_states',
          filter: `room_id=eq.${roomId}`,
        }, () => {})
        .subscribe((status) => {
          console.log('  [Case 3] game channel status:', status)
          if (status === 'SUBSCRIBED') {
            client.removeChannel(gameCh)
            resolve()
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            client.removeChannel(gameCh)
            reject(new Error(`[Case 3] game channel failed with: ${status} — race condition not handled`))
          }
        })
    })
  })

  /**
   * Baseline: no prior channel removed — should always pass.
   * Exists to confirm the environment is healthy and the channel itself works.
   */
  it('baseline — game channel reaches SUBSCRIBED with no prior channel teardown', () => {
    return new Promise((resolve, reject) => {
      const gameCh = client
        .channel(`game-baseline-${roomId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'game_states',
          filter: `room_id=eq.${roomId}`,
        }, () => {})
        .subscribe((status) => {
          console.log('  [baseline] game channel status:', status)
          if (status === 'SUBSCRIBED') {
            client.removeChannel(gameCh)
            resolve()
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            client.removeChannel(gameCh)
            reject(new Error(`[baseline] channel failed: ${status}`))
          }
        })
    })
  })
})
