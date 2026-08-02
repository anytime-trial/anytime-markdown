import { useTranslations } from 'next-intl';

import styles from '../press.module.css';

const KEYS = ['item1', 'item2', 'item3', 'item4', 'item5', 'item6'] as const;

export function Ticker() {
  const t = useTranslations('press.ticker');
  const items = KEYS.map((key) => t(key));
  return (
    <div className={styles.ticker} aria-hidden="true">
      <div className={styles.tickerTrack}>
        {[...items, ...items].map((item, idx) => (
          <span key={`${item}-${idx}`}>
            <span className={styles.tickerItem}>{item}</span>
            <span className={styles.tickerSep}>✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
