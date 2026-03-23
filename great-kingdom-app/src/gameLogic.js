export const EMPTY = 0;
export const BLUE = 1;
export const ORANGE = 2;
export const NEUTRAL = 3;

export const BOARD_SIZE = 9;
export const CENTER = Math.floor(BOARD_SIZE / 2); // 4

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

// BFS: collect all connected cells with the same board value as (r, c)
function getGroup(board, r, c) {
  const target = board[r][c];
  const group = [];
  const visited = new Set();
  const queue = [[r, c]];
  visited.add(`${r},${c}`);

  while (queue.length) {
    const [cr, cc] = queue.shift();
    group.push([cr, cc]);
    for (const [dr, dc] of DIRS) {
      const nr = cr + dr;
      const nc = cc + dc;
      const key = `${nr},${nc}`;
      if (inBounds(nr, nc) && !visited.has(key) && board[nr][nc] === target) {
        visited.add(key);
        queue.push([nr, nc]);
      }
    }
  }
  return group;
}

// Count distinct empty orthogonal neighbors of a group (its liberties)
function getLiberties(board, group) {
  const libertySet = new Set();
  for (const [r, c] of group) {
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && board[nr][nc] === EMPTY) {
        libertySet.add(`${nr},${nc}`);
      }
    }
  }
  return libertySet.size;
}

// After placing player's piece at (r,c), check if any adjacent enemy group has 0 liberties.
function hasCapture(board, r, c, player) {
  const enemy = player === BLUE ? ORANGE : BLUE;
  const checked = new Set();

  for (const [dr, dc] of DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    const key = `${nr},${nc}`;
    if (!inBounds(nr, nc) || board[nr][nc] !== enemy || checked.has(key)) continue;

    const group = getGroup(board, nr, nc);
    group.forEach(([gr, gc]) => checked.add(`${gr},${gc}`));

    if (getLiberties(board, group) === 0) return true;
  }
  return false;
}

// Flood-fill all empty regions and determine territory ownership.
// Rules:
//   - Region bordered only by one player's pieces (+ edges + neutral) → that player's territory
//   - Region bordered by both players, or by no pieces at all (only edges) → no territory
//   - NEUTRAL acts as a wall (neutral, not owned by either player)
export function computeTerritory(board) {
  const territory = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(0)
  );
  const visited = new Set();
  let blueCount = 0;
  let orangeCount = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const key = `${r},${c}`;
      if (board[r][c] !== EMPTY || visited.has(key)) continue;

      // BFS to collect connected empty region
      const region = [];
      const queue = [[r, c]];
      visited.add(key);
      let hasBlue = false;
      let hasOrange = false;
      let touchesEdge = false;

      while (queue.length) {
        const [cr, cc] = queue.shift();
        region.push([cr, cc]);

        for (const [dr, dc] of DIRS) {
          const nr = cr + dr;
          const nc = cc + dc;
          const nkey = `${nr},${nc}`;

          if (!inBounds(nr, nc)) { touchesEdge = true; continue; } // board edge

          const cell = board[nr][nc];
          if (cell === BLUE) { hasBlue = true; continue; }
          if (cell === ORANGE) { hasOrange = true; continue; }
          if (cell === NEUTRAL) continue; // neutral = wall

          // EMPTY neighbor not yet visited
          if (!visited.has(nkey)) {
            visited.add(nkey);
            queue.push([nr, nc]);
          }
        }
      }

      // Assign ownership — region must be fully enclosed (no board-edge touch)
      let owner = 0;
      if (!touchesEdge && hasBlue && !hasOrange) {
        owner = BLUE;
        blueCount += region.length;
      } else if (!touchesEdge && hasOrange && !hasBlue) {
        owner = ORANGE;
        orangeCount += region.length;
      }

      for (const [tr, tc] of region) {
        territory[tr][tc] = owner;
      }
    }
  }

  return { territory, blueCount, orangeCount };
}

// ── Public state helpers ──────────────────────────────────────────────────────

export function createInitialBoard() {
  const board = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(EMPTY)
  );
  board[CENTER][CENTER] = NEUTRAL;
  return board;
}

export function createInitialState() {
  const board = createInitialBoard();
  const { territory, blueCount, orangeCount } = computeTerritory(board);
  return {
    board,
    territory,
    turn: BLUE,
    passCount: 0,
    gameOver: false,
    winner: null,      // BLUE | ORANGE | null
    winReason: null,   // 'capture' | 'territory' | null
    lastMove: null,
    blueTerritory: blueCount,
    orangeTerritory: orangeCount,
  };
}

export function placeStone(state, row, col) {
  const { board, turn, territory } = state;

  if (board[row][col] !== EMPTY) return null;

  // Rule: cannot place inside the opponent's confirmed territory
  const opponent = turn === BLUE ? ORANGE : BLUE;
  if (territory[row][col] === opponent) return null;

  const newBoard = board.map((r) => [...r]);
  newBoard[row][col] = turn;

  // Rule: if placement captures any enemy piece → instant win
  if (hasCapture(newBoard, row, col, turn)) {
    const { territory: newTerritory, blueCount, orangeCount } = computeTerritory(newBoard);
    return {
      ...state,
      board: newBoard,
      territory: newTerritory,
      turn: opponent,
      passCount: 0,
      lastMove: { row, col },
      gameOver: true,
      winner: turn,
      winReason: 'capture',
      blueTerritory: blueCount,
      orangeTerritory: orangeCount,
    };
  }

  // Normal placement — recompute territory and no-entry zones
  const { territory: newTerritory, blueCount, orangeCount } = computeTerritory(newBoard);
  return {
    ...state,
    board: newBoard,
    territory: newTerritory,
    turn: opponent,
    passCount: 0,
    lastMove: { row, col },
    blueTerritory: blueCount,
    orangeTerritory: orangeCount,
  };
}

export function passTurn(state) {
  const newPassCount = state.passCount + 1;

  // Both players passed → end game, count territory
  if (newPassCount >= 2) {
    const { blueTerritory, orangeTerritory } = state;
    // Blue (first player) wins only if territory >= orange + 3 (komi)
    const winner = blueTerritory >= orangeTerritory + 3 ? BLUE : ORANGE;
    return {
      ...state,
      passCount: newPassCount,
      gameOver: true,
      winner,
      winReason: 'territory',
    };
  }

  return {
    ...state,
    turn: state.turn === BLUE ? ORANGE : BLUE,
    passCount: newPassCount,
    lastMove: null,
  };
}
