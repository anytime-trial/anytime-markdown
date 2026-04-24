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
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!fmMatch) return null;
  const fm = fmMatch[1];

  // c4Scope (YAML array)
  const scopeLines: string[] = [];
  let inScope = false;
  for (const line of fm.split(/\r?\n/)) {
    if (/^c4Scope\s*:/.test(line)) {
      inScope = true;
      // inline value (e.g. c4Scope: ["a"])
      const inline = /\[([^\]]*)\]/.exec(line);
      if (inline) {
        scopeLines.push(
          ...inline[1].split(",").map((s) => s.trim().replaceAll(/^["']|["']$/g, "")).filter(Boolean),
        );
        inScope = false;
      }
      continue;
    }
    if (inScope) {
      if (/^\s+-\s+/.test(line)) {
        scopeLines.push(line.replace(/^\s+-\s+/, "").trim().replaceAll(/^["']|["']$/g, ""));
      } else {
        inScope = false;
      }
    }
  }
  if (scopeLines.length === 0) return null;

  const titleMatch = /^title\s*:\s*"?(.+?)"?\s*$/m.exec(fm);
  const typeMatch = /^type\s*:\s*"?(\w+)"?\s*$/m.exec(fm);
  const dateMatch = /^date\s*:\s*"?(\d{4}-\d{2}-\d{2})"?\s*$/m.exec(fm);

  return {
    title: titleMatch?.[1] ?? "Untitled",
    type: typeMatch?.[1] ?? "unknown",
    c4Scope: scopeLines,
    date: dateMatch?.[1] ?? "",
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
