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
}

const TRAIL_KEYS = ['trail1', 'trail2', 'trail3', 'trail4'] as const;
const MARKDOWN_KEYS = ['md3', 'md1', 'md2'] as const;
const ROMAN = ['i', 'ii', 'iii', 'iv'] as const;

function BriefingWithEmbed({
  id,
  items,
  embed,
  embedTitle,
  embedActions,
  title,
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
          <span className={styles.briefingHeaderTitle}>{title}</span>
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
  const t = useTranslations('VsCode');
  const tBriefing = useTranslations('press.briefing');
  const items: BriefingItem[] = TRAIL_KEYS.map((key, idx) => ({
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
          {tBriefing('trailHeader')} <em>{tBriefing('trailHeaderEm')}</em>
        </>
      }
    />
  );
}

export function BriefingSecondary({ embed, embedActions }: BriefingEmbedProps) {
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
