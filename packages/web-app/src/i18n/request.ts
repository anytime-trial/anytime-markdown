import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, type Locale, messagesByLocale, supportedLocales } from './messages';

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
