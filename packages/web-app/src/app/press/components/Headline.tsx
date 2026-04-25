import { useTranslations } from 'next-intl';

import packageJson from '../../../../package.json';
import styles from '../press.module.css';

const APP_VERSION = `v${packageJson.version}`;

export function Headline() {
  const tVsCode = useTranslations('VsCode');
  const tHead = useTranslations('press.headline');
  return (
    <section className={styles.headline}>
      <div>
        <div className={styles.headlineKicker}>{tHead('kicker')}</div>
        <h1 className={styles.headlineTitle}>
          {tHead('title1')}
          <br />
          <em>{tHead('title2')}</em>
        </h1>
        <p className={styles.headlineDeck}>{tVsCode('heroDescription')}</p>
        <div className={styles.headlineByline}>
          {tHead.rich('byline', {
            b: (chunks) => <b>{chunks}</b>,
          })}
        </div>
      </div>
      <aside className={styles.headlineAside}>
        <div className={styles.vert}>{tHead('asideVert')}</div>
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
