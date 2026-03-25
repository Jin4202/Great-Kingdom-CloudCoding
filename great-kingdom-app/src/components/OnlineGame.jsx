import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import GameCanvas from './3d/GameCanvas'
import RulesOverlay from '../RulesOverlay'
import WinOverlay from '../WinOverlay'
import MoveLog from '../MoveLog'
import { useRoom } from '../hooks/useRoom'
import { detectMoveLogEntry } from '../moveLogDetect'
import { isSuicideMove, BLUE, RED, EMPTY, BOARD_SIZE, MAX_PIECES } from '../gameLogic'
import '../App.css'

export default function OnlineGame() {
  const navigate = useNavigate()
  const { gameState, myColor, isMyTurn, status, error, opponentOnline, opponentEverOnline, connectionLost, moveError, dispatchMove, dispatchPass } = useRoom()

  const [moveLog, setMoveLog] = useState([])
  const [showRules, setShowRules] = useState(false)
  const [confirmingPass, setConfirmingPass] = useState(false)
  const [showWin, setShowWin] = useState(false)
  const prevStateRef  = useRef(null)
  const lastLoggedRef = useRef({ lastMove: null, passCount: 0 })

  function colToLetter(col) {
    return String.fromCharCode(65 + col)
  }

  // Derive move log from successive state snapshots.
  // Uses detectMoveLogEntry to deduplicate optimistic-update + realtime-event
  // pairs that carry the same coordinates (key-order-insensitive comparison).
  useEffect(() => {
    if (!gameState) return
    const prev = prevStateRef.current
    prevStateRef.current = gameState

    const entry = detectMoveLogEntry(prev, gameState, lastLoggedRef.current)
    if (entry) {
      if (entry.type === 'place') {
        lastLoggedRef.current = { ...lastLoggedRef.current, lastMove: entry.lastMove }
        const { row, col } = entry.lastMove
        setMoveLog((log) => [
          ...log,
          { player: entry.player, type: 'place', coord: `${colToLetter(col)}${BOARD_SIZE - row}` },
        ])
      } else {
        lastLoggedRef.current = { ...lastLoggedRef.current, passCount: gameState.passCount }
        setMoveLog((log) => [...log, { player: entry.player, type: 'pass' }])
      }
    }

    if (gameState.gameOver && !showWin) setShowWin(true)
  }, [gameState])

  async function handleCellClick(row, col) {
    if (!isMyTurn || !gameState || gameState.gameOver) return
    setConfirmingPass(false)
    await dispatchMove(row, col)
  }

  function hasAvailableMoves() {
    if (!gameState) return false
    const { board, territory, turn } = gameState
    const opponent = turn === BLUE ? RED : BLUE
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== EMPTY) continue
        if (territory[r][c] === opponent) continue
        if (isSuicideMove(board, r, c, turn)) continue
        return true
      }
    }
    return false
  }

  async function commitPass() {
    setConfirmingPass(false)
    await dispatchPass()
  }

  function handlePass() {
    if (!isMyTurn || !gameState || gameState.gameOver) return
    if (hasAvailableMoves()) {
      setConfirmingPass(true)
    } else {
      commitPass()
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────

  if (status === 'connecting') {
    return (
      <div className="app">
        <p style={{ color: '#666', marginTop: 80, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.85rem' }}>
          Connecting…
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app">
        <p style={{ color: '#f08080', margin: '80px 0 24px', fontSize: '0.9rem' }}>
          {error || 'Connection error.'}
        </p>
        <button className="btn btn-reset" onClick={() => navigate('/')}>Back to Lobby</button>
      </div>
    )
  }

  if (!gameState) return null

  // ── Game render ───────────────────────────────────────────────────────────

  const { turn, gameOver, winner, winReason, blueTerritory, redTerritory, board, territory, bluePieces, redPieces } = gameState

  const myColorLabel = myColor === BLUE ? 'Blue' : 'Red'
  const myColorHex   = myColor === BLUE ? '#7ec3f5' : '#ef4444'
  const turnColor    = turn === BLUE ? '#7ec3f5' : '#ef4444'

  const suicideCells = Array.from({ length: BOARD_SIZE }, (_, r) =>
    Array.from({ length: BOARD_SIZE }, (_, c) => {
      if (gameOver || !isMyTurn) return false
      if (board[r][c] !== EMPTY) return false
      const opponent = turn === BLUE ? RED : BLUE
      if (territory[r][c] === opponent) return false
      return isSuicideMove(board, r, c, turn)
    })
  )

  function renderStatus() {
    if (gameOver) {
      const winnerLabel = winner === BLUE ? 'Blue' : 'Red'
      const winnerColor = winner === BLUE ? '#7ec3f5' : '#ef4444'
      if (winReason === 'capture') {
        return (
          <span className="status game-over" style={{ color: winnerColor }}>
            {winnerLabel} wins by capture!
          </span>
        )
      }
      return (
        <span className="status game-over" style={{ color: winnerColor }}>
          {winnerLabel} wins by territory ({blueTerritory} vs {redTerritory}, komi −3)
        </span>
      )
    }
    if (!isMyTurn) {
      return <span className="status" style={{ color: '#666' }}>Waiting for opponent…</span>
    }
    return (
      <span className="status" style={{ color: turnColor }}>
        Your turn
      </span>
    )
  }

  return (
    <div className="app">
      {showRules && <RulesOverlay onClose={() => setShowRules(false)} />}
      {showWin && (
        <WinOverlay
          winner={gameState.winner}
          winReason={gameState.winReason}
          blueTerritory={gameState.blueTerritory}
          redTerritory={gameState.redTerritory}
          onNewGame={() => navigate('/')}
          onReview={() => setShowWin(false)}
        />
      )}

      {connectionLost && (
        <div className="banner banner-error">
          Connection lost — please refresh to reconnect.
        </div>
      )}
      {moveError && !connectionLost && (
        <div className="banner banner-error">{moveError}</div>
      )}
      {!connectionLost && opponentEverOnline && !opponentOnline && !gameOver && (
        <div className="banner banner-warn">
          Opponent disconnected — waiting for them to return…
        </div>
      )}

      <div className="title-row">
        <button className="btn-back" onClick={() => navigate('/')} aria-label="Back to lobby">←</button>
        <h1 className="title">Great Kingdom</h1>
        <button className="btn-rules" onClick={() => setShowRules(true)} aria-label="Show rules">?</button>
        <div className="online-badge">
          You are&nbsp;<span style={{ color: myColorHex, fontWeight: 800 }}>{myColorLabel}</span>
        </div>
      </div>

      <div className="scoreboard">
        <div className="score-card score-blue">
          <span className="score-player">Blue</span>
          <div className="score-nums">
            <span className="score-big">{blueTerritory}</span>
            <span className="score-lbl">terr</span>
            <span className="score-sep">·</span>
            <span className="score-big">{MAX_PIECES - bluePieces}</span>
            <span className="score-lbl">left</span>
          </div>
        </div>
        <div className="score-status">{renderStatus()}</div>
        <div className="score-card score-red">
          <span className="score-player">Red</span>
          <div className="score-nums">
            <span className="score-big">{MAX_PIECES - redPieces}</span>
            <span className="score-lbl">left</span>
            <span className="score-sep">·</span>
            <span className="score-big">{redTerritory}</span>
            <span className="score-lbl">terr</span>
          </div>
        </div>
      </div>

      <div className="board-area">
        <GameCanvas
          board={board}
          territory={territory}
          turn={turn}
          onCellClick={handleCellClick}
          lastMove={gameState.lastMove}
          gameOver={gameOver}
          winReason={winReason}
          suicideCells={suicideCells}
          isOpponentTurn={!isMyTurn && !gameOver}
        />
        <div className="sidebar">
          <MoveLog entries={moveLog} />
          {confirmingPass ? (
            <div className="pass-confirm">
              <span className="pass-confirm-msg">You still have moves. Pass anyway?</span>
              <button className="btn-pass-yes" onClick={commitPass}>Yes, Pass</button>
              <button className="btn-pass-cancel" onClick={() => setConfirmingPass(false)}>Cancel</button>
            </div>
          ) : (
            <div className="controls">
              <button
                className="btn btn-pass"
                onClick={handlePass}
                disabled={!isMyTurn || gameOver}
              >
                Pass
              </button>
              <button className="btn btn-reset" onClick={() => navigate('/')}>
                Leave
              </button>
            </div>
          )}
          <div className="legend">
            <div className="legend-item">
              <div className="legend-stone blue-stone" />
              <span>Blue (First, +3)</span>
            </div>
            <div className="legend-item">
              <div className="legend-stone red-stone" />
              <span>Red (Second)</span>
            </div>
            <div className="legend-item">
              <div className="legend-stone neutral-stone" />
              <span>Neutral</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
