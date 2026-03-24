import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import styles from './WaitingRoom.module.css'

export default function WaitingRoom() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const roomIdRef = useRef(null)

  // One-time setup: validate room and subscribe to realtime
  useEffect(() => {
    let cancelled = false
    let channel

    supabase
      .from('rooms')
      .select('id, status')
      .eq('code', code)
      .single()
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err || !data) { setError('Room not found.'); return }
        if (data.status === 'playing') { navigate(`/room/${code}/play`); return }
        if (data.status === 'finished') { setError('This room has already finished.'); return }

        roomIdRef.current = data.id

        channel = supabase
          .channel(`waiting-${data.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${data.id}` },
            (payload) => {
              if (!cancelled && payload.new.status === 'playing') navigate(`/room/${code}/play`)
            }
          )
          .subscribe()

        if (cancelled) supabase.removeChannel(channel)
      })

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [code, navigate])

  // Polling fallback — runs independently so StrictMode doesn't interfere
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('rooms')
        .select('status')
        .eq('code', code)
        .single()
      if (data?.status === 'playing') navigate(`/room/${code}/play`)
    }, 2000)

    return () => clearInterval(interval)
  }, [code, navigate])

  function handleCopy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.waiting}>
      <h1 className={styles.title}>Great Kingdom</h1>
      <p className={styles.label}>Share this code with your opponent</p>
      <div className={styles.codeBox}>
        <span className={styles.code}>{code}</span>
        <button className={styles.copyBtn} onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className={styles.hint}>Waiting for opponent to join…</p>
      {error && <p className={styles.error}>{error}</p>}
      <button className={styles.backBtn} onClick={() => navigate('/')}>Cancel</button>
    </div>
  )
}
