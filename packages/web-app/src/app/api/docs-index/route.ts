import type { DocLink } from "@anytime-markdown/trail-core/c4";
import { NextResponse } from "next/server";

/**
 * GET /api/docs-index
 *
 * GitHub API でドキュメントリポジトリのファイルツリーを取得し、
 * フロントマターに `c4Scope` を持つ Markdown をインデックスとして返す。
 *
 * 環境変数:
 *   DOCS_GITHUB_REPO  — "owner/repo" 形式（必須）
 *   DOCS_GITHUB_TOKEN — PAT（private repo 用、省略可）
 */

const CACHE_MAX_AGE = 300; // 5 min

/** フロントマターの c4Scope / title / type / date を抽出する */
function parseFrontmatter(raw: string): Pick<DocLink, "title" | "type" | "c4Scope" | "date"> | null {
  const normalized = raw.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") return null;

  let endLineIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") {
      endLineIndex = i;
      break;
    }
  }
  if (endLineIndex < 0) return null;

  const fmLines = lines.slice(1, endLineIndex);

  const trimQuotes = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
      const first = trimmed[0];
      const last = trimmed[trimmed.length - 1];
      if ((first === `"` && last === `"`) || (first === "'" && last === "'")) {
        return trimmed.slice(1, -1);
      }
    }
    return trimmed;
  };

  const parseScalar = (line: string, key: string): string | null => {
    const trimmed = line.trim();
    if (!trimmed.startsWith(`${key}:`)) return null;
    return trimQuotes(trimmed.slice(key.length + 1));
  };

  // c4Scope (YAML array)
  const scopeLines: string[] = [];
  let inScope = false;
  for (const line of fmLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("c4Scope:")) {
      inScope = true;
      // inline value (e.g. c4Scope: ["a"])
      const start = line.indexOf("[");
      const end = line.lastIndexOf("]");
      if (start >= 0 && end > start) {
        const inline = line.slice(start + 1, end);
        scopeLines.push(
          ...inline
            .split(",")
            .map((s) => trimQuotes(s))
            .filter(Boolean),
        );
        inScope = false;
      }
      continue;
    }
    if (inScope) {
      if (trimmed.startsWith("- ")) {
        scopeLines.push(trimQuotes(trimmed.slice(2)));
      } else {
        inScope = false;
      }
    }
  }
  if (scopeLines.length === 0) return null;

  let title: string | null = null;
  let type: string | null = null;
  let date: string | null = null;
  for (const line of fmLines) {
    if (title === null) title = parseScalar(line, "title");
    if (type === null) type = parseScalar(line, "type");
    if (date === null) date = parseScalar(line, "date");
    if (title !== null && type !== null && date !== null) break;
  }

  return {
    title: title ?? "Untitled",
    type: type ?? "unknown",
    c4Scope: scopeLines,
    date: date ?? "",
  };
}

interface GitHubTreeItem {
  path?: string;
  type?: string;
}

interface GitHubTreeResponse {
  tree?: GitHubTreeItem[];
  truncated?: boolean;
}

interface GitHubBlobResponse {
  content?: string;
  encoding?: string;
}

/** "https://github.com/owner/repo" または "owner/repo" から "owner/repo" を抽出 */
function extractOwnerRepo(value: string): string | null {
  const urlMatch = /github\.com\/([^/]+\/[^/]+)\/?$/.exec(value);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(value)) return value;
  return null;
}

let cachedIndex: { docs: DocLink[]; expiresAt: number } | null = null;

export async function GET(): Promise<NextResponse> {
  const repoRaw = process.env.DOCS_GITHUB_REPO;
  if (!repoRaw) {
    return NextResponse.json({ docs: [] });
  }

  const repo = extractOwnerRepo(repoRaw);
  if (!repo) {
    return NextResponse.json({ docs: [] });
  }

  // in-memory cache
  if (cachedIndex && Date.now() < cachedIndex.expiresAt) {
    return NextResponse.json(
      { docs: cachedIndex.docs },
      { headers: { "Cache-Control": `public, max-age=${CACHE_MAX_AGE}` } },
    );
  }

  const token = process.env.DOCS_GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "anytime-markdown-web-app",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // 1. ファイルツリー取得
  const treeRes = await fetch(
    `https://api.github.com/repos/${encodeURI(repo)}/git/trees/main?recursive=1`,
    { headers, next: { revalidate: CACHE_MAX_AGE } },
  );
  if (!treeRes.ok) {
    return NextResponse.json(
      { error: "Failed to fetch repository tree" },
      { status: treeRes.status },
    );
  }
  const treeData = (await treeRes.json()) as GitHubTreeResponse;
  const mdPaths = (treeData.tree ?? [])
    .filter((item) => item.type === "blob" && item.path?.endsWith(".md"))
    .map((item) => item.path as string);

  // 2. 各ファイルのフロントマター取得（並列、最大20件ずつ）
  const docs: DocLink[] = [];
  const BATCH_SIZE = 20;
  for (let i = 0; i < mdPaths.length; i += BATCH_SIZE) {
    const batch = mdPaths.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (filePath) => {
        const blobRes = await fetch(
          `https://api.github.com/repos/${encodeURI(repo)}/contents/${encodeURI(filePath)}?ref=main`,
          { headers },
        );
        if (!blobRes.ok) return null;
        const blob = (await blobRes.json()) as GitHubBlobResponse;
        if (!blob.content) return null;
        const raw = Buffer.from(blob.content, "base64").toString("utf-8");
        const meta = parseFrontmatter(raw);
        if (!meta) return null;
        return { ...meta, path: filePath } satisfies DocLink;
      }),
    );
    for (const doc of results) {
      if (doc) docs.push(doc);
    }
  }

  cachedIndex = { docs, expiresAt: Date.now() + CACHE_MAX_AGE * 1000 };

  return NextResponse.json(
    { docs },
    { headers: { "Cache-Control": `public, max-age=${CACHE_MAX_AGE}` } },
  );
}
