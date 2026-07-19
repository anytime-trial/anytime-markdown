import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import styles from '../press.module.css';
import { ProcessFlow } from './ProcessFlow';
import { ToolchainCaravan } from './ToolchainCaravan';

interface BriefingItem {
  /** 連番。アイコンを出す節（プロセス節）では番号を出さない */
  num?: string;
  /** 番号の代わりに置く拡張機能アイコンの URL */
  icon?: string;
  head: string;
  body: string;
  verdict: string;
}

interface BriefingWithEmbedProps {
  id?: string;
  items: BriefingItem[];
  embed: ReactNode;
  /** 未指定ならウィンドウ枠（トラフィックライト）を出さず、埋め込みを素の枠内に置く */
  embedTitle?: string;
  embedActions?: ReactNode;
  /** 箇条書きの上に置く補足。プロセス節では関係図（隊商のイラスト）を差し込む */
  mainIntro?: ReactNode;
  /** true で埋め込みを右カラムへ回し、左右を等幅にする（プロセス節: 左=イラスト・右=フロー図） */
  reversed?: boolean;
  title: ReactNode;
}

interface BriefingEmbedProps {
  embed: ReactNode;
  embedActions?: ReactNode;
  subtitle?: string;
  trailKeys?: readonly (typeof TRAIL_KEYS[number])[];
}

const TRAFFIC_LIGHT_COLORS = ['#FF5F57', '#FFBD2E', '#28C840'] as const;
const TRAIL_KEYS = ['trail1', 'trail2', 'trail3', 'trail4', 'trail5', 'trail6', 'trail7', 'trail8', 'trail9', 'trail10', 'trail11', 'trail12', 'trail13', 'trail14', 'trail15', 'trail16', 'trail17', 'trail18', 'trail19', 'trail20', 'trail21', 'trail22', 'trail23', 'trail24', 'trail25', 'trail26'] as const;
const MARKDOWN_KEYS = ['md3', 'md1', 'md2'] as const;
const AGENT_KEYS = ['agent1', 'agent2', 'agent3'] as const;
/** プロセス節の 3 拡張。番号ではなく拡張機能アイコンを見出しに出す */
const PROCESS_EXTS = [
  { key: 'ext1', icon: '/images/anytime-agent-128.png' },
  { key: 'ext2', icon: '/images/anytime-control-256.png' },
  { key: 'ext3', icon: '/images/camel_markdown.png' },
] as const;
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'] as const;

