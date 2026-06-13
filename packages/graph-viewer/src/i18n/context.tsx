import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  createGraphT,
  detectLocale,
  resolveLocale,
  type GraphNamespace as Namespace,
  type SupportedLocale,
} from './createGraphT';

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
  // vanilla 版 createGraphT と同一の解決ロジック（単一ソース）。locale は解決済みコードを渡す。
  return createGraphT(namespace, locale);
}
