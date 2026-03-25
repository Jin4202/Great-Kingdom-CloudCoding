/**
 * validate-move — Supabase Edge Function
 *
 * POST /functions/v1/validate-move
 * Headers: Authorization: Bearer <user-jwt>
 * Body:    { roomCode: string, type: 'place' | 'pass', row?: number, col?: number }
 *
 * Responses:
 *   200 { state }           — move accepted; state is the new camelCase game state
 *   400 { error }           — out_of_bounds | illegal_move | missing_fields | invalid_type
 *   401 { error }           — unauthorized
 *   403 { error }           — not_your_turn | game_over | not_a_member
 *   404 { error }           — room_not_found | game_not_found
 *   500 { error }           — db_error
 *
 * Deploy: supabase functions deploy validate-move
 */

// @deno-types="https://esm.sh/@supabase/supabase-js@2/dist/module/index.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { placeStone, passTurn, BLUE, ORANGE, BOARD_SIZE } from './gameLogic.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeState(row: Record<string, any>) {
  return {
    board:           row.board           as number[][],
    territory:       row.territory       as number[][],
    turn:            row.turn            as number,
    passCount:       row.pass_count      as number,
    bluePieces:      row.blue_pieces     as number,
    orangePieces:    row.orange_pieces   as number,
    blueTerritory:   row.blue_territory  as number,
    orangeTerritory: row.orange_territory as number,
    gameOver:        row.game_over       as boolean,
    winner:          (row.winner  ?? null) as number | null,
    winReason:       (row.win_reason ?? null) as string | null,
    lastMove:        (row.last_move ?? null) as { row: number; col: number } | null,
  }
}

type GameState = ReturnType<typeof deserializeState>

function serializeState(state: GameState) {
  return {
    board:            state.board,
    territory:        state.territory,
    turn:             state.turn,
    pass_count:       state.passCount,
    blue_pieces:      state.bluePieces,
    orange_pieces:    state.orangePieces,
    blue_territory:   state.blueTerritory,
    orange_territory: state.orangeTerritory,
    game_over:        state.gameOver,
    winner:           state.winner   ?? null,
    win_reason:       state.winReason ?? null,
    last_move:        state.lastMove  ?? null,
    updated_at:       new Date().toISOString(),
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── 1. Extract JWT ─────────────────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401)
  }
  const jwt = authHeader.slice(7)

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Service-role client is used for all DB ops (bypasses RLS).
  // auth.getUser(jwt) verifies the token without needing a separate anon client.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: { user }, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !user) {
    return json({ error: 'unauthorized' }, 401)
  }

  // ── 2. Parse body ──────────────────────────────────────────────────────────

  let body: { roomCode?: string; type?: string; row?: number; col?: number; move_number?: number; idempotency_key?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const { roomCode, type, row, col, move_number, idempotency_key } = body
  if (!roomCode || !type) {
    return json({ error: 'missing_fields' }, 400)
  }

  // ── 3. Fetch room ──────────────────────────────────────────────────────────

  const { data: room, error: roomErr } = await admin
    .from('rooms')
    .select('id, blue_user, orange_user')
    .eq('code', roomCode)
    .single()

  if (roomErr || !room) {
    return json({ error: 'room_not_found' }, 404)
  }

  // ── 4. Determine caller color ──────────────────────────────────────────────

  let callerColor: number
  if (room.blue_user === user.id) {
    callerColor = BLUE
  } else if (room.orange_user === user.id) {
    callerColor = ORANGE
  } else {
    return json({ error: 'not_a_member' }, 403)
  }

  // ── 5. Fetch game state ────────────────────────────────────────────────────

  const { data: gs, error: gsErr } = await admin
    .from('game_states')
    .select('*')
    .eq('room_id', room.id)
    .single()

  if (gsErr || !gs) {
    return json({ error: 'game_not_found' }, 404)
  }

  const state = deserializeState(gs)

  // ── 5a. Idempotency replay ─────────────────────────────────────────────────
  //
  // If the client supplied an idempotency_key that already exists in move_log,
  // the request is a retry of a move that was already committed (e.g. the
  // network failed after the DB write but before the response reached the
  // client).  Return the current game state without re-applying the move.

  if (idempotency_key) {
    const { data: existing } = await admin
      .from('move_log')
      .select('id')
      .eq('idempotency_key', idempotency_key)
      .maybeSingle()

    if (existing) {
      // Move already committed — return current state
      return json({ state: deserializeState(gs) })
    }
  }

  // ── 6. Move-number sequencing guard ───────────────────────────────────────
  //
  // Count the moves already recorded for this room.  If the client supplied a
  // move_number and it doesn't match the current count, reject with 409 —
  // this means another move already landed between the client's last update
  // and this request (rapid double-dispatch race).
  //
  // Clients that don't send move_number (older versions, tests) are accepted
  // as-is: the turn guard below still prevents invalid writes.

  const { count: currentMoveCount } = await admin
    .from('move_log')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', room.id)

  if (move_number != null && move_number !== (currentMoveCount ?? 0)) {
    return json({ error: 'move_conflict', expected: currentMoveCount ?? 0 }, 409)
  }

  // ── 7. Validate ────────────────────────────────────────────────────────────

  if (state.gameOver) {
    return json({ error: 'game_over' }, 403)
  }
  if (state.turn !== callerColor) {
    return json({ error: 'not_your_turn' }, 403)
  }

  let nextState: GameState
  if (type === 'pass') {
    nextState = passTurn(state) as GameState
  } else if (type === 'place') {
    if (
      row == null || col == null ||
      row < 0 || row >= BOARD_SIZE ||
      col < 0 || col >= BOARD_SIZE
    ) {
      return json({ error: 'out_of_bounds' }, 400)
    }
    const result = placeStone(state, row, col) as GameState | null
    if (!result) {
      return json({ error: 'illegal_move' }, 400)
    }
    nextState = result
  } else {
    return json({ error: 'invalid_type' }, 400)
  }

  // ── 8. Persist new game state ──────────────────────────────────────────────

  const { error: updateErr } = await admin
    .from('game_states')
    .update(serializeState(nextState))
    .eq('room_id', room.id)

  if (updateErr) {
    return json({ error: 'db_error', detail: updateErr.message }, 500)
  }

  // ── 9. Insert move_log row ──────────────────────────────────────────────────
  //
  // Reuse currentMoveCount from step 6 (already fetched).
  // idempotency_key is stored if supplied; the UNIQUE constraint on the column
  // ensures a retried request with the same key is a no-op (handled in step 9a).

  await admin.from('move_log').insert({
    room_id:          room.id,
    move_number:      (currentMoveCount ?? 0) + 1,
    player:           callerColor,
    type,
    row:              type === 'place' ? row : null,
    col:              type === 'place' ? col : null,
    idempotency_key:  idempotency_key ?? null,
  })

  // ── 10. Mark room finished if game over ─────────────────────────────────────

  if (nextState.gameOver) {
    await admin.from('rooms').update({ status: 'finished' }).eq('id', room.id)
  }

  // ── 11. Return canonical next state (camelCase, matches JS game state) ──────

  return json({ state: nextState })
})
