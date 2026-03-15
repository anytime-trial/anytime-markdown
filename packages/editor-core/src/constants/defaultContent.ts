import defaultContentEn from "./templates/defaultContent-en.md";
import defaultContentJa from "./templates/defaultContent.md";

/** 言語に応じたデフォルトコンテンツを返す */
export function getDefaultContent(locale: string): string {
  return locale === "ja" ? defaultContentJa : defaultContentEn;
}

/** 後方互換: 日本語版をデフォルトとしてエクスポート */
export const defaultContent = defaultContentJa;
