import { useTranslations } from 'next-intl';

import styles from '../press.module.css';

function Vermilion({ children }: Readonly<{ children: React.ReactNode }>) {
  return <span className={styles.textVermilion}>{children}</span>;
}

function vermilion(chunks: React.ReactNode) {
  return <Vermilion>{chunks}</Vermilion>;
}

function githubLink(chunks: React.ReactNode) {
  return (
    <a
      href="https://github.com/anytime-trial/anytime-markdown"
      target="_blank"
      rel="noopener noreferrer"
      className={styles.dispatchLink}
    >
      {chunks}
    </a>
  );
}

export function Dispatch() {
  const tDispatch = useTranslations('press.dispatch');
  return (
    <section className={styles.dispatch} id="dispatch">
      <header className={styles.dispatchHeader}>
        <h2 className={styles.dispatchSection}>
          {tDispatch('titlePrefix')}
          <em>{tDispatch('titleEm')}</em>
        </h2>
      </header>
      <div className={styles.columns}>
        <div className={`${styles.column} ${styles.columnLead}`}>
          <p>{tDispatch('lead')}</p>
        </div>
        <div className={styles.column}>
          <h3>{tDispatch('harnessHeading')}</h3>
          <p>{tDispatch.rich('harnessBody', { vermilion })}</p>
        </div>
        <div className={styles.column}>
          <h3>{tDispatch('caravanHeading')}</h3>
          <p>{tDispatch.rich('caravanBody', { vermilion })}</p>
        </div>
        <div className={styles.column}>
          <h3>{tDispatch('editorHeading')}</h3>
          <p>
            {tDispatch.rich('editorBody', {
              vermilion,
              github: githubLink,
            })}
          </p>
        </div>
      </div>
    </section>
  );
}
