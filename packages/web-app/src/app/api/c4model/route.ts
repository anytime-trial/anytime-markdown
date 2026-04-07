import { NextResponse } from "next/server";

/**
 * GET /api/c4model
 *
 * GitHub API でドキュメントリポジトリから c4model/c4-model.json を取得して返す。
 *
 * 環境変数:
 *   DOCS_GITHUB_REPO  — "owner/repo" 形式または "https://github.com/owner/repo" 形式
 *   DOCS_GITHUB_TOKEN — PAT（private repo 用、省略可）
 */

const CACHE_MAX_AGE = 300; // 5 min
const FILE_PATH = "c4model/c4-model.json";

/** "https://github.com/owner/repo" または "owner/repo" から "owner/repo" を抽出 */
function extractOwnerRepo(value: string): string | null {
  // フルURL形式: https://github.com/owner/repo
  const urlMatch = /github\.com\/([^/]+\/[^/]+)\/?$/.exec(value);
  if (urlMatch) return urlMatch[1];
  // owner/repo 形式
  if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(value)) return value;
  return null;
}

interface GitHubBlobResponse {
  content?: string;
  encoding?: string;
}

let cachedData: { json: unknown; expiresAt: number } | null = null;

export async function GET(): Promise<NextResponse> {
  const repoRaw = process.env.DOCS_GITHUB_REPO;
  if (!repoRaw) {
    return NextResponse.json(
      { error: "DOCS_GITHUB_REPO is not configured" },
      { status: 404 },
    );
  }

  const repo = extractOwnerRepo(repoRaw);
  if (!repo) {
    return NextResponse.json(
      { error: "DOCS_GITHUB_REPO is invalid" },
      { status: 500 },
    );
  }

  // in-memory cache
  if (cachedData && Date.now() < cachedData.expiresAt) {
    return NextResponse.json(cachedData.json, {
      headers: { "Cache-Control": `public, max-age=${CACHE_MAX_AGE}` },
    });
  }

  const token = process.env.DOCS_GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "anytime-markdown-web-app",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${encodeURI(repo)}/contents/${encodeURI(FILE_PATH)}?ref=main`,
    { headers, next: { revalidate: CACHE_MAX_AGE } },
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch c4-model.json from GitHub" },
      { status: res.status },
    );
  }

  const blob = (await res.json()) as GitHubBlobResponse;
  if (!blob.content) {
    return NextResponse.json(
      { error: "Empty content returned from GitHub" },
      { status: 502 },
    );
  }

  const raw = Buffer.from(blob.content, "base64").toString("utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in c4-model.json" },
      { status: 502 },
    );
  }

  cachedData = { json: parsed, expiresAt: Date.now() + CACHE_MAX_AGE * 1000 };

  return NextResponse.json(parsed, {
    headers: { "Cache-Control": `public, max-age=${CACHE_MAX_AGE}` },
  });
}
