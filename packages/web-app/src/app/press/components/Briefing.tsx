import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import styles from '../press.module.css';

interface BriefingItem {
  num: string;
  head: string;
  body: string;
  verdict: string;
}

interface BriefingWithEmbedProps {
  id?: string;
  items: BriefingItem[];
  embed: ReactNode;
  embedTitle: string;
  embedActions?: ReactNode;
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
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'] as const;

function BriefingWithEmbed({
  id,
  items,
  embed,
  embedTitle,
  embedActions,
  title,
}: Readonly<BriefingWithEmbedProps>) {
  return (
    <section className={styles.briefingWithEmbed} id={id}>
      <header className={styles.briefingHeader}>
        <span className={styles.briefingHeaderTitle}>{title}</span>
      </header>
      <div className={styles.briefingLeftStack}>
        <div className={styles.briefingEmbed}>
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
          <div className={styles.trailFrameBody}>{embed}</div>
        </div>
        {embedActions ? (
          <div className={styles.briefingEmbedActions}>{embedActions}</div>
        ) : null}
      </div>
      <div className={styles.briefingMain}>
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

interface BriefingRoadmapProps {
  subtitle?: string;
  trailKeys: readonly (typeof TRAIL_KEYS[number])[];
  verdict?: string;
}

export function BriefingRoadmap({ subtitle, trailKeys, verdict }: Readonly<BriefingRoadmapProps>) {
  const t = useTranslations('VsCode');
  const tBriefing = useTranslations('press.briefing');
  const verdictText = verdict ?? tBriefing('shipped');
  const items: BriefingItem[] = trailKeys.map((key, idx) => ({
    num: String(idx + 1).padStart(2, '0'),
    head: t(`${key}Title`),
    body: t(`${key}Body`),
    verdict: verdictText,
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
            <span className={styles.briefingVerdict}>{item.verdict}</span>
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
