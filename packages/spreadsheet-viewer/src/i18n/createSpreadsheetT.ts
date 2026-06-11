import { enMessages, jaMessages } from "./index";

/**
 * React context（SpreadsheetI18nProvider / useSpreadsheetT）に依存しない t 関数ファクトリ。
 * 脱 React 後の vanilla コンポーネントはすべて本関数で t を生成し、mount options で受け渡す。
 *
 * 解決ロジック（locale 正規化・ja フォールバック・`{var}` 置換）は旧 useSpreadsheetT と同一。
 */

export type SpreadsheetNamespace = keyof typeof jaMessages;
export type SpreadsheetT = (key: string, vars?: Record<string, string | number>) => string;

type NsMessages = Record<string, string>;

const SUPPORTED_LOCALES = ["ja", "en"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

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

const messagesByLocale: Record<SupportedLocale, typeof jaMessages> = {
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
  const resolved = locale ? resolveLocale(locale) : detectLocale();
  const ns: NsMessages = messagesByLocale[resolved][namespace] as unknown as NsMessages;
  const fallbackNs: NsMessages = messagesByLocale.ja[namespace] as unknown as NsMessages;

  return (key, vars) => {
    const template = ns?.[key] ?? fallbackNs?.[key] ?? key;
    if (!vars) return template;
    return Object.entries(vars).reduce(
      (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
      template,
    );
  };
}
