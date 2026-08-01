/**
 * React 非依存の translator（vanilla mount 用）。
 * ja フォールバック + `{var}` 置換の解決ロジックを持つ。
 *
 * 解決ロジックの実体は `@anytime-markdown/ui-core/i18n` にある（各 viewer で
 * 同型のコピーを持たないため）。本モジュールは辞書と namespace 型を束ねる薄い層。
 */

import { createTranslator, type Translator } from '@anytime-markdown/ui-core/i18n';

import enMessages from './en.json';
import jaMessages from './ja.json';

export { detectLocale, resolveLocale, type SupportedLocale } from '@anytime-markdown/ui-core/i18n';

export type CooccurrenceNamespace = 'Cooccurrence';

const messagesByLocale = { ja: jaMessages, en: enMessages };

export type CooccurrenceT = Translator;

/**
 * namespace 固定の translator を生成する。
 *
 * @param locale 省略時はブラウザ言語から検出する。
 */
export function createCooccurrenceT(
  namespace: CooccurrenceNamespace,
  locale?: string,
): CooccurrenceT {
  return createTranslator({ messagesByLocale, namespace, locale });
}
