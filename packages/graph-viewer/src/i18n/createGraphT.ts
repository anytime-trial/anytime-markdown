/**
 * React 非依存の translator（vanilla 化用）。
 * React context 版（{@link ./context.tsx} の `useGraphT`）と同一の解決ロジック
 * （ja フォールバック + `{var}` 置換）の単一ソース。markdown-viewer の `createMarkdownT` と同型。
 */

import enMessages from './en.json';
import jaMessages from './ja.json';

export type SupportedLocale = 'ja' | 'en';
export type GraphNamespace = 'Graph';
type NsMessages = Record<string, string>;

const messagesByLocale: Record<SupportedLocale, typeof jaMessages> = { ja: jaMessages, en: enMessages };

export function resolveLocale(locale: string): SupportedLocale {
  return locale.startsWith('ja') ? 'ja' : 'en';
}

export function detectLocale(): SupportedLocale {
  return typeof navigator !== 'undefined' && navigator.language.startsWith('ja') ? 'ja' : 'en';
}

export type GraphT = (key: string, vars?: Record<string, string | number>) => string;

/**
 * namespace 固定の translator を生成する。
 *
 * @param locale 省略時はブラウザ言語から検出する。
 */
export function createGraphT(namespace: GraphNamespace, locale?: string): GraphT {
  const resolved = locale ? resolveLocale(locale) : detectLocale();
  const ns = messagesByLocale[resolved][namespace] as unknown as NsMessages;
  const fallbackNs = messagesByLocale['ja'][namespace] as unknown as NsMessages;
  return function t(key: string, vars?: Record<string, string | number>): string {
    const template = ns?.[key] ?? fallbackNs?.[key] ?? key;
    if (!vars) return template;
    return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template);
  };
}
