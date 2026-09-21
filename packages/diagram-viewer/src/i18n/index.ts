/**
 * React 非依存の translator（vanilla mount 用）。
 *
 * 解決ロジックの実体は `@anytime-markdown/ui-core/i18n` にある（各 viewer で同型のコピーを
 * 持たないため）。本モジュールは辞書と namespace 型を束ねる薄い層。
 */

import { createTranslator, type Translator } from '@anytime-markdown/ui-core/i18n';

import enMessages from './en.json';
import jaMessages from './ja.json';

export { detectLocale, resolveLocale, type SupportedLocale } from '@anytime-markdown/ui-core/i18n';

export type DiagramMessages = typeof jaMessages;

// ビルド時に en と ja の構造が一致することを保証する。ja に在る鍵が en に欠けていると
// ここで型エラーになる（多言語対応ファイルは全言語を同時に直す）。
const _enAssertion: DiagramMessages = enMessages;
void _enAssertion;

export type DiagramT = Translator;

/** namespace 固定の translator を生成する。`locale` 省略時はブラウザ言語から検出する。 */
export function createDiagramT(locale?: string): DiagramT {
  return createTranslator({ messagesByLocale: { ja: jaMessages, en: enMessages }, namespace: 'Diagram', locale });
}
