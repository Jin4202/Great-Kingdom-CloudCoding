/**
 * validate-move Edge Function — Integration Tests
 *
 * Tests the full HTTP endpoint against the real Supabase instance.
 * The Edge Function must be deployed before these tests can pass.
 *
 * Deploy:  supabase functions deploy validate-move
 * Run:     npm test -- validateMoveEndpoint
 *
 * Remove `.skip` from `describe.skip` below after deploying.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createInitialState } from './gameLogic'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const ENDPOINT        = `${supabaseUrl}/functions/v1/validate-move`

// ── helpers ──────────────────────────────────────────────────────────────────

function makeClient() {
  const store = new Map()
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: {
        getItem:    k    => store.get(k) ?? null,
        setItem:    (k, v) => store.set(k, v),
        removeItem: k    => store.delete(k),
      },
      persistSession: true,
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
    winner:           state.winner ?? null,
    win_reason:       state.winReason ?? null,
    last_move:        state.lastMove ?? null,
  }
}

function randomCode() {
  return 'EMVT' + Math.random().toString(36).substring(2, 6).toUpperCase()
}

async function getToken(client) {
  const { data } = await client.auth.getSession()
  return data.session?.access_token
}

/** POST to the Edge Function and return { status, body }. */
async function callEndpoint(token, payload) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

// ── shared state ──────────────────────────────────────────────────────────────

let blue, red
let blueUser, redUser
let roomCode, roomId

// ── suite (skipped until Edge Function is deployed) ───────────────────────────

