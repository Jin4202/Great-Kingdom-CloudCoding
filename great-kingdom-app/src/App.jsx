import { useState } from 'react';
import Board from './Board';
import RulesOverlay from './RulesOverlay';
import WinOverlay from './WinOverlay';
import MoveLog from './MoveLog';
import {
  createInitialState,
  placeStone,
  passTurn,
  isSuicideMove,
  BLUE,
  ORANGE,
  EMPTY,
  BOARD_SIZE,
  MAX_PIECES,
} from './gameLogic';
import './App.css';

export default function App() {
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
    const opponent = turn === BLUE ? ORANGE : BLUE;
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

  const { turn, gameOver, winner, winReason, blueTerritory, orangeTerritory, board, territory, bluePieces, orangePieces } = state;

  // Precompute which empty cells are suicide for the current player
  const suicideCells = Array.from({ length: BOARD_SIZE }, (_, r) =>
    Array.from({ length: BOARD_SIZE }, (_, c) => {
      if (gameOver) return false;
      const opponent = turn === BLUE ? ORANGE : BLUE;
      if (board[r][c] !== EMPTY) return false;
      if (territory[r][c] === opponent) return false; // already blocked for a different reason
      return isSuicideMove(board, r, c, turn);
    })
  );
  const turnLabel = turn === BLUE ? 'Blue' : 'Orange';
  const turnColor = turn === BLUE ? '#7ec3f5' : '#ffcc77';

  function renderStatus() {
    if (!gameOver) {
      return (
        <span className="status" style={{ color: turnColor }}>
          {turnLabel}'s turn
        </span>
      );
    }

    const winnerLabel = winner === BLUE ? 'Blue' : 'Orange';
    const winnerColor = winner === BLUE ? '#7ec3f5' : '#ffcc77';

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
        {winnerLabel} wins by territory ({blueTerritory} vs {orangeTerritory}, komi −3)
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
          orangeTerritory={state.orangeTerritory}
          onNewGame={handleReset}
          onReview={() => setShowWin(false)}
        />
      )}

      <div className="title-row">
        <h1 className="title">Great Kingdom</h1>
        <button className="btn-rules" onClick={() => setShowRules(true)} aria-label="Show rules">?</button>
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
          board={state.board}
          territory={state.territory}
          turn={state.turn}
          onCellClick={handleCellClick}
          lastMove={state.lastMove}
          gameOver={gameOver}
          suicideCells={suicideCells}
        />
        <MoveLog entries={moveLog} />
      </div>

      <div className="controls">
        <button className="btn btn-pass" onClick={handlePass} disabled={gameOver}>
          Pass
        </button>
        <button className="btn btn-undo" onClick={handleUndo} disabled={history.length === 0}>
          Undo
        </button>
        <button className="btn btn-reset" onClick={handleReset}>
          New Game
        </button>
      </div>

      {confirmingPass && (
        <div className="pass-confirm">
          <span className="pass-confirm-msg">You still have moves. Pass anyway?</span>
          <button className="btn btn-pass-yes" onClick={commitPass}>Yes, Pass</button>
          <button className="btn btn-pass-cancel" onClick={() => setConfirmingPass(false)}>Cancel</button>
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
  );
}
