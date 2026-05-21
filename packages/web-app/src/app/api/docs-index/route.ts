import type { DocLink } from "@anytime-markdown/trail-core/c4";
import { fetchC4Model } from "@anytime-markdown/trail-core/c4";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createC4ModelStore } from "../../../lib/api-helpers";

/**
 * GET /api/docs-index?repo=...
 *
 * GitHub API でドキュメントリポジトリのファイルツリーを取得し、
 * フロントマターに `c4Scope` を持つ Markdown をインデックスとして返す。
 *
 * `repo` パラメータが指定された場合は、その repo の C4 モデル要素 ID 集合と
 * `doc.c4Scope` がヒット（完全一致または親パス）するドキュメントだけを返す。
 *
 * 環境変数:
 *   DOCS_GITHUB_REPO  — "owner/repo" 形式（必須）
 *   DOCS_GITHUB_TOKEN — PAT（private repo 用、省略可）
 */

const CACHE_MAX_AGE = 300; // 5 min

function trimQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed.at(-1);
  if ((first === `"` && last === `"`) || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(line: string, key: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(`${key}:`)) return null;
  return trimQuotes(trimmed.slice(key.length + 1));
}

function findFrontmatterRange(lines: string[]): [number, number] | null {
  if (lines[0] !== "---") return null;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") return [1, i];
  }
  return null;
}

function parseInlineC4Scope(line: string): string[] | null {
  const start = line.indexOf("[");
  const end = line.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  return line
    .slice(start + 1, end)
    .split(",")
    .map(trimQuotes)
    .filter(Boolean);
}

function parseC4Scope(fmLines: readonly string[]): string[] {
  const scope: string[] = [];
  let inScope = false;
  for (const line of fmLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("c4Scope:")) {
      const inline = parseInlineC4Scope(line);
      if (inline) {
        scope.push(...inline);
        inScope = false;
      } else {
        inScope = true;
      }
      continue;
    }
    if (!inScope) continue;
    if (trimmed.startsWith("- ")) {
      scope.push(trimQuotes(trimmed.slice(2)));
    } else {
      inScope = false;
    }
  }
  return scope;
}

function parseScalars(
  fmLines: readonly string[],
  keys: readonly string[],
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const k of keys) result[k] = null;
  for (const line of fmLines) {
    for (const k of keys) {
      result[k] ??= parseScalar(line, k);
    }
    if (keys.every((k) => result[k] !== null)) break;
  }
  return result;
}

/** フロントマターの c4Scope / title / type / date を抽出する */
function parseFrontmatter(raw: string): Pick<DocLink, "title" | "type" | "c4Scope" | "date"> | null {
  const lines = raw.replaceAll("\r\n", "\n").split("\n");
  const range = findFrontmatterRange(lines);
  if (!range) return null;
  const fmLines = lines.slice(range[0], range[1]);

  const c4Scope = parseC4Scope(fmLines);
  if (c4Scope.length === 0) return null;

  const scalars = parseScalars(fmLines, ["title", "type", "date"]);
  return {
    title: scalars["title"] ?? "Untitled",
    type: scalars["type"] ?? "unknown",
    c4Scope,
    date: scalars["date"] ?? "",
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

/** GitHub から全ドキュメントを取得（5 分キャッシュ） */
async function fetchAllDocs(): Promise<DocLink[] | null> {
  const repoRaw = process.env.DOCS_GITHUB_REPO;
  if (!repoRaw) return null;
  const repo = extractOwnerRepo(repoRaw);
  if (!repo) return null;

  if (cachedIndex && Date.now() < cachedIndex.expiresAt) {
    return cachedIndex.docs;
  }

  const token = process.env.DOCS_GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "anytime-markdown-web-app",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const treeRes = await fetch(
    `https://api.github.com/repos/${encodeURI(repo)}/git/trees/main?recursive=1`,
    { headers, next: { revalidate: CACHE_MAX_AGE } },
  );
  if (!treeRes.ok) return null;
  const treeData = (await treeRes.json()) as GitHubTreeResponse;
  const mdPaths = (treeData.tree ?? [])
    .filter((item) => item.type === "blob" && item.path?.endsWith(".md"))
    .map((item) => item.path as string);

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
  return docs;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const repoParam = request.nextUrl.searchParams.get("repo") ?? undefined;

  const allDocs = await fetchAllDocs();
  if (allDocs === null) {
    return NextResponse.json({ docs: [] });
  }

  // repo 指定なしは workspace global（全件返却、後方互換）
  if (!repoParam) {
    return NextResponse.json(
      { docs: allDocs },
      { headers: { "Cache-Control": `public, max-age=${CACHE_MAX_AGE}` } },
    );
  }

  // C4 モデルから repo の要素 ID 集合を構築し、
  // doc.c4Scope のいずれかが要素 ID と完全一致または親パスとしてヒットするものだけ返す
  const store = createC4ModelStore();
  if (!store) {
    return NextResponse.json({ docs: allDocs });
  }
  try {
    const payload = await fetchC4Model(store, 'current', repoParam);
    const elementIds = new Set((payload?.model.elements ?? []).map((e) => e.id));
    if (elementIds.size === 0) {
      return NextResponse.json({ docs: [] });
    }
    const filtered = allDocs.filter((d) =>
      d.c4Scope.some((scope) =>
        elementIds.has(scope) || [...elementIds].some((id) => id.startsWith(scope + '/'))
      )
    );
    return NextResponse.json(
      { docs: filtered },
      { headers: { "Cache-Control": `public, max-age=${CACHE_MAX_AGE}` } },
    );
  } catch {
    return NextResponse.json({ docs: allDocs });
  }
}
