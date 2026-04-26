import Link from 'next/link';
import { useTranslations } from 'next-intl';

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
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('github')}
              </a>
            </li>
            {showDocsEdit ? (
              <li>
                <Link href="/docs/edit">{t('edit')}</Link>
              </li>
            ) : null}
            <li>
              <a
                href={GITHUB_LICENSE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('license')}
              </a>
            </li>
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
        <div className={styles.foldLogo} aria-label="Anytime Trail">
          <svg
            viewBox="0 0 48 48"
            width={28}
            height={28}
            aria-hidden="true"
            focusable="false"
            className={styles.foldLogoBadge}
          >
            <circle cx="24" cy="24" r="22" />
            <g
              className={styles.foldLogoHoof}
              transform="translate(24 26)"
            >
              <path d="M -6 -2 Q -10 -8 -6 -13 Q -1 -17 3 -13 Q 7 -8 3 -2 Z" />
              <path d="M 1 4 Q -3 -2 1 -7 Q 6 -11 10 -7 Q 14 -2 10 4 Z" />
            </g>
          </svg>
          <span className={styles.foldLogoText}>
            <span className={styles.foldLogoTitle}>Anytime</span>
            <span className={styles.foldLogoSubtitle}>TRAIL</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
