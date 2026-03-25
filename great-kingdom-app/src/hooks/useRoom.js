import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, ensureAuth } from '../lib/supabase'
import { createInitialState, BLUE, RED } from '../gameLogic'
import { retryFetch } from '../lib/retryFetch'

// ── Serialization ─────────────────────────────────────────────────────────────

export function deserializeState(row) {
  return {
    board: row.board,
    territory: row.territory,
    turn: row.turn,
    passCount: row.pass_count,
    bluePieces: row.blue_pieces,
    redPieces: row.orange_pieces,
    blueTerritory: row.blue_territory,
    redTerritory: row.orange_territory,
    gameOver: row.game_over,
    winner: row.winner ?? null,
    winReason: row.win_reason ?? null,
    lastMove: row.last_move ?? null,
  }
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
    updated_at: new Date().toISOString(),
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRoom() {
  const { code } = useParams()
  const [gameState, setGameState] = useState(null)
  const [myColor, setMyColor] = useState(null)
  const [status, setStatus] = useState('connecting') // 'connecting' | 'ready' | 'error'
  const [error, setError] = useState(null)
  const [opponentOnline, setOpponentOnline] = useState(false)
  const [opponentEverOnline, setOpponentEverOnline] = useState(false)
  const [connectionLost, setConnectionLost] = useState(false)
  const [moveError, setMoveError] = useState(null)  // set when all retries are exhausted

  // Stable refs — available inside async callbacks without stale closure issues
  const roomIdRef    = useRef(null)
  const myColorRef   = useRef(null)
  const moveCountRef = useRef(0)
  const inFlightRef  = useRef(false)  // true while a move HTTP request is in-flight

  useEffect(() => {
    let cancelled = false
    let gameChannel
    let presenceChannel

    async function init() {
      const user = await ensureAuth()
      if (cancelled) return

      // 1. Fetch room to determine player color and room ID
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('id, blue_user, orange_user')
        .eq('code', code)
        .single()
      if (cancelled) return
      if (roomErr) throw new Error('Room not found.')

      const color = room.blue_user === user.id ? BLUE : RED
      const opponentId = room.blue_user === user.id ? room.orange_user : room.blue_user

      roomIdRef.current = room.id
      myColorRef.current = color
      setMyColor(color)

      // 2. Fetch current game state — create it if missing (INSERT may have been
      //    silently blocked by RLS in Lobby; any authenticated player can create it)
      let { data: gs, error: gsErr } = await supabase
        .from('game_states')
        .select('*')
        .eq('room_id', room.id)
        .maybeSingle()
      if (cancelled) return

      if (!gs) {
        // Try to insert initial state; ignore conflict if opponent already created it
        await supabase
          .from('game_states')
          .upsert(
            { room_id: room.id, ...serializeState(createInitialState()) },
            { onConflict: 'room_id', ignoreDuplicates: true }
          )
        if (cancelled) return

        // Always fetch the row (handles both: we just inserted, or opponent inserted first)
        const { data: fetched, error: fetchErr } = await supabase
          .from('game_states')
          .select('*')
          .eq('room_id', room.id)
          .single()
        if (cancelled) return
        if (fetchErr) throw new Error(`Failed to initialise game: ${fetchErr.message}`)
        gs = fetched
      }

      setGameState(deserializeState(gs))
      setStatus('ready')

      // 3. Subscribe to realtime updates on game_states.
      //
      //    `everSubscribed` — ensures we only react to CHANNEL_ERROR after the
      //    channel has connected at least once.  On first mount it can briefly
      //    error because a previous channel (WaitingRoom, Lobby browse) was
      //    just torn down, closing the WebSocket for a moment.  That is a
      //    transient teardown race; Supabase retries automatically.
      //
      //    Resubscribe on disconnect — auto-reconnect restores the WebSocket
      //    transport but does not reliably re-apply `postgres_changes` row
      //    filters.  When an established channel drops, we:
      //      1. Show the connection-lost banner immediately.
      //      2. Wait 2 s (lets Supabase attempt its own reconnect first).
      //      3. Tear the channel down completely and recreate it from scratch.
      //      4. On the new SUBSCRIBED event, re-fetch the full game state from
      //         the DB to recover any updates missed during the outage.

      let everSubscribed       = false
      let resubscribeScheduled = false

      async function refetchGameState() {
        if (cancelled) return
        const { data: fresh } = await supabase
          .from('game_states')
          .select('*')
          .eq('room_id', room.id)
          .single()
        if (!cancelled && fresh) setGameState(deserializeState(fresh))
      }

      function subscribeGameChannel() {
        gameChannel = supabase
          .channel(`game-${room.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'game_states',
              filter: `room_id=eq.${room.id}`,
            },
            (payload) => {
              if (cancelled) return
              moveCountRef.current += 1
              setGameState(deserializeState(payload.new))
            }
          )
          .subscribe(async (s) => {
            if (cancelled) return
            if (s === 'SUBSCRIBED') {
              everSubscribed       = true
              resubscribeScheduled = false
              setConnectionLost(false)
              // Re-fetch state to recover any updates missed during the gap.
              // On initial connect this is a harmless second fetch that ensures
              // we have the very latest state even if an update landed between
              // the init() fetch and the channel subscription.
              await refetchGameState()
            } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
              if (!everSubscribed) return        // transient setup race — ignore
              if (resubscribeScheduled) return   // already waiting

              resubscribeScheduled = true
              setConnectionLost(true)

              setTimeout(() => {
                if (cancelled) return
                supabase.removeChannel(gameChannel)
                subscribeGameChannel()
              }, 2000)
            }
          })
      }

      subscribeGameChannel()

      // If cleanup ran while we were awaiting, remove channels immediately
      if (cancelled) {
        supabase.removeChannel(gameChannel)
        return
      }

      // 4. Presence channel — detect when opponent goes offline
      presenceChannel = supabase
        .channel(`presence-${room.id}`, {
          config: { presence: { key: user.id } },
        })
        .on('presence', { event: 'sync' }, () => {
          if (cancelled) return
          const state = presenceChannel.presenceState()
          const isOnline = opponentId != null && opponentId in state
          setOpponentOnline(isOnline)
          if (isOnline) setOpponentEverOnline(true)
        })
        .subscribe(async (s) => {
          if (cancelled) return
          if (s === 'SUBSCRIBED') {
            await presenceChannel.track({ online: true })
          }
        })

      if (cancelled) {
        supabase.removeChannel(presenceChannel)
      }
    }

    init().catch((err) => {
      if (cancelled) return
      setError(err.message)
      setStatus('error')
    })

    return () => {
      cancelled = true
      if (gameChannel) supabase.removeChannel(gameChannel)
      if (presenceChannel) supabase.removeChannel(presenceChannel)
    }
  }, [code])

  const isMyTurn = gameState != null && !gameState.gameOver && gameState.turn === myColor

  // ── Edge Function endpoint ───────────────────────────────────────────────────

  const VALIDATE_MOVE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-move`

  async function callValidateMove(payload) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null

    // One UUID per move — the same key is reused across all retry attempts so
    // a successfully retried request is a no-op on the server instead of a
    // double-apply.
    const idempotencyKey = crypto.randomUUID()

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    }
    const fetchBody = JSON.stringify({
      ...payload,
      move_number:     moveCountRef.current,
      idempotency_key: idempotencyKey,
    })

    try {
      const res = await retryFetch(VALIDATE_MOVE_URL, { method: 'POST', headers, body: fetchBody })
      const responseBody = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('validate-move rejected:', responseBody.error ?? res.status)
        return null
      }
      setMoveError(null)
      return responseBody.state  // camelCase game state from Edge Function
    } catch (err) {
      // All retries exhausted (transient 5xx / network).  The move was NOT
      // committed; surface a recoverable error so the user can retry manually.
      console.error('validate-move failed after retries:', err.message)
      setMoveError('Move failed — please try again.')
      return null
    }
  }

  // ── dispatchMove ────────────────────────────────────────────────────────────

  const dispatchMove = useCallback(
    async (row, col) => {
      if (!gameState || gameState.turn !== myColorRef.current || gameState.gameOver) return null
      if (inFlightRef.current) return null
      inFlightRef.current = true
      try {
        const next = await callValidateMove({ roomCode: code, type: 'place', row, col })
        if (!next) return null
        setGameState(next)
        moveCountRef.current += 1
        return next
      } finally {
        inFlightRef.current = false
      }
    },
    [gameState, code]
  )

  // ── dispatchPass ────────────────────────────────────────────────────────────

  const dispatchPass = useCallback(
    async () => {
      if (!gameState || gameState.turn !== myColorRef.current || gameState.gameOver) return null
      if (inFlightRef.current) return null
      inFlightRef.current = true
      try {
        const next = await callValidateMove({ roomCode: code, type: 'pass' })
        if (!next) return null
        setGameState(next)
        moveCountRef.current += 1
        return next
      } finally {
        inFlightRef.current = false
      }
    },
    [gameState, code]
  )

  return { gameState, myColor, isMyTurn, status, error, opponentOnline, opponentEverOnline, connectionLost, moveError, dispatchMove, dispatchPass }
}
