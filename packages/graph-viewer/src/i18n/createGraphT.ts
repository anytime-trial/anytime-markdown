/**
 * React 非依存の translator（vanilla 化用）。
 * React context 版（{@link ./context.tsx} の `useGraphT`）と同一の解決ロジック
 * （ja フォールバック + `{var}` 置換）の単一ソース。
 *
 * 解決ロジックの実体は `@anytime-markdown/ui-core/i18n` にある（各 viewer で
 * 同型のコピーを持たないため）。本モジュールは辞書と namespace 型を束ねる薄い層。
 */

import { createTranslator, type Translator } from '@anytime-markdown/ui-core/i18n';

import enMessages from './en.json';
import jaMessages from './ja.json';

export { detectLocale, resolveLocale, type SupportedLocale } from '@anytime-markdown/ui-core/i18n';

export type GraphNamespace = 'Graph';

const messagesByLocale = { ja: jaMessages, en: enMessages };

export type GraphT = Translator;

/**
 * namespace 固定の translator を生成する。
 *
 * @param locale 省略時はブラウザ言語から検出する。
 */
export function createGraphT(namespace: GraphNamespace, locale?: string): GraphT {
  return createTranslator({ messagesByLocale, namespace, locale });
}