describe('validate-move Edge Function', { timeout: 15000 }, () => {

  beforeAll(async () => {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local')
    }
    blue = makeClient()
    red  = makeClient()

    // Sign both players in
    const [b, r] = await Promise.all([
      blue.auth.signInAnonymously(),
      red.auth.signInAnonymously(),
    ])
    blueUser = b.data.user
    redUser  = r.data.user
    expect(blueUser.id).not.toBe(redUser.id)

    // Blue creates room + initial game_states
    roomCode = randomCode()
    const { data: room } = await blue
      .from('rooms')
      .insert({ code: roomCode, status: 'playing', blue_user: blueUser.id, orange_user: redUser.id })
      .select('id')
      .single()
    roomId = room.id

    await blue
      .from('game_states')
      .insert({ room_id: roomId, ...serializeState(createInitialState()) })
  })

  afterAll(async () => {
    await Promise.all([
      blue.auth.signOut(),
      red.auth.signOut(),
    ])
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('returns 401 when no Authorization header is provided', async () => {
    const { status } = await callEndpoint(null, { roomCode, type: 'place', row: 0, col: 0 })
    expect(status).toBe(401)
  })

  it('returns 401 when Authorization token is invalid', async () => {
    const { status } = await callEndpoint('not-a-real-token', { roomCode, type: 'place', row: 0, col: 0 })
    expect(status).toBe(401)
  })

  // ── Valid move ─────────────────────────────────────────────────────────────

  it('returns 200 and new state for a legal placement (Blue, correct turn)', async () => {
    const token = await getToken(blue)
    const { status, body } = await callEndpoint(token, { roomCode, type: 'place', row: 0, col: 0 })
    console.log('  valid move response:', status, body?.state?.turn)
    expect(status).toBe(200)
    expect(body.state).toBeDefined()
    expect(body.state.board[0][0]).toBe(1)   // BLUE = 1
    expect(body.state.turn).toBe(2)           // switches to RED
  })

  it('DB game_states row is updated after a valid move', async () => {
    const { data } = await blue
      .from('game_states')
      .select('turn, last_move')
      .eq('room_id', roomId)
      .single()
    console.log('  DB state after move:', data)
    expect(data.turn).toBe(2)                   // RED's turn
    expect(data.last_move).toEqual({ row: 0, col: 0 })
  })

  it('move_log row is inserted after a valid move', async () => {
    const { data } = await blue
      .from('move_log')
      .select('player, type, row, col')
      .eq('room_id', roomId)
      .order('move_number', { ascending: false })
      .limit(1)
      .single()
    expect(data.player).toBe(1)   // BLUE
    expect(data.type).toBe('place')
    expect(data.row).toBe(0)
    expect(data.col).toBe(0)
  })

  // ── Wrong turn ────────────────────────────────────────────────────────────

  it('returns 403 when the wrong-turn player tries to move', async () => {
    // It is now Red's turn; Blue tries to move again
    const token = await getToken(blue)
    const { status, body } = await callEndpoint(token, { roomCode, type: 'place', row: 1, col: 1 })
    console.log('  wrong-turn response:', status, body)
    expect(status).toBe(403)
    expect(body.error).toBe('not_your_turn')
  })

  it('DB state is NOT changed after a rejected wrong-turn attempt', async () => {
    const { data } = await blue
      .from('game_states')
      .select('turn')
      .eq('room_id', roomId)
      .single()
    expect(data.turn).toBe(2) // still Orange's turn
  })

  // ── Illegal moves ─────────────────────────────────────────────────────────

  it('returns 400 for a placement on an occupied cell', async () => {
    // Red tries (0,0) which Blue already occupies
    const token = await getToken(red)
    const { status, body } = await callEndpoint(token, { roomCode, type: 'place', row: 0, col: 0 })
    expect(status).toBe(400)
    expect(body.error).toBe('illegal_move')
  })

  it('returns 400 for a placement on the neutral castle', async () => {
    const token = await getToken(red)
    const { status, body } = await callEndpoint(token, { roomCode, type: 'place', row: 4, col: 4 })
    expect(status).toBe(400)
    expect(body.error).toBe('illegal_move')
  })

  it('returns 400 for out-of-bounds coordinates', async () => {
    const token = await getToken(red)
    const { status, body } = await callEndpoint(token, { roomCode, type: 'place', row: 9, col: 0 })
    expect(status).toBe(400)
    expect(body.error).toBe('out_of_bounds')
  })

  it('returns 400 when coordinates are omitted for a place move', async () => {
    const token = await getToken(red)
    const { status, body } = await callEndpoint(token, { roomCode, type: 'place' })
    expect(status).toBe(400)
    expect(body.error).toBe('out_of_bounds')
  })

  // ── Pass ──────────────────────────────────────────────────────────────────

  it('returns 200 for a valid pass (Red)', async () => {
    const token = await getToken(red)
    const { status, body } = await callEndpoint(token, { roomCode, type: 'pass' })
    expect(status).toBe(200)
    expect(body.state.passCount).toBe(1)
    expect(body.state.turn).toBe(1)  // back to BLUE
  })

  it('returns 403 when Red tries to pass again (Blue\'s turn now)', async () => {
    const token = await getToken(red)
    const { status, body } = await callEndpoint(token, { roomCode, type: 'pass' })
    expect(status).toBe(403)
    expect(body.error).toBe('not_your_turn')
  })

  // ── Game-over guard ───────────────────────────────────────────────────────

  it('returns 403 after game ends by double-pass', async () => {
    // Blue also passes → game over
    const blueToken = await getToken(blue)
    const passRes = await callEndpoint(blueToken, { roomCode, type: 'pass' })
    expect(passRes.status).toBe(200)
    expect(passRes.body.state.gameOver).toBe(true)

    // Any further move from either player must be rejected
    const { status, body } = await callEndpoint(blueToken, { roomCode, type: 'place', row: 2, col: 2 })
    expect(status).toBe(403)
    expect(body.error).toBe('game_over')
  })

  // ── Missing / malformed room ──────────────────────────────────────────────

  it('returns 404 for an unknown room code', async () => {
    const token = await getToken(blue)
    const { status } = await callEndpoint(token, { roomCode: 'XXXXXX', type: 'place', row: 0, col: 0 })
    expect(status).toBe(404)
  })

  it('returns 400 when required body fields are missing', async () => {
    const token = await getToken(blue)
    const { status } = await callEndpoint(token, {}) // no roomCode, no type
    expect(status).toBe(400)
  })
})
