import Link from 'next/link';

import styles from '../press.module.css';

interface CtaActionsProps {
  primaryHref: string;
  secondaryHref: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryExternal?: boolean;
  tertiaryHref?: string;
  tertiaryLabel?: string;
}

export function CtaActions({
  primaryHref,
  secondaryHref,
  primaryLabel = 'Online Editor',
  secondaryLabel = 'VS Code Extension',
  primaryExternal = false,
  tertiaryHref,
  tertiaryLabel,
}: Readonly<CtaActionsProps>) {
  const primaryClassName = `${styles.btn} ${styles.btnStamp}`;
  return (
    <div className={styles.ctaActions}>
      {primaryExternal ? (
        <a
          className={primaryClassName}
          href={primaryHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          {primaryLabel} <span className={styles.btnArrow}>→</span>
        </a>
      ) : (
        <Link href={primaryHref} className={primaryClassName}>
          {primaryLabel} <span className={styles.btnArrow}>→</span>
        </Link>
      )}
      <a
        className={styles.btn}
        href={secondaryHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        {secondaryLabel} <span className={styles.btnArrow}>→</span>
      </a>
      {tertiaryHref ? (
        <a
          className={styles.btn}
          href={tertiaryHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          {tertiaryLabel} <span className={styles.btnArrow}>→</span>
        </a>
      ) : null}
    </div>
  );
}
