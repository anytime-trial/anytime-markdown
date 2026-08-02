/**
 * React 非依存の translator（vanilla orchestrator / consumer 配線用）。
 * React context 版（islands の `useMarkdownT`）と同一の解決ロジック
 * （ja フォールバック + `{var}` 置換）の単一ソース。
 *
 * 解決ロジックの実体は `@anytime-markdown/ui-core/i18n` にある（各 viewer で
 * 同型のコピーを持たないため）。本モジュールは辞書と namespace 型を束ねる薄い層。
 */

import { createTranslator, type Translator } from "@anytime-markdown/ui-core/i18n";

import enMessages from './en.json';
import jaMessages from './ja.json';

export { detectLocale, resolveLocale, type SupportedLocale } from "@anytime-markdown/ui-core/i18n";

export type MarkdownNamespace = 'MarkdownEditor' | 'Common' | 'Landing' | 'VsCode' | 'Privacy';

const messagesByLocale = { ja: jaMessages, en: enMessages };

/**
 * namespace 固定の translator を生成する。
 *
 * @param locale 省略時はブラウザ言語から検出する。
 */
export function createMarkdownT(namespace: MarkdownNamespace, locale?: string): Translator {
  return createTranslator({ messagesByLocale, namespace, locale });
}
