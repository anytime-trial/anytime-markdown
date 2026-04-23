type Messages = Record<string, Record<string, string>>;

export interface NextIntlShim {
  setLocale(locale: string): void;
  useLocale(): string;
  useTranslations(namespace: string): (key: string) => string;
}

/**
 * Create a next-intl-compatible shim for VS Code webviews.
 *
 * The returned object exposes the three functions the webview code expects
 * (`useTranslations`, `useLocale`, `setLocale`) plus a mutable locale.
 * Webpack should alias `next-intl` and `next-intl/server` to a file that
 * re-exports the members of this object.
 *
 * @param locales       Record of `{ ja: messages, en: messages, ... }`
 * @param fallback      Locale used when the active locale is unknown
 */
export function createNextIntlShim<T extends Record<string, Messages>>(
  locales: T,
  fallback: keyof T & string,
): NextIntlShim {
  let current: string = fallback;
  return {
    setLocale(locale: string) {
      current = locale;
    },
    useLocale() {
      return current;
    },
    useTranslations(namespace: string) {
      const active = (locales as Record<string, Messages>)[current];
      const fallbackMessages = (locales as Record<string, Messages>)[fallback];
      const ns = active?.[namespace] ?? fallbackMessages?.[namespace];
      return function t(key: string): string {
        return ns?.[key] ?? fallbackMessages?.[namespace]?.[key] ?? key;
      };
    },
  };
}
