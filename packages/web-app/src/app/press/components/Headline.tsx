import { useLocale, useTranslations } from 'next-intl';

import packageJson from '../../../../package.json';
import styles from '../press.module.css';

const APP_VERSION = `v${packageJson.version}`;

function Ruby({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ruby>{children}</ruby>;
}

function Rt({ children }: Readonly<{ children: React.ReactNode }>) {
  return <rt>{children}</rt>;
}

function Bold({ children }: Readonly<{ children: React.ReactNode }>) {
  return <b>{children}</b>;
}

function HeadlineVermilion({ children }: Readonly<{ children: React.ReactNode }>) {
  return <span className={styles.textVermilion}>{children}</span>;
}

function ruby(chunks: React.ReactNode) { return <Ruby>{chunks}</Ruby>; }
function rt(chunks: React.ReactNode) { return <Rt>{chunks}</Rt>; }
function bold(chunks: React.ReactNode) { return <Bold>{chunks}</Bold>; }
function vermilion(chunks: React.ReactNode) { return <HeadlineVermilion>{chunks}</HeadlineVermilion>; }

export function Headline() {
  const tHead = useTranslations('press.headline');
  const locale = useLocale();
  return (
    <section className={styles.headline}>
      <div>
        <div className={styles.headlineKicker}>{tHead('kicker')}</div>
        <h1 className={styles.headlineTitle} lang={locale}>
          {tHead.rich('title1', { ruby, rt })}
          <em>
            {tHead.rich('title2', { ruby, rt })}
          </em>
        </h1>
        <p className={styles.headlineDeck} lang={locale}>
          {tHead('description')}
        </p>
        <div className={styles.headlineByline}>
          {tHead.rich('byline', { b: bold })}
        </div>
      </div>
      <aside className={styles.headlineAside}>
        <div className={styles.vert} lang={locale}>
          {tHead('asideVert')}
        </div>
        <hr />
        <div>
          <b className={styles.headlineAsideEditor}>{tHead('asideEditor')}</b>
          <br />
          {tHead.rich('asideBody', { vermilion })}
        </div>
        <hr />
        <div className={styles.headlineAsideFooter}>
          <div className={styles.headlineAsideMeta}>
            {tHead('asideMeta1')}
            <br />
            {tHead('asideMeta2Label')}
            {APP_VERSION}
          </div>
          <span className={styles.foldStamp}>{tHead('approvedStamp')}</span>
        </div>
      </aside>
    </section>
  );
}
