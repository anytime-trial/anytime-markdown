import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';

import enMessages from './en.json';
import jaMessages from './ja.json';

type SupportedLocale = 'ja' | 'en';
type Namespace = 'MarkdownEditor' | 'Common' | 'Landing' | 'VsCode' | 'Privacy';
type NsMessages = Record<string, string>;

const messagesByLocale: Record<SupportedLocale, typeof jaMessages> = { ja: jaMessages, en: enMessages };

function resolveLocale(locale: string): SupportedLocale {
  return locale.startsWith('ja') ? 'ja' : 'en';
}

function detectLocale(): SupportedLocale {
  return typeof navigator !== 'undefined' && navigator.language.startsWith('ja') ? 'ja' : 'en';
}

const MarkdownCoreLocaleContext = createContext<SupportedLocale | null>(null);

interface MarkdownCoreI18nProviderProps {
  locale?: string;
  children: ReactNode;
}

export function MarkdownCoreI18nProvider({ locale, children }: Readonly<MarkdownCoreI18nProviderProps>) {
  const parentLocale = useContext(MarkdownCoreLocaleContext);
  const resolved = useMemo(
    () => (locale ? resolveLocale(locale) : (parentLocale ?? detectLocale())),
    [locale, parentLocale],
  );
  return (
    <MarkdownCoreLocaleContext.Provider value={resolved}>
      {children}
    </MarkdownCoreLocaleContext.Provider>
  );
}

/**
 * React 非依存の translator（vanilla orchestrator / consumer 配線用）。
 * `useMarkdownT` と同一の解決ロジック（ja フォールバック + `{var}` 置換）。
 *
 * @param locale 省略時はブラウザ言語から検出する。
 */
export function createMarkdownT(namespace: Namespace, locale?: string) {
  const resolved = locale ? resolveLocale(locale) : detectLocale();
  const ns = messagesByLocale[resolved][namespace] as unknown as NsMessages;
  const fallbackNs = messagesByLocale['ja'][namespace] as unknown as NsMessages;
  return function t(key: string, vars?: Record<string, string | number>): string {
    const template = ns?.[key] ?? fallbackNs?.[key] ?? key;
    if (!vars) return template;
    return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template);
  };
}

export function useMarkdownT(namespace: Namespace) {
  const locale = useContext(MarkdownCoreLocaleContext) ?? detectLocale();
  return createMarkdownT(namespace, locale);
}

export function useMarkdownLocale(): SupportedLocale {
  return useContext(MarkdownCoreLocaleContext) ?? detectLocale();
}
