export const EMPTY = 0;
export const BLUE = 1;
export const RED = 2;
export const NEUTRAL = 3;

export const BOARD_SIZE = 9;
export const CENTER = Math.floor(BOARD_SIZE / 2); // 4
export const MAX_PIECES = 40;

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
  const enemy = player === BLUE ? RED : BLUE;
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
  let redCount = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const key = `${r},${c}`;
      if (board[r][c] !== EMPTY || visited.has(key)) continue;

      // BFS to collect connected empty region
      const region = [];
      const queue = [[r, c]];
      visited.add(key);
      let hasBlue = false;
      let hasRed = false;
      const edgesTouched = new Set(); // 'top' | 'bottom' | 'left' | 'right'

      while (queue.length) {
        const [cr, cc] = queue.shift();
        region.push([cr, cc]);

        for (const [dr, dc] of DIRS) {
          const nr = cr + dr;
          const nc = cc + dc;
          const nkey = `${nr},${nc}`;

          if (!inBounds(nr, nc)) {
            // Record which board edge was hit
            if (nr < 0)              edgesTouched.add('top');
            else if (nr >= BOARD_SIZE) edgesTouched.add('bottom');
            else if (nc < 0)         edgesTouched.add('left');
            else                     edgesTouched.add('right');
            continue;
          }

          const cell = board[nr][nc];
          if (cell === BLUE)    { hasBlue = true; continue; }
          if (cell === RED)     { hasRed = true; continue; }
          if (cell === NEUTRAL) continue; // neutral = wall

          // EMPTY neighbor not yet visited
          if (!visited.has(nkey)) {
            visited.add(nkey);
            queue.push([nr, nc]);
          }
        }
      }

      // Only a region touching all 4 board edges is considered open (the entire board).
      // Regions touching 0–3 edges are valid territory candidates (interior, side, corner, or
      // three-sided enclosures where pieces close off the remaining side).
      // Additionally, at least one player's piece must border the region (pure edge enclosures
      // with no pieces are not territory per §4-4).
      let owner = 0;
      if (edgesTouched.size <= 3 && hasBlue && !hasRed) {
        owner = BLUE;
        blueCount += region.length;
      } else if (edgesTouched.size <= 3 && hasRed && !hasBlue) {
        owner = RED;
        redCount += region.length;
      }

      for (const [tr, tc] of region) {
        territory[tr][tc] = owner;
      }
    }
  }

  return { territory, blueCount, redCount };
}

// Returns true if placing `player` at (row, col) would be a suicide move.
export function isSuicideMove(board, row, col, player) {
  if (board[row][col] !== EMPTY) return false;
  const tempBoard = board.map((r) => [...r]);
  tempBoard[row][col] = player;
  if (hasCapture(tempBoard, row, col, player)) return false; // capture takes priority
  const ownGroup = getGroup(tempBoard, row, col);
  return getLiberties(tempBoard, ownGroup) === 0;
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
  const { territory, blueCount, redCount } = computeTerritory(board);
  return {
    board,
    territory,
    turn: BLUE,
    passCount: 0,
    gameOver: false,
    winner: null,      // BLUE | RED | null
    winReason: null,   // 'capture' | 'territory' | null
    lastMove: null,
    blueTerritory: blueCount,
    redTerritory: redCount,
    bluePieces: 0,
    redPieces: 0,
  };
}

export function placeStone(state, row, col) {
  const { board, turn, territory } = state;

  if (board[row][col] !== EMPTY) return null;

  // Rule: each player has at most MAX_PIECES pieces
  const piecesPlaced = turn === BLUE ? state.bluePieces : state.redPieces;
  if (piecesPlaced >= MAX_PIECES) return null;

  // Rule: cannot place inside the opponent's confirmed territory
  const opponent = turn === BLUE ? RED : BLUE;
  if (territory[row][col] === opponent) return null;

  const newBoard = board.map((r) => [...r]);
  newBoard[row][col] = turn;

  // Rule: suicide is not allowed — cannot place if the resulting group has 0 liberties
  // and no enemy group is captured by the move.
  if (!hasCapture(newBoard, row, col, turn)) {
    const ownGroup = getGroup(newBoard, row, col);
    if (getLiberties(newBoard, ownGroup) === 0) return null;
  }

  const newBluePieces = turn === BLUE ? state.bluePieces + 1 : state.bluePieces;
  const newRedPieces = turn === RED ? state.redPieces + 1 : state.redPieces;

  // Rule: if placement captures any enemy piece → instant win
  if (hasCapture(newBoard, row, col, turn)) {
    const { territory: newTerritory, blueCount, redCount } = computeTerritory(newBoard);
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
      redTerritory: redCount,
      bluePieces: newBluePieces,
      redPieces: newRedPieces,
    };
  }

  // Normal placement — recompute territory and no-entry zones
  const { territory: newTerritory, blueCount, redCount } = computeTerritory(newBoard);
  return {
    ...state,
    board: newBoard,
    territory: newTerritory,
    turn: opponent,
    passCount: 0,
    lastMove: { row, col },
    blueTerritory: blueCount,
    redTerritory: redCount,
    bluePieces: newBluePieces,
    redPieces: newRedPieces,
  };
}

export function passTurn(state) {
  const newPassCount = state.passCount + 1;

  // Both players passed → end game, recompute territory and count
  if (newPassCount >= 2) {
    const { territory: finalTerritory, blueCount, redCount } = computeTerritory(state.board);
    // Blue (first player) wins only if territory >= red + 3 (komi)
    const winner = blueCount >= redCount + 3 ? BLUE : RED;
    return {
      ...state,
      territory: finalTerritory,
      blueTerritory: blueCount,
      redTerritory: redCount,
      passCount: newPassCount,
      gameOver: true,
      winner,
      winReason: 'territory',
    };
  }

  return {
    ...state,
    turn: state.turn === BLUE ? RED : BLUE,
    passCount: newPassCount,
    lastMove: null,
  };
}
