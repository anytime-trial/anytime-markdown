import { defineRouting } from 'next-intl/routing';

/**
 * ロケールを URL で一意に決定するためのルーティング定義（単一の正）。
 *
 * `supportedLocales` / `defaultLocale` はここから `messages.ts` が再エクスポートする。
 * 両方に別々のリテラルを置くとドリフトするため、定義はこのファイルだけに持つ。
 */
export const routing = defineRouting({
  locales: ['ja', 'en'],
  defaultLocale: 'ja',
  // 既定ロケール（ja）はプレフィックスを持たず既存 URL を維持し、en だけ /en 配下へ置く。
  localePrefix: 'as-needed',
  // Why not: Accept-Language による自動判定・自動リダイレクトを行わない。
  // 有効にすると en-US で来るクローラーが / から /en へ飛ばされ、日本語版のクロールが
  // 阻害される。URL をロケールの唯一の決定要因にする（要件書 locale-routing.ja.md）。
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
