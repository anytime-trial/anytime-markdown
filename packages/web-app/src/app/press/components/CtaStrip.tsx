import Link from 'next/link';

import styles from '../press.module.css';

export function CtaStrip() {
  return (
    <section className={styles.ctaStrip} id="cta">
      <h2 className={styles.ctaHeading}>
        Open the notebook. <em>Begin the dispatch.</em>
      </h2>
    </section>
  );
}

export function CtaActions() {
  return (
    <div className={styles.ctaActions}>
      <Link href="/markdown" className={`${styles.btn} ${styles.btnStamp}`}>
        Online Editor <span className={styles.btnArrow}>→</span>
      </Link>
      <a
        className={styles.btn}
        href="https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-markdown"
        target="_blank"
        rel="noopener noreferrer"
      >
        VS Code Extension <span className={styles.btnArrow}>→</span>
      </a>
    </div>
  );
}
