import { EMPTY, BLUE, ORANGE, NEUTRAL, BOARD_SIZE } from './gameLogic';
import styles from './Board.module.css';

export default function Board({ board, turn, onCellClick, lastMove }) {
  return (
    <div className={styles.boardWrapper}>
      <div className={styles.board}>
        {/* Grid lines */}
        <div className={styles.grid}>
          {Array.from({ length: BOARD_SIZE - 1 }, (_, row) =>
            Array.from({ length: BOARD_SIZE - 1 }, (_, col) => (
              <div key={`${row}-${col}`} className={styles.cell} />
            ))
          )}
        </div>

        {/* Star points (hoshi) */}
        {[[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]].map(([r, c]) => (
          <div
            key={`star-${r}-${c}`}
            className={styles.starPoint}
            style={{
              top: `calc(${r} * (100% / ${BOARD_SIZE - 1}))`,
              left: `calc(${c} * (100% / ${BOARD_SIZE - 1}))`,
            }}
          />
        ))}

        {/* Intersection hit areas + stones */}
        {board.map((row, r) =>
          row.map((cell, c) => {
            const isLast = lastMove?.row === r && lastMove?.col === c;
            return (
              <button
                key={`${r}-${c}`}
                className={styles.intersection}
                style={{
                  top: `calc(${r} * (100% / ${BOARD_SIZE - 1}))`,
                  left: `calc(${c} * (100% / ${BOARD_SIZE - 1}))`,
                }}
                onClick={() => onCellClick(r, c)}
                disabled={cell !== EMPTY}
                aria-label={`Row ${r + 1}, Col ${c + 1}`}
              >
                {cell !== EMPTY && (
                  <div
                    className={[
                      styles.stone,
                      cell === BLUE ? styles.blueStone : '',
                      cell === ORANGE ? styles.orangeStone : '',
                      cell === NEUTRAL ? styles.neutralStone : '',
                      isLast ? styles.lastMove : '',
                    ].join(' ')}
                  />
                )}
                {cell === EMPTY && (
                  <div
                    className={[
                      styles.ghost,
                      turn === BLUE ? styles.ghostBlue : styles.ghostOrange,
                    ].join(' ')}
                  />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Column labels */}
      <div className={styles.colLabels}>
        {Array.from({ length: BOARD_SIZE }, (_, i) => (
          <span key={i}>{String.fromCharCode(65 + i)}</span>
        ))}
      </div>

      {/* Row labels */}
      <div className={styles.rowLabels}>
        {Array.from({ length: BOARD_SIZE }, (_, i) => (
          <span key={i}>{BOARD_SIZE - i}</span>
        ))}
      </div>
    </div>
  );
}
