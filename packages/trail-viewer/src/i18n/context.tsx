import { createContext, useCallback, useContext } from 'react';

import { en } from './en';
import { ja } from './ja';
import type { TrailI18n, TrailLocale } from './types';

interface TrailLocaleContextValue {
  readonly t: (key: keyof TrailI18n) => string;
}

const TrailLocaleContext = createContext<TrailLocaleContextValue | null>(null);

const TRANSLATION_MAP: Record<TrailLocale, TrailI18n> = { ja, en };

export function TrailLocaleProvider({
  locale = 'en',
  children,
}: Readonly<{ locale?: TrailLocale; children: React.ReactNode }>) {
  const translations = TRANSLATION_MAP[locale];
  const t = useCallback((key: keyof TrailI18n) => translations[key], [translations]);
  return (
    <TrailLocaleContext.Provider value={{ t }}>
      {children}
    </TrailLocaleContext.Provider>
  );
}

export function useTrailI18n(): TrailLocaleContextValue {
  const ctx = useContext(TrailLocaleContext);
  if (ctx === null) {
    throw new Error('useTrailI18n must be used within TrailLocaleProvider');
  }
  return ctx;
}
