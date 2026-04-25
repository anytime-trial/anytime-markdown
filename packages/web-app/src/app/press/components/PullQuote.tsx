import styles from '../press.module.css';

export function PullQuote() {
  return (
    <section className={styles.pullQuote}>
      <q>速い道具は、書き手を迷子にする。隊商の歩幅で、文字を運ぶ。</q>
      <div className={styles.pullQuoteAttr}>— editorial · 巻頭言 · vol.iii</div>
    </section>
  );
}
