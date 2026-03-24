import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, ensureAuth } from '../lib/supabase'
import { placeStone, passTurn, BLUE, ORANGE } from '../gameLogic'

// ── Serialization ─────────────────────────────────────────────────────────────

export function deserializeState(row) {
  return {
    board: row.board,
    territory: row.territory,
    turn: row.turn,
    passCount: row.pass_count,
    bluePieces: row.blue_pieces,
    orangePieces: row.orange_pieces,
    blueTerritory: row.blue_territory,
    orangeTerritory: row.orange_territory,
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
    orange_pieces: state.orangePieces,
    blue_territory: state.blueTerritory,
    orange_territory: state.orangeTerritory,
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
  const [connectionLost, setConnectionLost] = useState(false)

  // Stable refs — available inside async callbacks without stale closure issues
  const roomIdRef = useRef(null)
  const myColorRef = useRef(null)
  const moveCountRef = useRef(0)

  useEffect(() => {
    let gameChannel
    let presenceChannel

    async function init() {
      const user = await ensureAuth()

      // 1. Fetch room to determine player color and room ID
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('id, blue_user, orange_user')
        .eq('code', code)
        .single()
      if (roomErr) throw new Error('Room not found.')

      const color = room.blue_user === user.id ? BLUE : ORANGE
      const opponentId = room.blue_user === user.id ? room.orange_user : room.blue_user

      roomIdRef.current = room.id
      myColorRef.current = color
      setMyColor(color)

      // 2. Fetch current game state
      const { data: gs, error: gsErr } = await supabase
        .from('game_states')
        .select('*')
        .eq('room_id', room.id)
        .single()
      if (gsErr) throw new Error('Game state not found.')

      setGameState(deserializeState(gs))
      setStatus('ready')

      // 3. Subscribe to realtime updates on game_states
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
            moveCountRef.current += 1
            setGameState(deserializeState(payload.new))
          }
        )
        .subscribe((s) => {
          if (s === 'CHANNEL_ERROR' || s === 'CLOSED') {
            setConnectionLost(true)
          }
        })

      // 4. Presence channel — detect when opponent goes offline
      presenceChannel = supabase
        .channel(`presence-${room.id}`, {
          config: { presence: { key: user.id } },
        })
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState()
          setOpponentOnline(opponentId != null && opponentId in state)
        })
        .subscribe(async (s) => {
          if (s === 'SUBSCRIBED') {
            await presenceChannel.track({ online: true })
          }
        })
    }

    init().catch((err) => {
      setError(err.message)
      setStatus('error')
    })

    return () => {
      if (gameChannel) supabase.removeChannel(gameChannel)
      if (presenceChannel) supabase.removeChannel(presenceChannel)
    }
  }, [code])

  const isMyTurn = gameState != null && !gameState.gameOver && gameState.turn === myColor

  // ── dispatchMove ────────────────────────────────────────────────────────────

  const dispatchMove = useCallback(
    async (row, col) => {
      if (!gameState || gameState.turn !== myColorRef.current || gameState.gameOver) return null
      const next = placeStone(gameState, row, col)
      if (!next) return null

      // Optimistic update — opponent will receive via realtime
      setGameState(next)

      const roomId = roomIdRef.current
      const { error: updateErr } = await supabase
        .from('game_states')
        .update(serializeState(next))
        .eq('room_id', roomId)

      if (updateErr) {
        console.error('dispatchMove:', updateErr)
        setGameState(gameState) // revert on failure
        return null
      }

      await supabase.from('move_log').insert({
        room_id: roomId,
        move_number: moveCountRef.current + 1,
        player: myColorRef.current,
        type: 'place',
        row,
        col,
      })

      if (next.gameOver) {
        await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
      }

      return next
    },
    [gameState]
  )

  // ── dispatchPass ────────────────────────────────────────────────────────────

  const dispatchPass = useCallback(
    async () => {
      if (!gameState || gameState.turn !== myColorRef.current || gameState.gameOver) return null
      const next = passTurn(gameState)

      // Optimistic update
      setGameState(next)

      const roomId = roomIdRef.current
      const { error: updateErr } = await supabase
        .from('game_states')
        .update(serializeState(next))
        .eq('room_id', roomId)

      if (updateErr) {
        console.error('dispatchPass:', updateErr)
        setGameState(gameState)
        return null
      }

      await supabase.from('move_log').insert({
        room_id: roomId,
        move_number: moveCountRef.current + 1,
        player: myColorRef.current,
        type: 'pass',
        row: null,
        col: null,
      })

      if (next.gameOver) {
        await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
      }

      return next
    },
    [gameState]
  )

  return { gameState, myColor, isMyTurn, status, error, opponentOnline, connectionLost, dispatchMove, dispatchPass }
}
