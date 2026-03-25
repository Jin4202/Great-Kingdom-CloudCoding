/**
 * Lobby RPC — Integration Tests
 *
 * Tests the join_room() Postgres function and public-rooms listing
 * against the real Supabase instance.
 *
 * Prerequisites:
 *   Run the Phase 9 SQL migration in the Supabase SQL Editor before
 *   these tests will pass.
 *
 * Run: npm test -- lobbyRpc
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

function randomCode() {
  return 'LB' + Math.random().toString(36).substring(2, 8).toUpperCase()
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

/** Insert a room as `creator` and return { roomId, code }. */
async function insertRoom(creator, opts = {}) {
  const { data: user } = await creator.auth.getUser()
  const code = randomCode()
  const password = opts.room_password ?? null

  const { data: room, error } = await creator
    .from('rooms')
    .insert({
      code,
      status:       'waiting',
      blue_user:    user.user.id,
      visibility:   opts.visibility ?? 'private',
      has_password: password !== null,
    })
    .select('id')
    .single()
  if (error) throw error

  if (password !== null) {
    const { error: secErr } = await creator
      .from('room_secrets')
      .insert({ room_id: room.id, password })
    if (secErr) throw secErr
  }

  await creator
    .from('game_states')
    .insert({ room_id: room.id, ...serializeState(createInitialState()) })

  return { roomId: room.id, code }
}

// ── shared state ─────────────────────────────────────────────────────────────

let blue, red
let blueUser, redUser

// ── suite ────────────────────────────────────────────────────────────────────

describe('join_room RPC', { timeout: 15000 }, () => {

  beforeAll(async () => {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local')
    }
    blue = makeClient()
    red  = makeClient()

    const [b, r] = await Promise.all([
      blue.auth.signInAnonymously(),
      red.auth.signInAnonymously(),
    ])
    blueUser = b.data.user
    redUser  = r.data.user
    expect(blueUser.id).not.toBe(redUser.id)
  })

  afterAll(async () => {
    await Promise.all([blue.auth.signOut(), red.auth.signOut()])
  })

  // ── room_not_found ────────────────────────────────────────────────────────

  it('returns room_not_found for an unknown code', async () => {
    const { data } = await red.rpc('join_room', { p_code: 'XXXXXX' })
    expect(data.error).toBe('room_not_found')
  })

  // ── already_creator ───────────────────────────────────────────────────────

  it('returns already_creator when blue tries to join their own room', async () => {
    const { code } = await insertRoom(blue)
    const { data } = await blue.rpc('join_room', { p_code: code })
    expect(data.error).toBe('already_creator')
  })

  // ── successful join (no password) ─────────────────────────────────────────

  it('joins successfully and flips room status to playing (no password)', async () => {
    const { roomId, code } = await insertRoom(blue)
    const { data, error } = await red.rpc('join_room', { p_code: code })
    expect(error).toBeNull()
    expect(data.ok).toBe(true)
    expect(data.code).toBe(code)

    // Verify DB state
    const { data: room } = await blue
      .from('rooms')
      .select('status, orange_user')
      .eq('id', roomId)
      .single()
    expect(room.status).toBe('playing')
    expect(room.orange_user).toBe(redUser.id)
  })

  // ── room_not_available (already full) ─────────────────────────────────────

  it('returns room_not_available when the room is already full', async () => {
    const { code } = await insertRoom(blue)
    // First join succeeds
    await red.rpc('join_room', { p_code: code })
    // Second join attempt (a third client) should be blocked
    const third = makeClient()
    await third.auth.signInAnonymously()
    const { data } = await third.rpc('join_room', { p_code: code })
    expect(data.error).toBe('room_not_available')
    await third.auth.signOut()
  })

  // ── room_not_available (finished) ─────────────────────────────────────────

  it('returns room_not_available for a finished room', async () => {
    const { roomId, code } = await insertRoom(blue)
    await blue.from('rooms').update({ status: 'finished' }).eq('id', roomId)
    const { data } = await red.rpc('join_room', { p_code: code })
    expect(data.error).toBe('room_not_available')
  })

  // ── wrong_password ────────────────────────────────────────────────────────

  it('returns wrong_password when the password does not match', async () => {
    const { code } = await insertRoom(blue, { visibility: 'public', room_password: 'secret' })
    const { data } = await red.rpc('join_room', { p_code: code, p_password: 'wrong' })
    expect(data.error).toBe('wrong_password')
  })

  it('returns wrong_password when password is omitted for a protected room', async () => {
    const { code } = await insertRoom(blue, { visibility: 'public', room_password: 'secret' })
    const { data } = await red.rpc('join_room', { p_code: code })
    expect(data.error).toBe('wrong_password')
  })

  // ── correct password ──────────────────────────────────────────────────────

  it('joins successfully when the correct password is provided', async () => {
    const { code } = await insertRoom(blue, { visibility: 'public', room_password: 'secret' })
    const { data, error } = await red.rpc('join_room', { p_code: code, p_password: 'secret' })
    expect(error).toBeNull()
    expect(data.ok).toBe(true)
  })

})

// ── Public rooms listing ──────────────────────────────────────────────────────

describe('public rooms listing', { timeout: 15000 }, () => {

  beforeAll(async () => {
    blue = makeClient()
    red  = makeClient()
    await Promise.all([
      blue.auth.signInAnonymously(),
      red.auth.signInAnonymously(),
    ])
  })

  afterAll(async () => {
    await Promise.all([blue.auth.signOut(), red.auth.signOut()])
  })

  it('public waiting rooms appear in a visibility=public query', async () => {
    const { code } = await insertRoom(blue, { visibility: 'public' })
    const { data } = await red
      .from('rooms')
      .select('code, visibility, status, has_password')
      .eq('visibility', 'public')
      .eq('status', 'waiting')
    const found = data.find(r => r.code === code)
    expect(found).toBeDefined()
    expect(found.has_password).toBe(false)
  })

  it('private waiting rooms do NOT appear in a visibility=public query', async () => {
    const { code } = await insertRoom(blue, { visibility: 'private' })
    const { data } = await red
      .from('rooms')
      .select('code')
      .eq('visibility', 'public')
      .eq('status', 'waiting')
    const found = data.find(r => r.code === code)
    expect(found).toBeUndefined()
  })

  it('has_password is true for rooms with a password', async () => {
    const { code } = await insertRoom(blue, { visibility: 'public', room_password: 'abc' })
    const { data } = await red
      .from('rooms')
      .select('code, has_password')
      .eq('code', code)
      .single()
    expect(data.has_password).toBe(true)
  })

  it('room_secrets table is not readable by clients (no SELECT policy)', async () => {
    const { roomId } = await insertRoom(blue, { visibility: 'public', room_password: 'topsecret' })
    const { data, error } = await red
      .from('room_secrets')
      .select('password')
      .eq('room_id', roomId)
    // RLS blocks all reads → data is empty array (not the secret row)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

})
