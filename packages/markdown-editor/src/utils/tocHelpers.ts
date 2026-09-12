import type { HeadingItem } from "../types";

/**
 * 先頭・末尾のハイフンを落とす。/^-+/ と /-+$/ の正規表現版は、一致しない入力に対して
 * ハイフン連長ぶんバックトラックする（Sonar S8786: super-linear backtracking）。
 */
function trimHyphens(value: string): string {
  let start = 0;
  while (start < value.length && value[start] === "-") start += 1;
  let end = value.length;
  while (end > start && value[end - 1] === "-") end -= 1;
  return value.slice(start, end);
}

/**
 * GitHub スタイルのスラグを生成する。
 * 重複時は `-1`, `-2` ... を付加（GitHub 準拠）。
 */
export function toGitHubSlug(
  text: string,
  usedSlugs: Map<string, number>,
): string {
  if (!text) return "";

  const normalized = text
    .toLowerCase()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/[^\p{L}\p{N}\-_]/gu, "");
  const slug = trimHyphens(normalized);

  const count = usedSlugs.get(slug);
  if (count === undefined) {
    usedSlugs.set(slug, 0);
    return slug;
  }
  const next = count + 1;
  usedSlugs.set(slug, next);
  return `${slug}-${next}`;
}

/**
 * HeadingItem 配列から Markdown リンクリスト形式の目次を生成する。
 * kind === "heading" のみ対象。相対インデント（minLevel 基準）。
 */
export function generateTocMarkdown(headings: HeadingItem[]): string {
  const filtered = headings.filter((h) => h.kind === "heading");
  if (filtered.length === 0) return "";

  const minLevel = Math.min(...filtered.map((h) => h.level));
  const usedSlugs = new Map<string, number>();

  const lines = filtered.map((h) => {
    const depth = h.level - minLevel;
    const indent = "  ".repeat(depth);
    const slug = toGitHubSlug(h.text, usedSlugs);
    return `${indent}- [${h.text}](#${slug})`;
  });

  return lines.join("\n") + "\n";
}
