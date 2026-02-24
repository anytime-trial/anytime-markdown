import { getRequestConfig } from 'next-intl/server';

const supportedLocales = ['ja', 'en'] as const;
type Locale = (typeof supportedLocales)[number];
const defaultLocale: Locale = 'ja';

export default getRequestConfig(async () => {
  const locale = defaultLocale;

  const messages = (await import(`@anytime-markdown/editor-core/src/i18n/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
