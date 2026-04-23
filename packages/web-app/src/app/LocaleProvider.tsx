'use client';

import graphEnMessages from '@anytime-markdown/graph-viewer/src/i18n/en.json';
import graphJaMessages from '@anytime-markdown/graph-viewer/src/i18n/ja.json';
import enMessages from '@anytime-markdown/markdown-core/src/i18n/en.json';
import jaMessages from '@anytime-markdown/markdown-core/src/i18n/ja.json';
import spreadsheetEnMessages from '@anytime-markdown/spreadsheet-viewer/src/i18n/en.json';
import spreadsheetJaMessages from '@anytime-markdown/spreadsheet-viewer/src/i18n/ja.json';
import { NextIntlClientProvider } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useMemo,useState } from 'react';

type Locale = 'ja' | 'en';

const mergedJa = { ...jaMessages, ...graphJaMessages, ...spreadsheetJaMessages };
const mergedEn = { ...enMessages, ...graphEnMessages, ...spreadsheetEnMessages };
const messages: Record<Locale, typeof mergedJa> = { ja: mergedJa, en: mergedEn };

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

function toLocale(value: string | null | undefined): Locale | null {
  return value === 'ja' || value === 'en' ? value : null;
}

interface LocaleProviderProps {
  serverLocale: string;
  children: React.ReactNode;
}

export function LocaleProvider({ serverLocale, children }: Readonly<LocaleProviderProps>) {
  // ハイドレーションミスマッチ防止: 初回レンダリングは必ず serverLocale を使用
  const [locale, setLocaleState] = useState<Locale>(() => toLocale(serverLocale) ?? 'ja');

  // ハイドレーション後にクライアント側の優先ロケールを反映
  useEffect(() => {
    const stored = toLocale(localStorage.getItem('NEXT_LOCALE'));
    if (stored) {
      if (stored !== locale) setLocaleState(stored);
      return;
    }
    const browserLang = toLocale(navigator.language.split('-')[0]);
    if (browserLang && browserLang !== locale) {
      setLocaleState(browserLang);
      document.cookie = `NEXT_LOCALE=${browserLang};path=/;max-age=31536000;SameSite=Lax`;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLocale = useCallback((newLocale: string) => {
    if (newLocale !== 'ja' && newLocale !== 'en') return;
    setLocaleState(newLocale);
    localStorage.setItem('NEXT_LOCALE', newLocale);
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
  }, []);

  const ctx = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={ctx}>
      <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
