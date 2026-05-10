import { databaseViewerEnMessages, databaseViewerJaMessages } from '@anytime-markdown/database-viewer';
import { messagesEn as graphEnMessages, messagesJa as graphJaMessages } from '@anytime-markdown/graph-viewer';
import { messagesEn as enMessages, messagesJa as jaMessages } from '@anytime-markdown/markdown-core';
import { spreadsheetViewerEnMessages as spreadsheetEnMessages, spreadsheetViewerJaMessages as spreadsheetJaMessages } from '@anytime-markdown/spreadsheet-viewer';
import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import pressEnMessages from '../app/press/i18n/en.json';
import pressJaMessages from '../app/press/i18n/ja.json';

const supportedLocales = ['ja', 'en'] as const;
type Locale = (typeof supportedLocales)[number];
const defaultLocale: Locale = 'ja';

const mergedJa = {
  ...jaMessages,
  ...graphJaMessages,
  ...spreadsheetJaMessages,
  ...databaseViewerJaMessages,
  press: pressJaMessages,
};
const mergedEn = {
  ...enMessages,
  ...graphEnMessages,
  ...spreadsheetEnMessages,
  ...databaseViewerEnMessages,
  press: pressEnMessages,
};
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
