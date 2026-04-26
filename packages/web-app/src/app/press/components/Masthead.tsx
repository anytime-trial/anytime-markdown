'use client';

import { useTranslations } from 'next-intl';

import { useLocaleSwitch } from '../../LocaleProvider';
import { useThemeMode } from '../../providers';
import styles from '../press.module.css';
import { SeasonalVignette } from './SeasonalVignette';

const WAFUU_TSUKIMEI = ['睦月', '如月', '弥生', '卯月', '皐月', '水無月', '文月', '葉月', '長月', '神無月', '霜月', '師走'] as const;
const KANJI_DIGITS = ['零', '壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖'] as const;

// 十二支の刻 — hour 0..23 → 支 (子=23:00-01:00, 丑=01:00-03:00, …)
const JIKOKU_BY_HOUR = ['子','丑','丑','寅','寅','卯','卯','辰','辰','巳','巳','午','午','未','未','申','申','酉','酉','戌','戌','亥','亥','子'] as const;

function getCurrentJikoku(): string {
  const h = new Date().getHours();
  return `${JIKOKU_BY_HOUR[h]}の刻`;
}

function toKanjiDay(n: number): string {
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (n <= 9) return KANJI_DIGITS[n];
  if (ones === 0) return `${tens === 1 ? '' : KANJI_DIGITS[tens]}拾`;
  return `${tens === 1 ? '' : KANJI_DIGITS[tens]}拾${KANJI_DIGITS[ones]}`;
}

function toKanjiYear(n: number): string {
  return String(n).split('').map((d) => KANJI_DIGITS[Number(d)]).join('');
}

function formatTodayEdition(locale: string): string {
  const today = new Date();
  const day = today.getDate();
  const year = today.getFullYear();
  if (locale === 'ja') {
    const month = WAFUU_TSUKIMEI[today.getMonth()];
    return `${toKanjiDay(day)} ${month} ${toKanjiYear(year)}`;
  }
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(today);
}

// [month, day, jaName, enName]
const SOLAR_TERMS: ReadonlyArray<readonly [number, number, string, string]> = [
  [1,  6,  '小寒', 'Minor Cold'],
  [1,  20, '大寒', 'Major Cold'],
  [2,  4,  '立春', 'Start of Spring'],
  [2,  19, '雨水', 'Rain Water'],
  [3,  6,  '啓蟄', 'Awakening of Insects'],
  [3,  21, '春分', 'Spring Equinox'],
  [4,  5,  '清明', 'Clear and Bright'],
  [4,  20, '穀雨', 'Grain Rain'],
  [5,  6,  '立夏', 'Start of Summer'],
  [5,  21, '小満', 'Grain Buds'],
  [6,  6,  '芒種', 'Grain in Ear'],
  [6,  21, '夏至', 'Summer Solstice'],
  [7,  7,  '小暑', 'Minor Heat'],
  [7,  23, '大暑', 'Major Heat'],
  [8,  7,  '立秋', 'Start of Autumn'],
  [8,  23, '処暑', 'End of Heat'],
  [9,  8,  '白露', 'White Dew'],
  [9,  23, '秋分', 'Autumnal Equinox'],
  [10, 8,  '寒露', 'Cold Dew'],
  [10, 23, '霜降', "Frost's Descent"],
  [11, 7,  '立冬', 'Start of Winter'],
  [11, 22, '小雪', 'Minor Snow'],
  [12, 7,  '大雪', 'Major Snow'],
  [12, 22, '冬至', 'Winter Solstice'],
];

function getCurrentSolarTerm(locale: string): string {
  const today = new Date();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  let idx = SOLAR_TERMS.length - 1;
  for (let i = 0; i < SOLAR_TERMS.length; i++) {
    const [tm, td] = SOLAR_TERMS[i];
    if (m > tm || (m === tm && d >= td)) idx = i;
  }
  return locale === 'ja' ? SOLAR_TERMS[idx][2] : SOLAR_TERMS[idx][3];
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
      <SeasonalVignette />
      <div className={styles.mastEdition}>
        <b>{t('editionVolume')}</b>
        <br />
        Edition of {formatTodayEdition(locale)} · {getCurrentSolarTerm(locale)} · {locale === 'ja' ? getCurrentJikoku() : t('editionDateSuffix').replace(/^·\s*/, '')}
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
