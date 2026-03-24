import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ensureAuth } from '../lib/supabase'
import { createInitialState } from '../gameLogic'
import styles from './Lobby.module.css'

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
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
  }
}

export default function Lobby() {
  const navigate = useNavigate()
  const [view, setView] = useState('home') // 'home' | 'join'
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
      const user = await ensureAuth()
      const code = generateCode()

      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .insert({ code, status: 'waiting', blue_user: user.id })
        .select('id')
        .single()
      if (roomErr) throw roomErr

      const { error: gsErr } = await supabase
        .from('game_states')
        .insert({ room_id: room.id, ...serializeState(createInitialState()) })
      if (gsErr) throw gsErr

      navigate(`/room/${code}/wait`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) { setError('Enter a 6-character room code.'); return }
    setLoading(true)
    setError(null)
    try {
      const user = await ensureAuth()

      const { data: room, error: findErr } = await supabase
        .from('rooms')
        .select('id, status, blue_user')
        .eq('code', code)
        .single()
      if (findErr || !room) throw new Error('Room not found.')
      if (room.status !== 'waiting') throw new Error('Room is already full or finished.')
      if (room.blue_user === user.id) throw new Error('You created this room — share the code with a friend.')

      const { error: updateErr } = await supabase
        .from('rooms')
        .update({ orange_user: user.id, status: 'playing' })
        .eq('id', room.id)
      if (updateErr) throw updateErr

      navigate(`/room/${code}/play`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.lobby}>
      <h1 className={styles.title}>Great Kingdom</h1>
      <p className={styles.subtitle}>2-Player Strategy by Lee Se-dol</p>

      {view === 'home' && (
        <div className={styles.menu}>
          <button
            className={styles.btnPrimary}
            onClick={() => navigate('/play')}
            disabled={loading}
          >
            Local 2-Player
          </button>
          <div className={styles.divider}>or play online</div>
          <button
            className={styles.btnPrimary}
            onClick={handleCreate}
            disabled={loading}
          >
            {loading ? 'Creating…' : 'Create Game'}
          </button>
          <button
            className={styles.btnSecondary}
            onClick={() => { setView('join'); setError(null) }}
            disabled={loading}
          >
            Join Game
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}

      {view === 'join' && (
        <div className={styles.menu}>
          <p className={styles.joinLabel}>Enter room code</p>
          <input
            className={styles.codeInput}
            maxLength={6}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="XXXXXX"
            autoFocus
          />
          <button
            className={styles.btnPrimary}
            onClick={handleJoin}
            disabled={loading || joinCode.trim().length !== 6}
          >
            {loading ? 'Joining…' : 'Join Game'}
          </button>
          <button
            className={styles.btnSecondary}
            onClick={() => { setView('home'); setError(null) }}
            disabled={loading}
          >
            Back
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}
    </div>
  )
}
