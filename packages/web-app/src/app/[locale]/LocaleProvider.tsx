'use client';

import { DatabaseI18nProvider } from '@anytime-markdown/database-viewer';
import { MarkdownCoreI18nProvider } from '@anytime-markdown/markdown-react-islands';
import { NextIntlClientProvider } from 'next-intl';
import { createContext, useCallback, useContext, useMemo } from 'react';

import { type Locale, messagesByLocale } from '../../i18n/messages';
import { usePathname, useRouter } from '../../i18n/navigation';
import { routing } from '../../i18n/routing';
import { parseLocale } from '../../lib/localeAlternates';

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

interface LocaleProviderProps {
  serverLocale: string;
  children: React.ReactNode;
}

/**
 * 切替 API を提供する内側の層。
 *
 * next-intl の `useRouter` / `usePathname` は内部で `useLocale()` を呼ぶため、
 * `NextIntlClientProvider` より **内側** で使う必要がある。外側で呼ぶと SSR 時点で
 * 例外になり、全ルートが 500 を返す（ユニットテストは navigation をモックするため
 * この破れを検知できない。実機の `next start` + curl で検出した）。
 */
function LocaleSwitchProvider({
  locale,
  children,
}: Readonly<{ locale: Locale; children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();

  const setLocale = useCallback(
    (newLocale: string) => {
      const next = parseLocale(newLocale);
      if (!next || next === locale) return;
      // pathname はロケールプレフィックスを含まない。クエリとハッシュは
      // 現在の location から引き継ぐ（切替でページ内位置と絞り込みを失わせない）。
      const search = typeof window === 'undefined' ? '' : window.location.search;
      const hash = typeof window === 'undefined' ? '' : window.location.hash;
      router.replace(`${pathname}${search}${hash}`, { locale: next });
    },
    [locale, pathname, router],
  );

  const ctx = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={ctx}>{children}</LocaleContext.Provider>;
}

export function LocaleProvider({ serverLocale, children }: Readonly<LocaleProviderProps>) {
  // ロケールは URL だけで決まる。クライアント側で state として持たない
  // （localStorage / navigator.language による自動切替は廃止した。
  //  クローラーが取得する HTML と JS 実行後の表示が食い違う原因になっていたため。
  //  要件書 spec/10.web-app/locale-routing/locale-routing.ja.md）。
  const locale: Locale = parseLocale(serverLocale) ?? routing.defaultLocale;

  return (
    <MarkdownCoreI18nProvider locale={locale}>
      <DatabaseI18nProvider locale={locale}>
        <NextIntlClientProvider locale={locale} messages={messagesByLocale[locale]} timeZone="UTC">
          <LocaleSwitchProvider locale={locale}>{children}</LocaleSwitchProvider>
        </NextIntlClientProvider>
      </DatabaseI18nProvider>
    </MarkdownCoreI18nProvider>
  );
}
