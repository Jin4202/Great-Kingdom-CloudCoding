import { useState } from 'react';
import Board from './Board';
import {
  createInitialState,
  placeStone,
  passTurn,
  BLUE,
  ORANGE,
} from './gameLogic';
import './App.css';

export default function App() {
  const [state, setState] = useState(createInitialState());

  function handleCellClick(row, col) {
    if (state.gameOver) return;
    const next = placeStone(state, row, col);
    if (next) setState(next);
  }

  function handlePass() {
    if (state.gameOver) return;
    setState(passTurn(state));
  }

  function handleReset() {
    setState(createInitialState());
  }

  const { turn, gameOver, winner, winReason, blueTerritory, orangeTerritory } = state;
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
      <h1 className="title">Great Kingdom</h1>

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

      <div className="status-bar">{renderStatus()}</div>

      <Board
        board={state.board}
        territory={state.territory}
        turn={state.turn}
        onCellClick={handleCellClick}
        lastMove={state.lastMove}
        gameOver={gameOver}
      />

      <div className="controls">
        <button className="btn btn-pass" onClick={handlePass} disabled={gameOver}>
          Pass
        </button>
        <button className="btn btn-reset" onClick={handleReset}>
          New Game
        </button>
      </div>

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
