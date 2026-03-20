import welcomeJa from "./templates/welcome.md";
import welcomeEn from "./templates/welcome-en.md";

/** 言語に応じたデフォルトコンテンツを返す */
export function getDefaultContent(locale: string): string {
  return locale === "ja" ? welcomeJa : welcomeEn;
}

/** 後方互換: 日本語版をデフォルトとしてエクスポート */
export const defaultContent = welcomeJa;
