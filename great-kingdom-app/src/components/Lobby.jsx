import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ensureAuth } from '../lib/supabase'
import { createInitialState } from '../gameLogic'
import styles from './Lobby.module.css'

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
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

const JOIN_ERRORS = {
  room_not_found:    'Room not found.',
  already_creator:   'You created this room — share the code with a friend.',
  room_not_available:'Room is already full or finished.',
  wrong_password:    'Incorrect password.',
  unauthorized:      'Not signed in.',
}

export default function Lobby() {
  const navigate = useNavigate()
  // 'home' | 'create' | 'join' | 'browse'
  const [view, setView] = useState('home')

  // create form state
  const [visibility, setVisibility] = useState('private')
  const [createPassword, setCreatePassword] = useState('')

  // join-by-code state
  const [joinCode, setJoinCode] = useState('')

  // browse state
  const [publicRooms, setPublicRooms] = useState([])
  const [browseLoading, setBrowseLoading] = useState(false)
  // code of the row currently prompting for a password
  const [promptCode, setPromptCode] = useState(null)
  const [promptPassword, setPromptPassword] = useState('')

  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // ── Create ──────────────────────────────────────────────────────────────────

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
      const user = await ensureAuth()
      const code = generateCode()
      const isPublic = visibility === 'public'
      const pwd = isPublic && createPassword.trim() ? createPassword.trim() : null

      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .insert({
          code,
          status:       'waiting',
          blue_user:    user.id,
          visibility,
          has_password: pwd !== null,
        })
        .select('id')
        .single()
      if (roomErr) throw roomErr

      if (pwd !== null) {
        const { error: secErr } = await supabase
          .from('room_secrets')
          .insert({ room_id: room.id, password: pwd })
        if (secErr) throw secErr
      }

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

  // ── Join by code ─────────────────────────────────────────────────────────────

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) { setError('Enter a 6-character room code.'); return }
    setLoading(true)
    setError(null)
    try {
      await ensureAuth()
      const { data, error: rpcErr } = await supabase.rpc('join_room', { p_code: code })
      if (rpcErr) throw rpcErr
      if (data.error) throw new Error(JOIN_ERRORS[data.error] ?? data.error)
      navigate(`/room/${code}/play`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Browse public rooms ──────────────────────────────────────────────────────

  async function fetchPublicRooms() {
    setBrowseLoading(true)
    const { data } = await supabase
      .from('rooms')
      .select('code, created_at, has_password')
      .eq('visibility', 'public')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(50)
    setPublicRooms(data ?? [])
    setBrowseLoading(false)
  }

  // Fetch + subscribe when entering browse view
  const channelRef = useRef(null)
  useEffect(() => {
    if (view !== 'browse') return
    fetchPublicRooms()

    channelRef.current = supabase
      .channel('public-lobby')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: "visibility=eq.public" },
        () => fetchPublicRooms()
      )
      .subscribe()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [view])

  async function handleBrowseJoin(code, hasPassword) {
    if (hasPassword) {
      setPromptCode(code)
      setPromptPassword('')
      return
    }
    await doJoinPublic(code, null)
  }

  async function handlePasswordJoin(code) {
    await doJoinPublic(code, promptPassword)
  }

  async function doJoinPublic(code, password) {
    setLoading(true)
    setError(null)
    try {
      await ensureAuth()
      const { data, error: rpcErr } = await supabase.rpc('join_room', {
        p_code:     code,
        p_password: password ?? undefined,
      })
      if (rpcErr) throw rpcErr
      if (data.error) throw new Error(JOIN_ERRORS[data.error] ?? data.error)
      navigate(`/room/${code}/play`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setPromptCode(null)
    }
  }

  function goHome() {
    setView('home')
    setError(null)
    setPromptCode(null)
    setCreatePassword('')
    setVisibility('private')
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={styles.lobby}>
      <h1 className={styles.title}>Great Kingdom</h1>
      <p className={styles.subtitle}>2-Player Strategy by Lee Se-dol</p>

      {/* ── Home ── */}
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
            onClick={() => { setView('create'); setError(null) }}
            disabled={loading}
          >
            Create Game
          </button>
          <button
            className={styles.btnSecondary}
            onClick={() => { setView('browse'); setError(null) }}
            disabled={loading}
          >
            Browse Public Games
          </button>
          <button
            className={styles.btnSecondary}
            onClick={() => { setView('join'); setError(null) }}
            disabled={loading}
          >
            Join by Code
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}

      {/* ── Create ── */}
      {view === 'create' && (
        <div className={styles.menu}>
          <p className={styles.joinLabel}>Room visibility</p>
          <div className={styles.toggleRow}>
            <button
              className={visibility === 'private' ? styles.toggleActive : styles.toggleInactive}
              onClick={() => { setVisibility('private'); setCreatePassword('') }}
            >
              Private
            </button>
            <button
              className={visibility === 'public' ? styles.toggleActive : styles.toggleInactive}
              onClick={() => setVisibility('public')}
            >
              Public
            </button>
          </div>
          {visibility === 'private' && (
            <p className={styles.hint}>Opponents join using your 6-character room code.</p>
          )}
          {visibility === 'public' && (
            <>
              <p className={styles.hint}>Your room will appear in the public lobby.</p>
              <input
                className={styles.passwordInput}
                type="password"
                placeholder="Password (optional)"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
              />
            </>
          )}
          <button
            className={styles.btnPrimary}
            onClick={handleCreate}
            disabled={loading}
          >
            {loading ? 'Creating…' : 'Create Room'}
          </button>
          <button
            className={styles.btnSecondary}
            onClick={goHome}
            disabled={loading}
          >
            Back
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}

      {/* ── Join by code ── */}
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
            onClick={goHome}
            disabled={loading}
          >
            Back
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}

      {/* ── Browse public rooms ── */}
      {view === 'browse' && (
        <div className={styles.browsePanel}>
          <div className={styles.browseHeader}>
            <span className={styles.browseTitle}>Public Games</span>
            <button
              className={styles.refreshBtn}
              onClick={fetchPublicRooms}
              disabled={browseLoading || loading}
            >
              ↺
            </button>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          {browseLoading && publicRooms.length === 0 && (
            <p className={styles.hint}>Loading…</p>
          )}

          {!browseLoading && publicRooms.length === 0 && (
            <p className={styles.hint}>No public games waiting right now.</p>
          )}

          {publicRooms.length > 0 && (
            <ul className={styles.roomList}>
              {publicRooms.map((room) => (
                <li key={room.code} className={styles.roomRow}>
                  <span className={styles.roomCode}>{room.code}</span>
                  {room.has_password && <span className={styles.lockIcon}>🔒</span>}
                  <span className={styles.roomAge}>{relativeTime(room.created_at)}</span>

                  {promptCode === room.code ? (
                    <div className={styles.promptInline}>
                      <input
                        className={styles.promptInput}
                        type="password"
                        placeholder="Password"
                        value={promptPassword}
                        onChange={(e) => setPromptPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handlePasswordJoin(room.code)}
                        autoFocus
                      />
                      <button
                        className={styles.btnJoinSmall}
                        onClick={() => handlePasswordJoin(room.code)}
                        disabled={loading || !promptPassword}
                      >
                        Join
                      </button>
                      <button
                        className={styles.btnCancelSmall}
                        onClick={() => setPromptCode(null)}
                        disabled={loading}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      className={styles.btnJoinSmall}
                      onClick={() => handleBrowseJoin(room.code, room.has_password)}
                      disabled={loading}
                    >
                      Join
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <button
            className={styles.btnSecondary}
            style={{ marginTop: '16px' }}
            onClick={goHome}
            disabled={loading}
          >
            Back
          </button>
        </div>
      )}
    </div>
  )
}

function relativeTime(iso) {
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (secs < 60)  return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}
