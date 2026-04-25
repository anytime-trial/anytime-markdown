import type { ReactNode } from 'react';

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

interface BriefingPrimaryProps {
  embed: ReactNode;
}

const PRIMARY_ITEMS: BriefingItem[] = [
  {
    num: 'i',
    head: '構造の可視化',
    body: 'TypeScript プロジェクトを解析し、C4 アーキテクチャ図と DSM（依存構造マトリクス）を自動生成。L1〜L4 でドリルダウンし、循環依存は赤枠でひと目で把握。',
    verdict: '— shipped',
  },
  {
    num: 'ii',
    head: '品質の可視化',
    body: 'テストデータを C4 図に重ねて表示し、テスト不足モジュールを一目で特定できる。',
    verdict: '— shipped',
  },
  {
    num: 'iii',
    head: '行動の可視化',
    body: 'Claude Code の作業ログを自動収集し、モデル別コスト・ツール使用量・コミット履歴を一元管理。AI エージェントの編集箇所もグラフ上でリアルタイム追跡。',
    verdict: '— shipped',
  },
  {
    num: 'iv',
    head: '画像で誘導',
    body: 'Agent Note にスクリーンキャプチャやアノテーションを貼り、AI に視覚的コンテキストを共有。スキルからノートを参照した作業もワンコマンド。',
    verdict: '— shipped',
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

export function BriefingPrimary({ embed }: BriefingPrimaryProps) {
  return (
    <section className={styles.briefingWithEmbed} id="briefing">
      <div className={styles.briefingEmbed}>
        <div className={styles.trailFrameBar}>
          <span
            className={styles.trailFrameDot}
            style={{ background: '#FF5F57' }}
            aria-hidden="true"
          />
          <span
            className={styles.trailFrameDot}
            style={{ background: '#FFBD2E' }}
            aria-hidden="true"
          />
          <span
            className={styles.trailFrameDot}
            style={{ background: '#28C840' }}
            aria-hidden="true"
          />
          <span className={styles.trailFrameTitle}>
            anytime-trail — trail viewer
          </span>
        </div>
        <div className={styles.trailFrameBody}>{embed}</div>
      </div>
      <div className={styles.briefingMain}>
        <header className={styles.briefingHeader}>
          <span className={styles.briefingHeaderTitle}>
            Field <em>Notes.</em>
          </span>
          <small className={styles.briefingHeaderNo}>BRIEFING ／ NO.003</small>
        </header>
        <ul className={`${styles.briefingList} ${styles.briefingListInline}`}>
          {PRIMARY_ITEMS.map((item) => (
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
      </div>
    </section>
  );
}

export function BriefingSecondary() {
  return <Briefing no="BRIEFING ／ NO.004" items={SECONDARY_ITEMS} />;
}
