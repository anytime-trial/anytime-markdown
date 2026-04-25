import { useTranslations } from 'next-intl';
import Link from 'next/link';

import styles from '../press.module.css';

const GITHUB_REPO_URL = 'https://github.com/anytime-trial/anytime-markdown';
const GITHUB_LICENSE_URL =
  'https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE';

export function Colophon() {
  const t = useTranslations('press.colophon');
  const tLanding = useTranslations('Landing');
  const showDocsEdit = process.env.NEXT_PUBLIC_ENABLE_DOCS_EDIT === 'true';
  const showGraph = process.env.NEXT_PUBLIC_SHOW_GRAPH === '1';
  const showSheet = process.env.NEXT_PUBLIC_SHOW_SHEET === '1';
  const showPlaylist = process.env.NEXT_PUBLIC_SHOW_PLAYLIST === '1';
  return (
    <footer>
      <section className={styles.colophon} id="archive">
        <div>
          <h4>{t('press')}</h4>
          <ul>
            <li>
              <Link href="/privacy">{t('privacyPolicy')}</Link>
            </li>
            <li>
              <a
                href={GITHUB_LICENSE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('license')}
              </a>
            </li>
            <li>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('github')}
              </a>
            </li>
            {showDocsEdit ? (
              <li>
                <Link href="/docs/edit">{tLanding('docsEditPage')}</Link>
              </li>
            ) : null}
          </ul>
        </div>
        <div>
          <h4>{t('dispatch')}</h4>
          <ul>
            <li>
              <Link href="/markdown">{t('onlineEditor')}</Link>
            </li>
            <li>
              <Link href="/trail">{t('trailArchitecture')}</Link>
            </li>
            <li>
              <Link href="/report">{tLanding('reportPage')}</Link>
            </li>
            <li>
              <Link href="/docs">{tLanding('sitesPage')}</Link>
            </li>
            {showGraph ? (
              <li>
                <Link href="/graph">{tLanding('graphPage')}</Link>
              </li>
            ) : null}
            {showSheet ? (
              <li>
                <Link href="/sheet">{tLanding('sheetPage')}</Link>
              </li>
            ) : null}
            {showPlaylist ? (
              <li>
                <Link href="/playlist">{tLanding('playlistPage')}</Link>
              </li>
            ) : null}
          </ul>
        </div>
      </section>
      <div className={styles.fold}>
        <span>{t('foldCopy')}</span>
        <span className={styles.foldStamp}>{t('foldStamp')}</span>
      </div>
    </footer>
  );
}
