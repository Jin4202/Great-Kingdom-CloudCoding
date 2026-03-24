import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Board from '../Board'
import RulesOverlay from '../RulesOverlay'
import WinOverlay from '../WinOverlay'
import MoveLog from '../MoveLog'
import { useRoom } from '../hooks/useRoom'
import { isSuicideMove, BLUE, ORANGE, EMPTY, BOARD_SIZE, MAX_PIECES } from '../gameLogic'
import '../App.css'

export default function OnlineGame() {
  const navigate = useNavigate()
  const { gameState, myColor, isMyTurn, status, error, dispatchMove, dispatchPass } = useRoom()

  const [moveLog, setMoveLog] = useState([])
  const [showRules, setShowRules] = useState(false)
  const [confirmingPass, setConfirmingPass] = useState(false)
  const [showWin, setShowWin] = useState(false)
  const prevStateRef = useRef(null)

  function colToLetter(col) {
    return String.fromCharCode(65 + col)
  }

  // Derive move log from successive state snapshots
  useEffect(() => {
    if (!gameState) return
    const prev = prevStateRef.current
    prevStateRef.current = gameState
    if (!prev) return // skip initial load

    if (
      gameState.lastMove &&
      JSON.stringify(gameState.lastMove) !== JSON.stringify(prev.lastMove)
    ) {
      const { row, col } = gameState.lastMove
      setMoveLog((log) => [
        ...log,
        { player: prev.turn, type: 'place', coord: `${colToLetter(col)}${BOARD_SIZE - row}` },
      ])
    } else if (gameState.passCount > prev.passCount) {
      setMoveLog((log) => [...log, { player: prev.turn, type: 'pass' }])
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
    const opponent = turn === BLUE ? ORANGE : BLUE
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

  const { turn, gameOver, winner, winReason, blueTerritory, orangeTerritory, board, territory, bluePieces, orangePieces } = gameState

  const myColorLabel = myColor === BLUE ? 'Blue' : 'Orange'
  const myColorHex   = myColor === BLUE ? '#7ec3f5' : '#ffcc77'
  const turnColor    = turn   === BLUE ? '#7ec3f5' : '#ffcc77'

  const suicideCells = Array.from({ length: BOARD_SIZE }, (_, r) =>
    Array.from({ length: BOARD_SIZE }, (_, c) => {
      if (gameOver || !isMyTurn) return false
      if (board[r][c] !== EMPTY) return false
      const opponent = turn === BLUE ? ORANGE : BLUE
      if (territory[r][c] === opponent) return false
      return isSuicideMove(board, r, c, turn)
    })
  )

  function renderStatus() {
    if (gameOver) {
      const winnerLabel = winner === BLUE ? 'Blue' : 'Orange'
      const winnerColor = winner === BLUE ? '#7ec3f5' : '#ffcc77'
      if (winReason === 'capture') {
        return (
          <span className="status game-over" style={{ color: winnerColor }}>
            {winnerLabel} wins by capture!
          </span>
        )
      }
      return (
        <span className="status game-over" style={{ color: winnerColor }}>
          {winnerLabel} wins by territory ({blueTerritory} vs {orangeTerritory}, komi −3)
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
          orangeTerritory={gameState.orangeTerritory}
          onNewGame={() => navigate('/')}
          onReview={() => setShowWin(false)}
        />
      )}

      <div className="title-row">
        <button className="btn-back" onClick={() => navigate('/')} aria-label="Back to lobby">←</button>
        <h1 className="title">Great Kingdom</h1>
        <button className="btn-rules" onClick={() => setShowRules(true)} aria-label="Show rules">?</button>
      </div>

      <div className="online-badge">
        You are&nbsp;<span style={{ color: myColorHex, fontWeight: 800 }}>{myColorLabel}</span>
      </div>

      <div className="territory-bar">
        <div className="territory-item blue-terr">
          <span className="terr-label">Blue</span>
          <span className="terr-count">{blueTerritory}</span>
        </div>
        <div className="territory-divider">territory</div>
        <div className="territory-item orange-terr">
          <span className="terr-label">Orange</span>
          <span className="terr-count">{orangeTerritory}</span>
        </div>
      </div>

      <div className="pieces-bar">
        <div className="pieces-item blue-pieces">
          <span className="pieces-label">Blue</span>
          <span className="pieces-remaining">{MAX_PIECES - bluePieces}</span>
          <span className="pieces-unit">left</span>
        </div>
        <div className="pieces-divider">pieces</div>
        <div className="pieces-item orange-pieces">
          <span className="pieces-label">Orange</span>
          <span className="pieces-remaining">{MAX_PIECES - orangePieces}</span>
          <span className="pieces-unit">left</span>
        </div>
      </div>

      <div className="status-bar">{renderStatus()}</div>

      <div className="board-area">
        <Board
          board={board}
          territory={territory}
          turn={turn}
          onCellClick={handleCellClick}
          lastMove={gameState.lastMove}
          gameOver={gameOver}
          suicideCells={suicideCells}
          isOpponentTurn={!isMyTurn && !gameOver}
        />
        <MoveLog entries={moveLog} />
      </div>

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

      {confirmingPass && (
        <div className="pass-confirm">
          <span className="pass-confirm-msg">You still have moves. Pass anyway?</span>
          <button className="btn-pass-yes" onClick={commitPass}>Yes, Pass</button>
          <button className="btn-pass-cancel" onClick={() => setConfirmingPass(false)}>Cancel</button>
        </div>
      )}

      <div className="legend">
        <div className="legend-item">
          <div className="legend-stone blue-stone" />
          <span>Blue (First, needs +3)</span>
        </div>
        <div className="legend-item">
          <div className="legend-stone orange-stone" />
          <span>Orange (Second)</span>
        </div>
        <div className="legend-item">
          <div className="legend-stone neutral-stone" />
          <span>Neutral</span>
        </div>
      </div>
    </div>
  )
}
