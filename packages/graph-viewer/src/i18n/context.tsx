import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import enMessages from './en.json';
import jaMessages from './ja.json';

type SupportedLocale = 'ja' | 'en';
type Namespace = 'Graph';
type NsMessages = Record<string, string>;

const messagesByLocale: Record<SupportedLocale, typeof jaMessages> = { ja: jaMessages, en: enMessages };

function resolveLocale(locale: string): SupportedLocale {
  return locale.startsWith('ja') ? 'ja' : 'en';
}

function detectLocale(): SupportedLocale {
  return typeof navigator !== 'undefined' && navigator.language.startsWith('ja') ? 'ja' : 'en';
}

const GraphLocaleContext = createContext<SupportedLocale | null>(null);

interface GraphI18nProviderProps {
  locale?: string;
  children: ReactNode;
}

export function GraphI18nProvider({ locale, children }: Readonly<GraphI18nProviderProps>) {
  const parentLocale = useContext(GraphLocaleContext);
  const resolved = useMemo(
    () => (locale ? resolveLocale(locale) : (parentLocale ?? detectLocale())),
    [locale, parentLocale],
  );
  return (
    <GraphLocaleContext.Provider value={resolved}>
      {children}
    </GraphLocaleContext.Provider>
  );
}

export function useGraphT(namespace: Namespace) {
  const locale = useContext(GraphLocaleContext) ?? detectLocale();
  const ns = messagesByLocale[locale][namespace] as unknown as NsMessages;
  const fallbackNs = messagesByLocale['ja'][namespace] as unknown as NsMessages;
  return function t(key: string, vars?: Record<string, string | number>): string {
    const template = ns?.[key] ?? fallbackNs?.[key] ?? key;
    if (!vars) return template;
    return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template);
  };
}
