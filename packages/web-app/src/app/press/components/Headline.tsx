import styles from '../press.module.css';

export function Headline() {
  return (
    <section className={styles.headline}>
      <div>
        <div className={styles.headlineKicker}>
          no.001 — a quiet manifesto for browser-native writing
        </div>
        <h1 className={styles.headlineTitle}>
          Write
          <br />
          Markdown,
          <br />
          <em>Beautifully.</em>
        </h1>
        <p className={styles.headlineDeck}>
          A free, open-source markdown editor that works entirely in your
          browser. No sign-up, no server — your words stay yours.
        </p>
        <div className={styles.headlineByline}>
          Filed by <b>The Caravan Press</b> · Anytime Trail · 隊商出版部 ·
          全文無料公開
        </div>
      </div>
      <aside className={styles.headlineAside}>
        <div className={styles.vert} lang="ja">
          砂嵐を渡る、長い旅の供。
        </div>
        <hr />
        <div>
          <b className={styles.headlineAsideEditor}>From the editor&apos;s desk</b>
          <br />
          速い道具は迷子にさせる。
          <br />
          <span className={styles.textVermilion}>Anytime Markdown</span>{' '}
          は、書き手の歩幅で歩く。
        </div>
        <hr />
        <div className={styles.headlineAsideMeta} lang="ja">
          ☞ 起稿: 2024
          <br />
          ☞ 版数: v0.42.1
          <br />
          ☞ 出庫:{' '}
          <span className={styles.textVermilion}>browser-only</span>
        </div>
      </aside>
    </section>
  );
}
