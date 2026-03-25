import styles from './RulesOverlay.module.css';

export default function RulesOverlay({ onClose }) {
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>How to Play</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close rules">✕</button>
        </div>

        <div className={styles.body}>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Goal</h3>
            <ul className={styles.list}>
              <li><strong>Capture win</strong> — surround any enemy piece on all 4 orthogonal sides. The game ends immediately.</li>
              <li><strong>Territory win</strong> — if both players pass consecutively, the player with more enclosed empty squares wins. Blue (first) needs at least 3 more than Red to win.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>On Your Turn</h3>
            <ul className={styles.list}>
              <li>Place one piece on any empty square, <em>or</em> pass.</li>
              <li>Each player has <strong>40 pieces</strong> total.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Placement Restrictions</h3>
            <ul className={styles.list}>
              <li><span className={styles.tagBlocked}>Grey</span> cells — inside the opponent's territory. You cannot place here.</li>
              <li><span className={styles.tagSuicide}>Red ×</span> cells — suicide moves. Placing here would leave your group with no liberties and is not allowed.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Territory</h3>
            <ul className={styles.list}>
              <li>An empty region enclosed <em>only</em> by your pieces, board edges, and/or the neutral castle becomes your territory.</li>
              <li>A region touching all 4 board edges, or enclosed by both players, is not counted.</li>
              <li>The neutral castle at the center counts as a wall — it can be part of your enclosure.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Alive Groups</h3>
            <ul className={styles.list}>
              <li>A group with even one enclosed empty space (eye) is <strong>alive</strong>.</li>
              <li>The opponent cannot enter your confirmed territory, so an alive group can never be captured.</li>
              <li>Two pieces along a board edge are enough to form an eye.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Key Differences from Go</h3>
            <div className={styles.table}>
              <div className={styles.tableRow}>
                <span className={styles.tableKey}>One eye is enough</span>
                <span className={styles.tableVal}>Go requires two independent eyes</span>
              </div>
              <div className={styles.tableRow}>
                <span className={styles.tableKey}>Capture = instant win</span>
                <span className={styles.tableVal}>Go continues after capture</span>
              </div>
              <div className={styles.tableRow}>
                <span className={styles.tableKey}>No Ko rule</span>
                <span className={styles.tableVal}>Go has Ko restriction</span>
              </div>
              <div className={styles.tableRow}>
                <span className={styles.tableKey}>No entry in opponent territory</span>
                <span className={styles.tableVal}>Go allows invasion</span>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
