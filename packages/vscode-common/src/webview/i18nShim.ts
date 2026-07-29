type MessageNode = string | { [key: string]: MessageNode };
type Messages = Record<string, MessageNode>;

export type TranslationValues = Record<string, string | number>;

export interface NextIntlShim {
  setLocale(locale: string): void;
  useLocale(): string;
  useTranslations(namespace: string): (key: string, values?: TranslationValues) => string;
}

/**
 * ドット区切りキーで入れ子メッセージを引く。
 * Why not: フラット参照だけにすると next-intl のネスト構造をそのまま渡せず、
 * 未解決キーがフォールバックによって静かに生キー表示へ落ちる（型では防げない）。
 */
function resolvePath(node: MessageNode | undefined, key: string): string | undefined {
  let current = node;
  for (const segment of key.split('.')) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = current[segment];
  }
  return typeof current === 'string' ? current : undefined;
}

/** `{name}` を values で置換する。値が無いプレースホルダは欠落を可視化するため残す。 */
function interpolate(template: string, values?: TranslationValues): string {
  if (!values) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

/**
 * Create a next-intl-compatible shim for VS Code webviews.
 *
 * 返り値は webview 側コードが期待する 3 関数（`useTranslations` / `useLocale` /
 * `setLocale`）を持つ。webpack で `next-intl` と `next-intl/server` を
 * このオブジェクトを re-export するファイルへ alias すること。
 *
 * @param locales  `{ ja: messages, en: messages, ... }`。messages は入れ子・フラットどちらも可
 * @param fallback 有効ロケールが未知のときに使うロケール
 */
export function createNextIntlShim<T extends Record<string, Messages>>(
  locales: T,
  fallback: keyof T & string,
): NextIntlShim {
  let current: string = fallback;
  return {
    setLocale(locale: string) {
      current = locale;
    },
    useLocale() {
      return current;
    },
    useTranslations(namespace: string) {
      return function t(key: string, values?: TranslationValues): string {
        const all = locales as Record<string, Messages>;
        const template =
          resolvePath(all[current]?.[namespace], key) ??
          resolvePath(all[fallback]?.[namespace], key) ??
          key;
        return interpolate(template, values);
      };
    },
  };
}
