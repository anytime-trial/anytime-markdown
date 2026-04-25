import styles from '../press.module.css';

interface BriefingItem {
  num: string;
  head: string;
  body: string;
  verdict: string;
}

const ITEMS: BriefingItem[] = [
  {
    num: 'i',
    head: 'Section-level diff',
    body: '行ではなく、節 (section) ごとに差分を取る。AIに書き直されても、構造の変化が一瞥で分かる。',
    verdict: '— shipped',
  },
  {
    num: 'ii',
    head: 'Three-mode switching',
    body: 'WYSIWYG ／ Outline ／ Source。同じ机の上で、三冊のノートを開きっぱなしにできる。',
    verdict: '— shipped',
  },
  {
    num: 'iii',
    head: 'Spec-driven, AI-collaborative',
    body: '仕様 (spec) を最上流の聖典とし、AI への指示も仕様の一部として版管理される。',
    verdict: '— shipped',
  },
  {
    num: 'iv',
    head: 'Offline, single-binary export',
    body: '記事一本を、画像とフォントごと一つの HTML に圧縮。誰の許可もなく送れる。',
    verdict: '— v0.42',
  },
  {
    num: 'v',
    head: 'VS Code companion',
    body: '本紙とは別に、VS Code 拡張 (Anytime Trail) が C4 アーキテクチャ図を生成する。',
    verdict: '— in print',
  },
];

export function Briefing() {
  return (
    <section className={styles.briefing} id="briefing">
      <div className={styles.briefingLabel}>
        Field
        <br />
        <em>Notes.</em>
        <small>BRIEFING ／ NO.003</small>
      </div>
      <ul className={styles.briefingList}>
        {ITEMS.map((item) => (
          <li key={item.num}>
            <span className={styles.briefingNum}>{item.num}</span>
            <div className={styles.briefingHead}>
              {item.head}
              <p>{item.body}</p>
            </div>
            <span className={styles.briefingVerdict}>{item.verdict}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
