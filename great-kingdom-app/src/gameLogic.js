export const EMPTY = 0;
export const BLUE = 1;
export const ORANGE = 2;
export const NEUTRAL = 3;

export const BOARD_SIZE = 9;
export const CENTER = Math.floor(BOARD_SIZE / 2); // 4

export function createInitialBoard() {
  const board = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(EMPTY)
  );
  board[CENTER][CENTER] = NEUTRAL;
  return board;
}

export function createInitialState() {
  return {
    board: createInitialBoard(),
    turn: BLUE,
    passCount: 0,
    gameOver: false,
    winner: null,
    lastMove: null,
  };
}

export function placeStone(state, row, col) {
  const { board, turn } = state;

  // Cannot place on occupied cell
  if (board[row][col] !== EMPTY) return null;

  const newBoard = board.map((r) => [...r]);
  newBoard[row][col] = turn;

  return {
    ...state,
    board: newBoard,
    turn: turn === BLUE ? ORANGE : BLUE,
    passCount: 0,
    lastMove: { row, col },
  };
}

export function passTurn(state) {
  const newPassCount = state.passCount + 1;
  if (newPassCount >= 2) {
    return { ...state, passCount: newPassCount, gameOver: true, winner: null };
  }
  return {
    ...state,
    turn: state.turn === BLUE ? ORANGE : BLUE,
    passCount: newPassCount,
    lastMove: null,
  };
}
