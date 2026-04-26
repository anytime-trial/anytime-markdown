'use client';

import { useTranslations } from 'next-intl';

import { useLocaleSwitch } from '../../LocaleProvider';
import { useThemeMode } from '../../providers';
import styles from '../press.module.css';

function formatTodayEdition(): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
}

export function Masthead() {
  const t = useTranslations('press.masthead');
  const { themeMode, setThemeMode } = useThemeMode();
  const { locale, setLocale } = useLocaleSwitch();
  const toggleMode = () => {
    setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
  };
  const toggleLocale = () => {
    setLocale(locale === 'ja' ? 'en' : 'ja');
  };
  const currentLocaleLabel = locale === 'ja' ? 'JA' : 'EN';
  return (
    <header className={styles.mast}>
      <div className={styles.mastEdition}>
        <b>{t('editionVolume')}</b>
        <br />
        Edition of {formatTodayEdition()} {t('editionDateSuffix')}
      </div>
      <div className={styles.mastTitle}>
        {t('titlePrefix')} <em>{t('titleEm')}</em>
      </div>
      <nav className={styles.mastNav}>
        <a href="#news">{t('navNews')}</a>
        <a href="#markdown">{t('navMarkdown')}</a>
        <a href="#trail">{t('navTrail')}</a>
        <button
          type="button"
          onClick={toggleLocale}
          aria-label={t('localeAria')}
          title={t('localeAria')}
          className={styles.mastLocaleToggle}
        >
          {currentLocaleLabel}
        </button>
        <button
          type="button"
          onClick={toggleMode}
          aria-label={t('themeAria')}
          title={t('themeTitle')}
          className={styles.mastModeToggle}
        >
          ◐
        </button>
      </nav>
      <div className={styles.mastRules}>
        <div className={styles.mastRulePair} />
        <div className={styles.mastRulePair} />
      </div>
    </header>
  );
}
