import graphEnMessages from '@anytime-markdown/graph-viewer/src/i18n/en.json';
import graphJaMessages from '@anytime-markdown/graph-viewer/src/i18n/ja.json';
import enMessages from '@anytime-markdown/markdown-core/src/i18n/en.json';
import jaMessages from '@anytime-markdown/markdown-core/src/i18n/ja.json';
import spreadsheetEnMessages from '@anytime-markdown/spreadsheet-viewer/src/i18n/en.json';
import spreadsheetJaMessages from '@anytime-markdown/spreadsheet-viewer/src/i18n/ja.json';
import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

const supportedLocales = ['ja', 'en'] as const;
type Locale = (typeof supportedLocales)[number];
const defaultLocale: Locale = 'ja';

const mergedJa = { ...jaMessages, ...graphJaMessages, ...spreadsheetJaMessages };
const mergedEn = { ...enMessages, ...graphEnMessages, ...spreadsheetEnMessages };
const messagesByLocale: Record<Locale, typeof mergedJa> = { ja: mergedJa, en: mergedEn };

export default getRequestConfig(async () => {
  let locale: Locale = defaultLocale;

  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
    if (cookieLocale && (supportedLocales as readonly string[]).includes(cookieLocale)) {
      locale = cookieLocale as Locale;
    }
  } catch {
    // Static export (CAPACITOR_BUILD) does not support cookies() — use default locale
  }

  return {
    locale,
    messages: messagesByLocale[locale],
  };
});
