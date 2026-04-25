import styles from '../press.module.css';

interface BriefingItem {
  num: string;
  head: string;
  body: string;
  verdict: string;
}

interface BriefingProps {
  no: string;
  items: BriefingItem[];
  id?: string;
}

const PRIMARY_ITEMS: BriefingItem[] = [
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

const SECONDARY_ITEMS: BriefingItem[] = [
  {
    num: 'vi',
    head: 'KaTeX, first-class',
    body: '数式は LaTeX 記法のまま組版される。等幅フォントで誤魔化さない、印刷品質の式。',
    verdict: '— shipped',
  },
  {
    num: 'vii',
    head: 'Mermaid for diagrams',
    body: 'フロー図・状態遷移・C4 図はテキストで書き、git diff に乗せる。スクリーンショットは添付しない。',
    verdict: '— shipped',
  },
  {
    num: 'viii',
    head: 'Inline AI margin notes',
    body: 'AI の提案は本文を書き換えず、欄外に朱書きで残す。採否の決定は書き手の手元に。',
    verdict: '— drafting',
  },
  {
    num: 'ix',
    head: 'Encrypted notebooks',
    body: 'IndexedDB を AES-GCM で暗号化。鍵は手元の鍵、サーバには渡さない。',
    verdict: '— v0.50',
  },
  {
    num: 'x',
    head: 'Mobile companion',
    body: 'Capacitor で iOS / Android のスタンドアロン版。隊商と一緒に持ち歩ける編集机。',
    verdict: '— in print',
  },
];

export function Briefing({ no, items, id }: BriefingProps) {
  return (
    <section className={styles.briefing} id={id}>
      <div className={styles.briefingLabel}>
        Field
        <br />
        <em>Notes.</em>
        <small>{no}</small>
      </div>
      <ul className={styles.briefingList}>
        {items.map((item) => (
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

export function BriefingPrimary() {
  return <Briefing id="briefing" no="BRIEFING ／ NO.003" items={PRIMARY_ITEMS} />;
}

export function BriefingSecondary() {
  return <Briefing no="BRIEFING ／ NO.004" items={SECONDARY_ITEMS} />;
}
