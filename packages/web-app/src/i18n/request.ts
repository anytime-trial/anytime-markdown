import { getRequestConfig } from 'next-intl/server';

import { type Locale, messagesByLocale } from './messages';
import { routing } from './routing';

function isSupported(value: string | undefined): value is Locale {
  return !!value && (routing.locales as readonly string[]).includes(value);
}

/**
 * ロケールは URL（`[locale]` セグメント）だけで決まる。
 *
 * 以前はクッキー `NEXT_LOCALE` を参照していたが、クローラーはクッキーを持たないため
 * サーバーが返す HTML が常に既定ロケールになり、英語版が検索エンジンから到達不能だった
 * （要件書 spec/10.web-app/locale-routing/locale-routing.ja.md「背景」）。
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = isSupported(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: messagesByLocale[locale],
  };
});
