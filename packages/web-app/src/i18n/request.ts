import markdownCoreEnMessages from '@anytime-markdown/markdown-viewer/src/i18n/en.json';
import markdownCoreJaMessages from '@anytime-markdown/markdown-viewer/src/i18n/ja.json';
import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import pressEnMessages from '../app/press/i18n/en.json';
import pressJaMessages from '../app/press/i18n/ja.json';
import privacyServicesEnMessages from '../app/privacy/services/i18n/en.json';
import privacyServicesJaMessages from '../app/privacy/services/i18n/ja.json';

const supportedLocales = ['ja', 'en'] as const;
type Locale = (typeof supportedLocales)[number];
const defaultLocale: Locale = 'ja';

const mergedJa = {
  ...markdownCoreJaMessages,
  press: pressJaMessages,
  PrivacyServices: privacyServicesJaMessages,
};
const mergedEn = {
  ...markdownCoreEnMessages,
  press: pressEnMessages,
  PrivacyServices: privacyServicesEnMessages,
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
