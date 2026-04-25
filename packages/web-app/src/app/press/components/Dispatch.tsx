import styles from '../press.module.css';

export function Dispatch() {
  return (
    <section className={styles.dispatch} id="dispatch">
      <header className={styles.dispatchHeader}>
        <span className={styles.dispatchNum}>№002 ／ DISPATCH</span>
        <h2 className={styles.dispatchSection}>
          Three modes, <em>one notebook.</em>
        </h2>
        <span className={styles.dispatchMeta}>filed 04:12 JST</span>
      </header>
      <div className={styles.columns}>
        <p>
          Anytime Markdown
          は速くない。書き手の歩幅で動く。三つの編集モード — 原稿用紙のごとき
          WYSIWYG、隊商の地図のような構造プレビュー、そして素朴な源文 —
          はそれぞれが独立した部屋ではなく、同じ机の上で開かれた三冊のノートのように振る舞う。文字列ではなく、思考の体勢を切り替えるための装置である。
        </p>
        <h3>The slow road, by design.</h3>
        <p>
          AI と向き合うとき、最も警戒すべきは「速さの快楽」である。Spec-Driven
          Development
          の哲学は、書く前に立ち止まることを要請する。本誌の編集機は、章立てを段差として可視化し、書き換えの差分を線単位ではなく節単位で示す。
          <span className={styles.textVermilion}>差分は、出来事である。</span>
        </p>
        <h3>Browser-only, server-never.</h3>
        <p>
          原稿はサーバに渡らない。ブラウザの内側、IndexedDB
          の小さな抽斗に収まる。署名も追跡も不要。隊商が砂を踏み、足跡だけを残して去るように、本ツールはあなたのデータに足跡だけを残さない。
        </p>
        <h3>Long-form, KaTeX, Mermaid.</h3>
        <p>
          数式は KaTeX、図は Mermaid。Admonition、脚注、表、リスト — GitHub
          Flavored Markdown
          の全ての方言を解する。出力は紙に印刷できる PDF と、何処にも依存しない単一
          HTML、二種類で十分とする。
        </p>
      </div>
    </section>
  );
}
