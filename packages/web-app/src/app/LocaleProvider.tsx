'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import jaMessages from '@anytime-markdown/editor-core/src/i18n/ja.json';
import enMessages from '@anytime-markdown/editor-core/src/i18n/en.json';

type Locale = 'ja' | 'en';

const messages: Record<Locale, typeof jaMessages> = { ja: jaMessages, en: enMessages };

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: string) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocaleSwitch() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocaleSwitch must be used within LocaleProvider');
  return ctx;
}

function getInitialLocale(serverLocale: string): Locale {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('NEXT_LOCALE');
    if (stored === 'ja' || stored === 'en') return stored;
    // 初回アクセス時: ブラウザ/OS の言語設定を参照
    const browserLang = navigator.language.split('-')[0];
    if (browserLang === 'ja' || browserLang === 'en') return browserLang;
  }
  if (serverLocale === 'ja' || serverLocale === 'en') return serverLocale;
  return 'ja';
}

interface LocaleProviderProps {
  serverLocale: string;
  children: React.ReactNode;
}

export function LocaleProvider({ serverLocale, children }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => getInitialLocale(serverLocale));

  const setLocale = useCallback((newLocale: string) => {
    if (newLocale !== 'ja' && newLocale !== 'en') return;
    setLocaleState(newLocale);
    localStorage.setItem('NEXT_LOCALE', newLocale);
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000`;
  }, []);

  const ctx = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={ctx}>
      <NextIntlClientProvider locale={locale} messages={messages[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