function BriefingWithEmbed({
  id,
  items,
  embed,
  embedTitle,
  embedActions,
  mainIntro,
  reversed,
  title,
}: Readonly<BriefingWithEmbedProps>) {
  const sectionClass = reversed
    ? `${styles.briefingWithEmbed} ${styles.briefingReversed}`
    : styles.briefingWithEmbed;
  return (
    <section className={sectionClass} id={id}>
      <header className={styles.briefingHeader}>
        <span className={styles.briefingHeaderTitle}>{title}</span>
      </header>
      <div className={styles.briefingLeftStack}>
        <div className={styles.briefingEmbed}>
          {embedTitle ? (
            <div className={styles.trailFrameBar}>
              {TRAFFIC_LIGHT_COLORS.map((color) => (
                <span
                  key={color}
                  className={styles.trailFrameDot}
                  style={{ background: color }}
                  aria-hidden="true"
                />
              ))}
              <span className={styles.trailFrameTitle}>{embedTitle}</span>
            </div>
          ) : null}
          <div className={styles.trailFrameBody}>{embed}</div>
        </div>
        {embedActions ? (
          <div className={styles.briefingEmbedActions}>{embedActions}</div>
        ) : null}
      </div>
      <div className={styles.briefingMain}>
        {mainIntro}
        <ul className={`${styles.briefingList} ${styles.briefingListInline}`}>
          {items.map((item) => (
            <li key={item.head}>
              {item.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.icon} alt="" className={styles.briefingHeadIcon} />
              ) : (
                <span className={styles.briefingNum}>{item.num}</span>
              )}
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

export function BriefingProcess() {
  const t = useTranslations('press.process');
  const tBriefing = useTranslations('press.briefing');
  const items: BriefingItem[] = PROCESS_EXTS.map(({ key, icon }) => ({
    icon,
    head: t(`${key}Title`),
    body: t(`${key}Body`),
    verdict: tBriefing('shipped'),
  }));
  return (
    <BriefingWithEmbed
      id="process"
      items={items}
      embed={<ProcessFlow />}
      mainIntro={<ToolchainCaravan />}
      reversed
      title={
        <>
          {t('header')} <em>{t('headerEm')}</em> {t('subtitle')}
        </>
      }
    />
  );
}

export function BriefingPrimary({ embed, embedActions, subtitle, trailKeys = TRAIL_KEYS }: Readonly<BriefingEmbedProps>) {
  const t = useTranslations('VsCode');
  const tBriefing = useTranslations('press.briefing');
  const items: BriefingItem[] = trailKeys.map((key, idx) => ({
    num: ROMAN[idx],
    head: t(`${key}Title`),
    body: t(`${key}Body`),
    verdict: tBriefing('shipped'),
  }));
  return (
    <BriefingWithEmbed
      id="trail"
      embedTitle={tBriefing('trailEmbedTitle')}
      items={items}
      embed={embed}
      embedActions={embedActions}
      title={
        <>
          {tBriefing('trailHeader')} <em>{tBriefing('trailHeaderEm')}</em>{subtitle ? ` ${subtitle}` : null}
        </>
      }
    />
  );
}

interface BriefingAgentProps {
  embed: ReactNode;
  embedActions?: ReactNode;
  subtitle?: string;
}

export function BriefingAgent({ embed, embedActions, subtitle }: Readonly<BriefingAgentProps>) {
  const t = useTranslations('press.agent');
  const tBriefing = useTranslations('press.briefing');
  const items: BriefingItem[] = AGENT_KEYS.map((key, idx) => ({
    num: ROMAN[idx],
    head: t(`${key}Title`),
    body: t(`${key}Body`),
    verdict: tBriefing('shipped'),
  }));
  return (
    <BriefingWithEmbed
      id="agent"
      embedTitle={tBriefing('agentEmbedTitle')}
      items={items}
      embed={embed}
      embedActions={embedActions}
      title={
        <>
          {tBriefing('agentHeader')} <em>{tBriefing('agentHeaderEm')}</em>{subtitle ? ` ${subtitle}` : null}
        </>
      }
    />
  );
}

/** 実装状況。i18n キー `press.briefing.<status>` と対応する */
export type RoadmapStatus = 'shipped' | 'partial' | 'planned';

export interface RoadmapEntry {
  key: typeof TRAIL_KEYS[number];
  status: RoadmapStatus;
}

interface BriefingRoadmapProps {
  subtitle?: string;
  entries: readonly RoadmapEntry[];
}

export function BriefingRoadmap({ subtitle, entries }: Readonly<BriefingRoadmapProps>) {
  const t = useTranslations('VsCode');
  const tBriefing = useTranslations('press.briefing');
  const items = entries.map((entry, idx) => ({
    num: String(idx + 1).padStart(2, '0'),
    head: t(`${entry.key}Title`),
    body: t(`${entry.key}Body`),
    verdict: tBriefing(entry.status),
    status: entry.status,
  }));
  return (
    <section className={styles.briefingRoadmapSection} id="trail-roadmap">
      <header className={styles.briefingHeader}>
        <span className={styles.briefingHeaderTitle}>
          {tBriefing('trailHeader')} <em>{tBriefing('trailHeaderEm')}</em>{subtitle ? ` ${subtitle}` : null}
        </span>
      </header>
      <ul className={styles.briefingListGrid}>
        {items.map((item) => (
          <li key={item.num}>
            <span className={styles.briefingNum}>{item.num}</span>
            <div className={styles.briefingHead}>
              {item.head}
              <p>{item.body}</p>
            </div>
            <span className={styles.briefingVerdict} data-status={item.status}>
              {item.verdict}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BriefingSecondary({ embed, embedActions }: Readonly<BriefingEmbedProps>) {
  const t = useTranslations('VsCode');
  const tBriefing = useTranslations('press.briefing');
  const items: BriefingItem[] = MARKDOWN_KEYS.map((key, idx) => ({
    num: ROMAN[idx],
    head: t(`${key}Title`),
    body: t(`${key}Body`),
    verdict: tBriefing('shipped'),
  }));
  return (
    <BriefingWithEmbed
      id="markdown"
      embedTitle={tBriefing('markdownEmbedTitle')}
      items={items}
      embed={embed}
      embedActions={embedActions}
      title={
        <>
          {tBriefing('markdownHeader')}{' '}
          <em>{tBriefing('markdownHeaderEm')}</em>
        </>
      }
    />
  );
}
