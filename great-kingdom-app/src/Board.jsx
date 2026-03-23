import { EMPTY, BLUE, ORANGE, NEUTRAL, BOARD_SIZE } from './gameLogic';
import styles from './Board.module.css';

export default function Board({ board, territory, turn, onCellClick, lastMove, gameOver, suicideCells }) {
  return (
    <div className={styles.wrapper}>
      {/* Column labels */}
      <div className={styles.colLabels}>
        <div className={styles.corner} />
        {Array.from({ length: BOARD_SIZE }, (_, i) => (
          <div key={i} className={styles.label}>
            {String.fromCharCode(65 + i)}
          </div>
        ))}
      </div>

      <div className={styles.boardRow}>
        {/* Row labels */}
        <div className={styles.rowLabels}>
          {Array.from({ length: BOARD_SIZE }, (_, i) => (
            <div key={i} className={styles.label}>
              {BOARD_SIZE - i}
            </div>
          ))}
        </div>

        {/* Board */}
        <div className={styles.board}>
          {board.map((row, r) =>
            row.map((cell, c) => {
              const isLast = lastMove?.row === r && lastMove?.col === c;
              const isEmpty = cell === EMPTY;
              const terrOwner = territory?.[r]?.[c] ?? 0;

              // A cell is blocked for the current player if it's opponent's confirmed territory
              const opponent = turn === BLUE ? ORANGE : BLUE;
              const isBlocked = isEmpty && terrOwner === opponent;

              const isSuicide = suicideCells?.[r]?.[c] ?? false;

              // Hover styles only for placeable empty cells
              const canPlace = isEmpty && !isBlocked && !isSuicide && !gameOver;

              return (
                <button
                  key={`${r}-${c}`}
                  className={[
                    styles.cell,
                    isEmpty ? styles.empty : '',
                    terrOwner === BLUE ? styles.blueTerritory : '',
                    terrOwner === ORANGE ? styles.orangeTerritory : '',
                    isBlocked ? styles.blocked : '',
                    isSuicide ? styles.suicide : '',
                    canPlace && turn === BLUE ? styles.hoverBlue : '',
                    canPlace && turn === ORANGE ? styles.hoverOrange : '',
                  ].join(' ')}
                  onClick={() => onCellClick(r, c)}
                  disabled={!canPlace}
                  aria-label={`${String.fromCharCode(65 + c)}${BOARD_SIZE - r}`}
                >
                  {cell !== EMPTY && (
                    <div
                      className={[
                        styles.piece,
                        cell === BLUE ? styles.bluePiece : '',
                        cell === ORANGE ? styles.orangePiece : '',
                        cell === NEUTRAL ? styles.neutralPiece : '',
                        isLast ? styles.lastMove : '',
                        isLast ? styles.pieceNew : '',
                      ].join(' ')}
                    />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
