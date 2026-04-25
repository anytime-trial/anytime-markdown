import Link from 'next/link';

import styles from '../press.module.css';

const MARKETPLACE_URL =
  'https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-markdown';
const GITHUB_REPO_URL = 'https://github.com/anytime-trial/anytime-markdown';
const GITHUB_LICENSE_URL =
  'https://github.com/anytime-trial/anytime-markdown/blob/master/LICENSE';

export function Colophon() {
  return (
    <footer>
      <section className={styles.colophon} id="archive">
        <div>
          <h4>The Press</h4>
          <ul>
            <li>
              <Link href="/privacy">Privacy policy</Link>
            </li>
            <li>
              <a
                href={GITHUB_LICENSE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                License · MIT
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4>Dispatch</h4>
          <ul>
            <li>
              <Link href="/markdown">Online editor (browser)</Link>
            </li>
            <li>
              <a
                href={MARKETPLACE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Anytime Markdown · VS Code
              </a>
            </li>
            <li>
              <Link href="/trail">Anytime Trail · architecture</Link>
            </li>
            <li>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub repository
              </a>
            </li>
          </ul>
        </div>
      </section>
      <div className={styles.fold}>
        <span>© 2026 Anytime Trail · 隊商出版部 · printed in browser</span>
        <span className={styles.foldStamp}>approved · 検</span>
        <span>set in Bodoni Moda · Shippori Mincho B1 · JetBrains Mono</span>
      </div>
    </footer>
  );
}
