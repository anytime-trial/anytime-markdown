import type { Metadata } from 'next';

import { type Locale, routing } from '../i18n/routing';

/**
 * ロケール別 URL と hreflang を組み立てる。
 *
 * `localePrefix: 'as-needed'` のため、既定ロケール（ja）はプレフィックスを持たず、
 * en だけ `/en` 配下に置かれる。canonical は自ロケール、`languages` は全ロケール +
 * `x-default`（既定ロケール = ja）を指す。
 */
export function localeHref(pathname: string, locale: Locale): string {
  const normalized = pathname === '' ? '/' : pathname;
  if (locale === routing.defaultLocale) return normalized;
  return normalized === '/' ? `/${locale}` : `/${locale}${normalized}`;
}

/**
 * `generateMetadata` の `alternates` を作る。
 *
 * @param pathname ロケールプレフィックスを含まないパス（`/markdown`, `/report/my-post`）
 * @param locale 現在のロケール
 */
export function buildAlternates(pathname: string, locale: Locale): Metadata['alternates'] {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = localeHref(pathname, l);
  }
  // x-default は既定ロケール（ja）を指す
  languages['x-default'] = localeHref(pathname, routing.defaultLocale);

  return {
    canonical: localeHref(pathname, locale),
    languages,
  };
}

/** `params` から受け取った文字列を Locale へ絞り込む（未知値は既定ロケールへ縮退） */
export function toLocale(value: string | undefined): Locale {
  return value && (routing.locales as readonly string[]).includes(value)
    ? (value as Locale)
    : routing.defaultLocale;
}
