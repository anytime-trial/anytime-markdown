'use client';

import { useLocaleSwitch } from '../../LocaleProvider';
import { useThemeMode } from '../../providers';
import styles from '../press.module.css';

export function Masthead() {
  const { themeMode, setThemeMode } = useThemeMode();
  const { locale, setLocale } = useLocaleSwitch();
  const toggleMode = () => {
    setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
  };
  const toggleLocale = () => {
    setLocale(locale === 'ja' ? 'en' : 'ja');
  };
  const nextLocaleLabel = locale === 'ja' ? 'EN' : 'JA';
  const localeAria =
    locale === 'ja' ? 'Switch to English' : '日本語に切り替え';
  return (
    <header className={styles.mast}>
      <div className={styles.mastEdition}>
        <b>Vol. III · No. 142</b>
        <br />
        Edition of 25 Apr 2026 · 余白 · 朝刊
      </div>
      <div className={styles.mastTitle}>
        Anytime <em>Markdown</em>
      </div>
      <nav className={styles.mastNav}>
        <a href="#dispatch">Dispatch</a>
        <a href="#briefing">Briefing</a>
        <a href="#archive">Archive</a>
        <a href="#cta">Subscribe</a>
        <button
          type="button"
          onClick={toggleLocale}
          aria-label={localeAria}
          title={localeAria}
          className={styles.mastLocaleToggle}
        >
          {nextLocaleLabel}
        </button>
        <button
          type="button"
          onClick={toggleMode}
          aria-label="Toggle theme mode"
          title="Toggle mode"
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
