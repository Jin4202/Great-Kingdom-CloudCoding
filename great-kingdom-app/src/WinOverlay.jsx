import styles from './WinOverlay.module.css';
import { BLUE } from './gameLogic';

export default function WinOverlay({ winner, winReason, blueTerritory, redTerritory, onNewGame, onReview }) {
  const isBlue = winner === BLUE;
  const winnerLabel = isBlue ? 'Blue' : 'Red';
  const winnerColor = isBlue ? '#7ec3f5' : '#ffcc77';

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.crown}>♛</div>

        <h2 className={styles.winner} style={{ color: winnerColor }}>
          {winnerLabel} Wins!
        </h2>

        {winReason === 'capture' ? (
          <p className={styles.reason}>by capture</p>
        ) : (
          <div className={styles.scores}>
            <div className={styles.scoreRow}>
              <span className={styles.scoreBlue}>{blueTerritory}</span>
              <span className={styles.scoreDivider}>vs</span>
              <span className={styles.scoreRed}>{redTerritory}</span>
            </div>
            <p className={styles.komi}>Blue needs +3 (komi) to win</p>
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.btnNew} onClick={onNewGame}>New Game</button>
          <button className={styles.btnReview} onClick={onReview}>Review Board</button>
        </div>
      </div>
    </div>
  );
}
