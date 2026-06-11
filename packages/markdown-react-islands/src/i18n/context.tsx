"use client";

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';

import {
  createMarkdownT,
  detectLocale,
  type MarkdownNamespace,
  resolveLocale,
  type SupportedLocale,
} from '@anytime-markdown/markdown-viewer/src/i18n/createMarkdownT';

// 純粋ロジック（locale 解決 + translator 生成）は ./createMarkdownT が単一ソース。
// 本ファイルは React context 結合部のみ（island 移設対象）。
export { createMarkdownT };

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

export function useMarkdownT(namespace: MarkdownNamespace) {
  const locale = useContext(MarkdownCoreLocaleContext) ?? detectLocale();
  return createMarkdownT(namespace, locale);
}

export function useMarkdownLocale(): SupportedLocale {
  return useContext(MarkdownCoreLocaleContext) ?? detectLocale();
}
