import { useLocale, useTranslations } from 'next-intl';

import packageJson from '../../../../package.json';
import styles from '../press.module.css';

const APP_VERSION = `v${packageJson.version}`;

export function Headline() {
  const tHead = useTranslations('press.headline');
  const locale = useLocale();
  return (
    <section className={styles.headline}>
      <div>
        <div className={styles.headlineKicker}>{tHead('kicker')}</div>
        <h1 className={styles.headlineTitle} lang={locale}>
          {tHead.rich('title1', {
            ruby: (chunks) => <ruby>{chunks}</ruby>,
            rt: (chunks) => <rt>{chunks}</rt>,
          })}
          <em>
            {tHead.rich('title2', {
              ruby: (chunks) => <ruby>{chunks}</ruby>,
              rt: (chunks) => <rt>{chunks}</rt>,
            })}
          </em>
        </h1>
        <p className={styles.headlineDeck} lang={locale}>
          {tHead('description')}
        </p>
        <div className={styles.headlineByline}>
          {tHead.rich('byline', {
            b: (chunks) => <b>{chunks}</b>,
          })}
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
          {tHead.rich('asideBody', {
            vermilion: (chunks) => (
              <span className={styles.textVermilion}>{chunks}</span>
            ),
          })}
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
