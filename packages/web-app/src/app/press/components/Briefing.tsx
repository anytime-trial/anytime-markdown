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

interface BriefingWithEmbedProps {
  no: string;
  id?: string;
  items: BriefingItem[];
  embed: ReactNode;
  embedTitle: string;
  embedActions?: ReactNode;
}

interface BriefingEmbedProps {
  embed: ReactNode;
  embedActions?: ReactNode;
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
    num: 'i',
    head: 'VS Code で文書も図表もプレビュー',
    body: 'AI が生成した Markdown を WYSIWYG で即確認。Mermaid・PlantUML・数式（KaTeX）もエディタ内で直接プレビューでき、コンテキストスイッチなしで完結。',
    verdict: '— shipped',
  },
  {
    num: 'ii',
    head: 'AI の足跡をレビューし、確定箇所を守る',
    body: 'AI が編集した箇所を色付きで表示し、セクション単位の差分比較で変更点を即把握。確定済みのセクションはロックして AI の再編集を防止。',
    verdict: '— shipped',
  },
  {
    num: 'iii',
    head: '3 モードを瞬時に切替',
    body: 'WYSIWYG・ソース・レビューの 3 モードをワンクリックで切替。レビューモードは読み取り専用で、AI 出力の集中レビューに最適。',
    verdict: '— shipped',
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

function BriefingWithEmbed({
  no,
  id,
  items,
  embed,
  embedTitle,
  embedActions,
}: BriefingWithEmbedProps) {
  return (
    <section className={styles.briefingWithEmbed} id={id}>
      <div className={styles.briefingLeftStack}>
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
            <span className={styles.trailFrameTitle}>{embedTitle}</span>
          </div>
          <div className={styles.trailFrameBody}>{embed}</div>
        </div>
        {embedActions ? (
          <div className={styles.briefingEmbedActions}>{embedActions}</div>
        ) : null}
      </div>
      <div className={styles.briefingMain}>
        <header className={styles.briefingHeader}>
          <span className={styles.briefingHeaderTitle}>
            Field <em>Notes.</em>
          </span>
          <small className={styles.briefingHeaderNo}>{no}</small>
        </header>
        <ul className={`${styles.briefingList} ${styles.briefingListInline}`}>
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
      </div>
    </section>
  );
}

export function BriefingPrimary({ embed, embedActions }: BriefingEmbedProps) {
  return (
    <BriefingWithEmbed
      id="briefing"
      no="BRIEFING ／ NO.003"
      embedTitle="anytime-trail — trail viewer"
      items={PRIMARY_ITEMS}
      embed={embed}
      embedActions={embedActions}
    />
  );
}

export function BriefingSecondary({ embed, embedActions }: BriefingEmbedProps) {
  return (
    <BriefingWithEmbed
      no="BRIEFING ／ NO.004"
      embedTitle="anytime-markdown — markdown editor"
      items={SECONDARY_ITEMS}
      embed={embed}
      embedActions={embedActions}
    />
  );
}
