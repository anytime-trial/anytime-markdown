import type { HeadingItem } from "../types";

/**
 * GitHub スタイルのスラグを生成する。
 * 重複時は `-1`, `-2` ... を付加（GitHub 準拠）。
 */
export function toGitHubSlug(
  text: string,
  usedSlugs: Map<string, number>,
): string {
  if (!text) return "";

  const slug = text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_]/gu, "")
    .replace(/^-+/, "").replace(/-+$/, "");

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
