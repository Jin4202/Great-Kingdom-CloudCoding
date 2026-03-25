import { useEffect, useRef } from 'react';
import { BLUE } from './gameLogic';
import styles from './MoveLog.module.css';

export default function MoveLog({ entries }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Move Log</div>
      <div className={styles.list}>
        {entries.length === 0 && (
          <span className={styles.empty}>No moves yet</span>
        )}
        {entries.map((entry, i) => (
          <div key={i} className={styles.entry}>
            <span className={styles.num}>{i + 1}</span>
            <span className={entry.player === BLUE ? styles.blue : styles.red}>
              {entry.player === BLUE ? 'Blue' : 'Red'}
            </span>
            <span className={styles.coord}>
              {entry.type === 'pass' ? 'Pass' : entry.coord}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
