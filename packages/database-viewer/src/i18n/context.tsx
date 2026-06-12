import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import enMessages from './en.json';
import jaMessages from './ja.json';

type SupportedLocale = 'ja' | 'en';
type Namespace = 'Database';
type NsMessages = Record<string, string>;

const messagesByLocale: Record<SupportedLocale, typeof jaMessages> = { ja: jaMessages, en: enMessages };

function resolveLocale(locale: string): SupportedLocale {
  return locale.startsWith('ja') ? 'ja' : 'en';
}

function detectLocale(): SupportedLocale {
  return typeof navigator !== 'undefined' && navigator.language.startsWith('ja') ? 'ja' : 'en';
}

const DatabaseLocaleContext = createContext<SupportedLocale | null>(null);

interface DatabaseI18nProviderProps {
  locale?: string;
  children: ReactNode;
}

export function DatabaseI18nProvider({ locale, children }: Readonly<DatabaseI18nProviderProps>) {
  const parentLocale = useContext(DatabaseLocaleContext);
  const resolved = useMemo(
    () => (locale ? resolveLocale(locale) : (parentLocale ?? detectLocale())),
    [locale, parentLocale],
  );
  return (
    <DatabaseLocaleContext.Provider value={resolved}>
      {children}
    </DatabaseLocaleContext.Provider>
  );
}

/** 解決済みロケールを返す（vanilla mount へ locale を引き渡す用途）。 */
export function useDatabaseLocale(): SupportedLocale {
  return useContext(DatabaseLocaleContext) ?? detectLocale();
}

export function useDatabaseT(namespace: Namespace) {
  const locale = useContext(DatabaseLocaleContext) ?? detectLocale();
  const ns = messagesByLocale[locale][namespace] as unknown as NsMessages;
  const fallbackNs = messagesByLocale['ja'][namespace] as unknown as NsMessages;
  return function t(key: string, vars?: Record<string, string | number>): string {
    const template = ns?.[key] ?? fallbackNs?.[key] ?? key;
    if (!vars) return template;
    return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template);
  };
}
