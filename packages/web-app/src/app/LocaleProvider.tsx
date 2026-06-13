'use client';

import { DatabaseI18nProvider } from '@anytime-markdown/database-viewer';
import { MarkdownCoreI18nProvider } from '@anytime-markdown/markdown-react-islands';
import markdownCoreEnMessages from '@anytime-markdown/markdown-viewer/src/i18n/en.json';
import markdownCoreJaMessages from '@anytime-markdown/markdown-viewer/src/i18n/ja.json';
import { NextIntlClientProvider } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useMemo,useState } from 'react';

import pressEnMessages from './press/i18n/en.json';
import pressJaMessages from './press/i18n/ja.json';

type Locale = 'ja' | 'en';

const messages = {
  ja: { ...markdownCoreJaMessages, press: pressJaMessages },
  en: { ...markdownCoreEnMessages, press: pressEnMessages },
} satisfies Record<Locale, Record<string, unknown>>;

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

// HTTPS 配信時のみ `Secure` 属性を付ける。localhost (http) では Secure cookie は
// ブラウザに拒否されるため条件分岐する。CodeQL `WebCookieSecureDisabledByDefault` 対策。
function localeCookieString(value: Locale): string {
  const base = `NEXT_LOCALE=${value};path=/;max-age=31536000;SameSite=Lax`;
  if (typeof window !== 'undefined' && globalThis.window.location.protocol === 'https:') {
    return `${base};Secure`;
  }
  return base;
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
      document.cookie = localeCookieString(browserLang);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLocale = useCallback((newLocale: string) => {
    if (newLocale !== 'ja' && newLocale !== 'en') return;
    setLocaleState(newLocale);
    localStorage.setItem('NEXT_LOCALE', newLocale);
    document.cookie = localeCookieString(newLocale);
  }, []);

  const ctx = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={ctx}>
      <MarkdownCoreI18nProvider locale={locale}>
        <DatabaseI18nProvider locale={locale}>
          <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
            {children}
          </NextIntlClientProvider>
        </DatabaseI18nProvider>
      </MarkdownCoreI18nProvider>
    </LocaleContext.Provider>
  );
}
