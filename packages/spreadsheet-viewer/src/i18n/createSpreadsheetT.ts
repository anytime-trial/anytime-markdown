import { createTranslator, type SupportedLocale } from "@anytime-markdown/ui-core/i18n";

import { enMessages, jaMessages } from "./index";

/**
 * React context（SpreadsheetI18nProvider / useSpreadsheetT）に依存しない t 関数ファクトリ。
 * 脱 React 後の vanilla コンポーネントはすべて本関数で t を生成し、mount options で受け渡す。
 *
 * 解決ロジック（ja フォールバック・`{var}` 置換）の実体は
 * `@anytime-markdown/ui-core/i18n` にある。ただし locale 正規化は本パッケージ固有で、
 * 未対応 locale を en ではなく ja へ寄せる（旧 useSpreadsheetT と同じ挙動）。
 */

export type SpreadsheetNamespace = keyof typeof jaMessages;
export type SpreadsheetT = (key: string, vars?: Record<string, string | number>) => string;

const SUPPORTED_LOCALES = ["ja", "en"] as const;

/** 未対応 locale を ja へ寄せる（ui-core 既定の en 寄せとは異なる本パッケージの方針）。 */
function resolveLocale(raw: string | undefined): SupportedLocale {
  if (!raw) return "ja";
  const base = raw.split("-")[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base)
    ? (base as SupportedLocale)
    : "ja";
}

function detectLocale(): SupportedLocale {
  if (typeof navigator !== "undefined") return resolveLocale(navigator.language);
  return "ja";
}

const messagesByLocale = {
  ja: jaMessages,
  en: enMessages as unknown as typeof jaMessages,
};

/**
 * namespace 固定の t 関数を生成する。locale 未指定時は navigator.language から自動検出する。
 */
export function createSpreadsheetT(
  namespace: SpreadsheetNamespace,
  locale?: string,
): SpreadsheetT {
  return createTranslator({
    messagesByLocale,
    namespace,
    locale,
    resolveLocale,
    detectLocale,
  });
}
