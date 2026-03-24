import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import styles from './WaitingRoom.module.css'

export default function WaitingRoom() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Check current status immediately (handles race where opponent joined first)
    supabase
      .from('rooms')
      .select('id, status')
      .eq('code', code)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) { setError('Room not found.'); return }
        if (data.status === 'playing') navigate(`/room/${code}/play`)
        if (data.status === 'finished') setError('This room has already finished.')
      })

    // Subscribe to room updates
    const channel = supabase
      .channel(`waiting-${code}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
        (payload) => {
          if (payload.new.status === 'playing') navigate(`/room/${code}/play`)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
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
