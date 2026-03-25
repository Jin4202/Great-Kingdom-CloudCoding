import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameCanvas from './components/3d/GameCanvas';
import RulesOverlay from './RulesOverlay';
import WinOverlay from './WinOverlay';
import MoveLog from './MoveLog';
import {
  createInitialState,
  placeStone,
  passTurn,
  isSuicideMove,
  BLUE,
  RED,
  EMPTY,
  BOARD_SIZE,
  MAX_PIECES,
} from './gameLogic';
import './App.css';

export default function App({ mode = 'local' }) {
  const navigate = useNavigate();
  const [state, setState] = useState(createInitialState());
  const [history, setHistory] = useState([]);
  const [moveLog, setMoveLog] = useState([]);
  const [showRules, setShowRules] = useState(false);
  const [confirmingPass, setConfirmingPass] = useState(false);
  const [showWin, setShowWin] = useState(false);

  function colToLetter(col) {
    return String.fromCharCode(65 + col);
  }

  function handleCellClick(row, col) {
    if (state.gameOver) return;
    setConfirmingPass(false);
    const next = placeStone(state, row, col);
    if (next) {
      setHistory((h) => [...h, state]);
      setMoveLog((log) => [...log, {
        player: state.turn,
        type: 'place',
        coord: `${colToLetter(col)}${BOARD_SIZE - row}`,
      }]);
      setState(next);
      if (next.gameOver) setShowWin(true);
    }
  }

  function hasAvailableMoves() {
    const opponent = turn === BLUE ? RED : BLUE;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== EMPTY) continue;
        if (territory[r][c] === opponent) continue;
        if (isSuicideMove(board, r, c, turn)) continue;
        return true;
      }
    }
    return false;
  }

  function commitPass() {
    setConfirmingPass(false);
    setHistory((h) => [...h, state]);
    setMoveLog((log) => [...log, { player: state.turn, type: 'pass' }]);
    const next = passTurn(state);
    setState(next);
    if (next.gameOver) setShowWin(true);
  }

  function handlePass() {
    if (state.gameOver) return;
    if (hasAvailableMoves()) {
      setConfirmingPass(true);
    } else {
      commitPass();
    }
  }

  function handleUndo() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setMoveLog((log) => log.slice(0, -1));
    setState(prev);
  }

  function handleReset() {
    setState(createInitialState());
    setHistory([]);
    setMoveLog([]);
    setConfirmingPass(false);
    setShowWin(false);
  }

  const { turn, gameOver, winner, winReason, blueTerritory, redTerritory, board, territory, bluePieces, redPieces } = state;

  // Precompute which empty cells are suicide for the current player
  const suicideCells = Array.from({ length: BOARD_SIZE }, (_, r) =>
    Array.from({ length: BOARD_SIZE }, (_, c) => {
      if (gameOver) return false;
      const opponent = turn === BLUE ? RED : BLUE;
      if (board[r][c] !== EMPTY) return false;
      if (territory[r][c] === opponent) return false; // already blocked for a different reason
      return isSuicideMove(board, r, c, turn);
    })
  );
  const turnLabel = turn === BLUE ? 'Blue' : 'Red';
  const turnColor = turn === BLUE ? '#7ec3f5' : '#ef4444';

  function renderStatus() {
    if (!gameOver) {
      return (
        <span className="status" style={{ color: turnColor }}>
          {turnLabel}'s turn
        </span>
      );
    }

    const winnerLabel = winner === BLUE ? 'Blue' : 'Red';
    const winnerColor = winner === BLUE ? '#7ec3f5' : '#ef4444';

    if (winReason === 'capture') {
      return (
        <span className="status game-over" style={{ color: winnerColor }}>
          {winnerLabel} wins by capture!
        </span>
      );
    }

    // territory win
    return (
      <span className="status game-over" style={{ color: winnerColor }}>
        {winnerLabel} wins by territory ({blueTerritory} vs {redTerritory}, komi −3)
      </span>
    );
  }

  return (
    <div className="app">
      {showRules && <RulesOverlay onClose={() => setShowRules(false)} />}
      {showWin && (
        <WinOverlay
          winner={state.winner}
          winReason={state.winReason}
          blueTerritory={state.blueTerritory}
          redTerritory={state.redTerritory}
          onNewGame={handleReset}
          onReview={() => setShowWin(false)}
        />
      )}

      <div className="title-row">
        <button className="btn-back" onClick={() => navigate('/')} aria-label="Back to lobby">←</button>
        <h1 className="title">Great Kingdom</h1>
        <button className="btn-rules" onClick={() => setShowRules(true)} aria-label="Show rules">?</button>
        {mode === 'online' && <div className="online-badge">Online</div>}
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
          board={state.board}
          territory={state.territory}
          turn={state.turn}
          onCellClick={handleCellClick}
          lastMove={state.lastMove}
          gameOver={gameOver}
          winReason={winReason}
          suicideCells={suicideCells}
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
              <button className="btn btn-pass" onClick={handlePass} disabled={gameOver}>Pass</button>
              {mode === 'local' && (
                <button className="btn btn-undo" onClick={handleUndo} disabled={history.length === 0}>Undo</button>
              )}
              <button className="btn btn-reset" onClick={handleReset}>New Game</button>
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
  );
}
