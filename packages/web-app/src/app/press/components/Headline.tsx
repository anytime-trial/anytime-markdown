import styles from '../press.module.css';

export function Headline() {
  return (
    <section className={styles.headline}>
      <div>
        <div className={styles.headlineKicker}>
          no.001 — a quiet manifesto for browser-native writing
        </div>
        <h1 className={styles.headlineTitle} lang="ja">
          コードも文書もAIも
          <br />
          <em>見える化する</em>
        </h1>
        <p className={styles.headlineDeck} lang="ja">
          AIエージェントは、苛酷な砂漠（開発環境）を往くキャラバン。Markdown
          の WYSIWYG 編集・差分レビューと、TypeScript
          プロジェクトのリアルタイム可視化で、その旅路を安全に見守り導く —
          AI時代の羅針盤となる 2 つの VS Code 拡張です。
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
