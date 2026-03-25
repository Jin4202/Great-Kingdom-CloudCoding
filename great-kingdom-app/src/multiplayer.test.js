/**
 * Multiplayer Connection Integration Tests
 *
 * Tests the full two-player room flow against the real Supabase instance.
 * Each test logs what it finds so you can pinpoint exactly where the flow breaks.
 *
 * Run with: npm test -- multiplayer
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createInitialState } from './gameLogic'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// ── helpers ─────────────────────────────────────────────────────────────────

/** Each client gets its own in-memory auth storage so sessions don't bleed. */
function makeClient() {
  const store = new Map()
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: {
        getItem:    (k)    => store.get(k) ?? null,
        setItem:    (k, v) => store.set(k, v),
        removeItem: (k)    => store.delete(k),
      },
      persistSession: true,
      autoRefreshToken: true,
    },
  })
}

function serializeState(state) {
  return {
    board: state.board,
    territory: state.territory,
    turn: state.turn,
    pass_count: state.passCount,
    blue_pieces: state.bluePieces,
    orange_pieces: state.redPieces,
    blue_territory: state.blueTerritory,
    orange_territory: state.redTerritory,
    game_over: state.gameOver,
    winner: state.winner ?? null,
    win_reason: state.winReason ?? null,
    last_move: state.lastMove ?? null,
  }
}

function randomCode() {
  return 'TEST' + Math.random().toString(36).substring(2, 6).toUpperCase()
}

// ── shared state across tests ────────────────────────────────────────────────

let blue, red          // Supabase clients
let blueUser, redUser  // auth.User objects
let roomCode, roomId   // room created by Blue

// ── suite ───────────────────────────────────────────────────────────────────

