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
 * `generateMetadata` の `alternates` を作る。**翻訳が実在するページにだけ使う。**
 *
 * hreflang は「同じ内容の別言語版」を宣言するタグなので、本文が単一言語のページに
 * 付けると同じ記事を 2 URL で申告することになる。単一ソースのページは
 * `buildSingleSourceAlternates` を使う。
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

/**
 * 本文が単一言語（ja）でしか存在しないページの `alternates` を作る。
 *
 * 記事本文・ドキュメント本文は S3 上の単一ソースで、`/en` 配下でも同じ本文を返す。
 * ここで `languages` を出すと「翻訳版がある」と申告することになり、1 本の記事が
 * 2 URL で重複申告される。canonical を既定ロケール（ja）へ向けて正規形に寄せる。
 *
 * @param pathname ロケールプレフィックスを含まないパス
 */
export function buildSingleSourceAlternates(pathname: string): Metadata['alternates'] {
  return { canonical: singleSourceHref(pathname) };
}

/** 単一ソースページの正規 URL（既定ロケール = ja 側）。canonical と og:url を揃えるために使う */
export function singleSourceHref(pathname: string): string {
  return localeHref(pathname, routing.defaultLocale);
}

/** 文字列を Locale へ絞り込む（未知値は null。既定へ縮退させたいときは `toLocale`） */
export function parseLocale(value: string | null | undefined): Locale | null {
  return value && (routing.locales as readonly string[]).includes(value)
    ? (value as Locale)
    : null;
}

/** `params` から受け取った文字列を Locale へ絞り込む（未知値は既定ロケールへ縮退） */
export function toLocale(value: string | undefined): Locale {
  return parseLocale(value) ?? routing.defaultLocale;
}
