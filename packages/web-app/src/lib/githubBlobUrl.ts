/**
 * GitHub の Markdown blob URL 判定と /markdown エディタ遷移 URL の組み立て。
 *
 * チケット本文（VanillaMarkdownView）内のリンククリックを横取りし、
 * `.md` / `.markdown` の blob URL だけをアプリ内エディタ（レビューモード）へ振り向けるために使う。
 * 判定に漏れた URL は通常のブラウザ遷移に任せるため、失敗はすべて null で表す。
 */

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const MARKDOWN_EXT_RE = /\.(md|markdown)$/i;

/** GitHub blob URL から抽出したファイル参照。 */
export interface GitHubBlobRef {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

/**
 * `https://github.com/<owner>/<repo>/blob/<branch>/<path>` 形式の `.md` / `.markdown` URL を
 * パースする。対象外（他ドメイン・blob 以外・Markdown 以外・形式不正）は null。
 */
export function parseGitHubMarkdownBlobUrl(href: string): GitHubBlobRef | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    // 相対パス等の URL として解釈できない文字列は対象外（通常遷移に任せる）
    return null;
  }
  if (!GITHUB_HOSTS.has(url.hostname)) return null;

  const parts: string[] = [];
  for (const segment of url.pathname.split("/").filter(Boolean)) {
    const decoded = decodeSegment(segment);
    if (decoded === null) return null;
    parts.push(decoded);
  }
  // [owner, repo, "blob", branch, ...path]
  if (parts.length < 5 || parts[2] !== "blob") return null;

  const [owner, repo] = parts;
  let refParts = parts.slice(3);
  // `blob/refs/heads/<branch>/<path>` 形式はプレフィクスを剥がして通常形に揃える
  if (refParts[0] === "refs" && refParts[1] === "heads") {
    refParts = refParts.slice(2);
    if (refParts.length < 2) return null;
  }
  // SHORTCUT: ブランチは先頭 1 セグメント固定. ceiling: スラッシュ入りブランチ名は境界を静的に
  // 判別できず誤分割する. upgrade: 誤オープンの報告があれば GitHub API の branch 一覧照合で解決.
  const branch = refParts[0];
  const path = refParts.slice(1).join("/");
  if (!MARKDOWN_EXT_RE.test(path)) return null;

  return { owner, repo, branch, path };
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    // 不正なパーセントエンコーディングは形式不正として対象外に倒す
    return null;
  }
}

/** {@link GitHubBlobRef} をレビューモード起動の `/markdown` 遷移 URL に変換する。 */
export function buildMarkdownEditorUrl(ref: GitHubBlobRef): string {
  const params = new URLSearchParams({
    gh: `${ref.owner}/${ref.repo}`,
    branch: ref.branch,
    path: ref.path,
    mode: "review",
  });
  return `/markdown?${params.toString()}`;
}
