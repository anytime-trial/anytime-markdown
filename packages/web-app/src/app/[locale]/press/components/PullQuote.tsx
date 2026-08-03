import { useTranslations } from 'next-intl';

import styles from '../press.module.css';

export function PullQuote() {
  const t = useTranslations('press.pullQuote');
  return (
    <section className={styles.pullQuote}>
      <q>{t('text')}</q>
      <div className={styles.pullQuoteAttr}>{t('attr')}</div>
    </section>
  );
}