describe('Multiplayer room flow', () => {

  beforeAll(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — add them to .env.local')
    }
    blue = makeClient()
    red  = makeClient()
  })

  afterAll(async () => {
    await blue.auth.signOut()
    await red.auth.signOut()
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('Blue signs in anonymously', async () => {
    const { data, error } = await blue.auth.signInAnonymously()
    expect(error, `signInAnonymously error: ${error?.message}`).toBeNull()
    expect(data.user).toBeDefined()
    blueUser = data.user
    console.log('  Blue user id:', blueUser.id)
  })

  it('Red signs in anonymously (different user)', async () => {
    const { data, error } = await red.auth.signInAnonymously()
    expect(error, `signInAnonymously error: ${error?.message}`).toBeNull()
    expect(data.user).toBeDefined()
    redUser = data.user
    console.log('  Red user id:', redUser.id)
    expect(redUser.id).not.toBe(blueUser.id)
  })

  // ── Room creation ─────────────────────────────────────────────────────────

  it('Blue creates a room', async () => {
    roomCode = randomCode()
    const { data, error } = await blue
      .from('rooms')
      .insert({ code: roomCode, status: 'waiting', blue_user: blueUser.id })
      .select('id')
      .single()
    console.log('  insert error:', error)
    expect(error, `rooms insert: ${error?.message}`).toBeNull()
    expect(data).toBeDefined()
    roomId = data.id
    console.log('  room id:', roomId, '  code:', roomCode)
  })

  it('Blue inserts initial game_states', async () => {
    const { error } = await blue
      .from('game_states')
      .insert({ room_id: roomId, ...serializeState(createInitialState()) })
    console.log('  game_states insert error:', error)
    expect(error, `game_states insert: ${error?.message}`).toBeNull()
  })

  // ── Orange finds and reads the room ───────────────────────────────────────

  it('Red can SELECT the room by code (rooms_select policy)', async () => {
    const { data, error } = await red
      .from('rooms')
      .select('id, status, blue_user, orange_user')
      .eq('code', roomCode)
      .single()
    console.log('  SELECT room error:', error)
    console.log('  room row:', data)
    expect(error, `rooms select: ${error?.message}`).toBeNull()
    expect(data.status).toBe('waiting')
    expect(data.blue_user).toBe(blueUser.id)
    expect(data.orange_user).toBeNull()
  })

  it('Red CANNOT read game_states before joining (RLS should block)', async () => {
    // orange_user is NULL → the game_states_select policy should reject this
    const { data, error } = await red
      .from('game_states')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle()
    console.log('  game_states pre-join SELECT error:', error)
    console.log('  game_states pre-join data:', data)
    // We expect either an RLS error OR data === null
    // (Supabase returns null rows when RLS blocks without error)
    if (error) console.log('  ⚠ RLS returned an error (expected)')
    else       console.log('  data is null?', data === null, '← should be true if RLS is working')
  })

  // ── Red joins (the critical UPDATE) ────────────────────────────────────────

  it('Red can UPDATE the room to join (rooms_update policy)', async () => {
    const { data, error } = await red
      .from('rooms')
      .update({ orange_user: redUser.id, status: 'playing' })
      .eq('id', roomId)
      .select('id, status, orange_user')  // returns the updated rows
    console.log('  UPDATE error:', error)
    console.log('  updated rows (should have 1 entry):', data)
    // If RLS blocks this, error is null but data is [] (0 rows affected)
    expect(error, `rooms update: ${error?.message}`).toBeNull()
    expect(
      data?.length,
      'UPDATE returned 0 rows — RLS is blocking Red. Run the new rooms_update policy in Supabase SQL Editor.'
    ).toBeGreaterThan(0)
  })

  // ── Blue polls and sees the change ────────────────────────────────────────

  it('Blue can read room status = "playing" after Red joins', async () => {
    const { data, error } = await blue
      .from('rooms')
      .select('status, orange_user')
      .eq('code', roomCode)
      .single()
    console.log('  Blue poll result:', data, error)
    expect(error, `rooms select: ${error?.message}`).toBeNull()
    expect(data.status, 'Status should be "playing" — if this is still "waiting", the UPDATE in the previous step was silently blocked by RLS').toBe('playing')
    expect(data.orange_user).toBe(redUser.id)
  })

  it('Red can read game_states after joining', async () => {
    const { data, error } = await red
      .from('game_states')
      .select('room_id, turn')
      .eq('room_id', roomId)
      .maybeSingle()
    console.log('  game_states post-join SELECT:', data, error)
    expect(error, `game_states select: ${error?.message}`).toBeNull()
    expect(data, 'Red should be able to read game_states after orange_user is set').not.toBeNull()
  })

  it('Blue can read game_states (as room creator)', async () => {
    const { data, error } = await blue
      .from('game_states')
      .select('room_id, turn')
      .eq('room_id', roomId)
      .single()
    console.log('  Blue game_states SELECT:', data, error)
    expect(error, `game_states select: ${error?.message}`).toBeNull()
    expect(data).toBeDefined()
  })

  // ── Realtime subscription (smoke test) ───────────────────────────────────

  it('Blue can subscribe to game_states realtime channel', () =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Subscription SUBSCRIBED event never fired within 5s')), 5000)
      const ch = blue
        .channel(`test-game-${roomId}`)
        .subscribe((status) => {
          console.log('  Blue game channel status:', status)
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout)
            blue.removeChannel(ch)
            resolve()
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timeout)
            blue.removeChannel(ch)
            reject(new Error(`Channel failed with status: ${status}`))
          }
        })
    })
  )

  it('Red can subscribe to game_states realtime channel', () =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Subscription never became SUBSCRIBED within 5s')), 5000)
      const ch = red
        .channel(`test-game-${roomId}-red`)
        .subscribe((status) => {
          console.log('  Red game channel status:', status)
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout)
            red.removeChannel(ch)
            resolve()
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timeout)
            red.removeChannel(ch)
            reject(new Error(`Channel failed with status: ${status}`))
          }
        })
    })
  )

})
