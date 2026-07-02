import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

// turndown-plugin-gfm は型定義を同梱しない CJS パッケージ。ESM import は markdown-viewer /
// web-app(next build) 双方で TS7016 になり ambient 宣言も web-app から不可視のため、
// 型解決が両環境で成立する require で読み込む（該当行のみ no-require-imports を抑制）。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { gfm } = require("turndown-plugin-gfm") as {
  gfm: TurndownService.Plugin;
};

export interface WebImportResult {
  title: string;
  markdownBody: string;
  sourceUrl: string;
  byline?: string;
  fetchedAt: string;
}

export function convertWebPageToMarkdown(
  html: string,
  sourceUrl: string,
  now: Date,
): WebImportResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const article = new Readability(doc).parse();
  const turndown = createTurndownService();

  if (article === null) {
    console.warn(`[webImport] readability failed, fallback to body: ${sourceUrl}`);

    // Turndown はデフォルト設定だと未知要素の「タグを外して子を変換」挙動のため、
    // script/style/noscript のテキスト内容（JS/CSS ソース）が Markdown 本文へ混入する。
    // innerHTML 取得前に除去する。
    doc.querySelectorAll("script, style, noscript").forEach((el) => el.remove());

    return {
      title: doc.title,
      markdownBody: turndown.turndown(doc.body?.innerHTML ?? ""),
      sourceUrl,
      fetchedAt: now.toISOString(),
    };
  }

  return {
    title: article.title ?? doc.title,
    markdownBody: turndown.turndown(article.content ?? ""),
    sourceUrl,
    ...(article.byline ? { byline: article.byline } : {}),
    fetchedAt: now.toISOString(),
  };
}

function createTurndownService(): TurndownService {
  const turndown = new TurndownService();
  turndown.use(gfm);
  return turndown;
}
