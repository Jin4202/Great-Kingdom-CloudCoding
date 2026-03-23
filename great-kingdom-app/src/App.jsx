import { useState } from 'react';
import Board from './Board';
import { createInitialState, placeStone, passTurn, BLUE, ORANGE } from './gameLogic';
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

  const turnLabel = state.turn === BLUE ? 'Blue' : 'Orange';
  const turnColor = state.turn === BLUE ? '#1a5fa8' : '#d96a00';

  return (
    <div className="app">
      <h1 className="title">Great Kingdom</h1>

      <div className="status-bar">
        {state.gameOver ? (
          <span className="status game-over">
            Both players passed — game over
          </span>
        ) : (
          <span className="status" style={{ color: turnColor }}>
            {turnLabel}'s turn
          </span>
        )}
      </div>

      <Board
        board={state.board}
        turn={state.turn}
        onCellClick={handleCellClick}
        lastMove={state.lastMove}
      />

      <div className="controls">
        <button
          className="btn btn-pass"
          onClick={handlePass}
          disabled={state.gameOver}
        >
          Pass
        </button>
        <button className="btn btn-reset" onClick={handleReset}>
          New Game
        </button>
      </div>

      <div className="legend">
        <div className="legend-item">
          <div className="legend-stone blue-stone" />
          <span>Blue (First)</span>
        </div>
        <div className="legend-item">
          <div className="legend-stone orange-stone" />
          <span>Orange (Second)</span>
        </div>
        <div className="legend-item">
          <div className="legend-stone neutral-stone" />
          <span>Neutral (Fixed)</span>
        </div>
      </div>
    </div>
  );
}
