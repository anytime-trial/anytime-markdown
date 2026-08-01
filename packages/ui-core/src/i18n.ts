/**
 * React 非依存の translator ファクトリ（vanilla UI 共通）。
 *
 * 各パッケージ（markdown-editor / graph-viewer / cooccurrence-viewer /
 * spreadsheet-viewer）が個別に持っていた `createXxxT` の解決ロジック
 * （locale 正規化・fallback locale・`{var}` 置換）を 1 実装へ集約したもの。
 * メッセージ辞書の型は各パッケージが持つため、辞書を型引数で受け取る。
 */

export type SupportedLocale = "ja" | "en";

/** namespace 固定の翻訳関数。 */
export type Translator = (key: string, vars?: Record<string, string | number>) => string;

/** BCP 47 のタグを対応 locale へ正規化する（ja 系のみ ja、他は en）。 */
export function resolveLocale(locale: string): SupportedLocale {
  return locale.startsWith("ja") ? "ja" : "en";
}

/** ブラウザ言語から locale を検出する（navigator 不在時は en）。 */
export function detectLocale(): SupportedLocale {
  return typeof navigator !== "undefined" && navigator.language.startsWith("ja") ? "ja" : "en";
}

export interface CreateTranslatorOptions<M> {
  /** locale ごとのメッセージ辞書。 */
  readonly messagesByLocale: Record<SupportedLocale, M>;
  /** 参照する namespace（辞書のトップレベルキー）。 */
  readonly namespace: keyof M & string;
  /** 表示 locale。省略時は `detectLocale` で検出する。 */
  readonly locale?: string;
  /** 対象 locale にキーが無い場合の引き当て先（既定 ja）。 */
  readonly fallbackLocale?: SupportedLocale;
  /** locale 正規化の差し替え（既定は ja 系のみ ja・他は en）。 */
  readonly resolveLocale?: (raw: string) => SupportedLocale;
  /** locale 未指定時の検出の差し替え。 */
  readonly detectLocale?: () => SupportedLocale;
}

type NsMessages = Record<string, string>;

/**
 * namespace 固定の translator を生成する。
 *
 * 未定義のキーは fallback locale → キー文字列自身の順に縮退する（例外は投げない）。
 */
export function createTranslator<M>(options: CreateTranslatorOptions<M>): Translator {
  const resolve = options.resolveLocale ?? resolveLocale;
  const detect = options.detectLocale ?? detectLocale;
  const resolved = options.locale ? resolve(options.locale) : detect();
  const fallback = options.fallbackLocale ?? "ja";

  const ns = options.messagesByLocale[resolved]?.[options.namespace] as NsMessages | undefined;
  const fallbackNs = options.messagesByLocale[fallback]?.[options.namespace] as
    | NsMessages
    | undefined;

  return function t(key: string, vars?: Record<string, string | number>): string {
    const template = ns?.[key] ?? fallbackNs?.[key] ?? key;
    if (!vars) return template;
    return Object.entries(vars).reduce(
      (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
      template,
    );
  };
}
