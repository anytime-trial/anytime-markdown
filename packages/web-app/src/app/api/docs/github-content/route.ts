import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/docs/github-content?key=path/to/file.md
 *
 * DOCS_GITHUB_REPO で指定された GitHub リポジトリからファイルを取得して返す。
 * ユーザー認証不要（サーバーサイドの DOCS_GITHUB_TOKEN を使用）。
 * レスポンス形式は /api/docs/content と同じ text/markdown。
 */

const CACHE_MAX_AGE = 300; // 5 min

/** "https://github.com/owner/repo" または "owner/repo" から "owner/repo" を抽出 */
function extractOwnerRepo(value: string): string | null {
  const urlMatch = /github\.com\/([^/]+\/[^/]+)\/?$/.exec(value);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(value)) return value;
  return null;
}

interface GitHubBlobResponse {
  content?: string;
  encoding?: string;
}

const cache = new Map<string, { body: string; expiresAt: number }>();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const repoRaw = process.env.DOCS_GITHUB_REPO;
  if (!repoRaw) {
    return NextResponse.json(
      { error: "DOCS_GITHUB_REPO is not configured" },
      { status: 500 },
    );
  }

  const repo = extractOwnerRepo(repoRaw);
  if (!repo) {
    return NextResponse.json(
      { error: "DOCS_GITHUB_REPO is invalid" },
      { status: 500 },
    );
  }

  const filePath = request.nextUrl.searchParams.get("key");
  if (!filePath || !filePath.endsWith(".md")) {
    return NextResponse.json(
      { error: "key parameter is required and must be a .md file" },
      { status: 400 },
    );
  }

  // パストラバーサル防止
  if (filePath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // in-memory cache
  const cached = cache.get(filePath);
  if (cached && Date.now() < cached.expiresAt) {
    return new NextResponse(cached.body, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
      },
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

  const encodedPath = filePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=main`,
    { headers, next: { revalidate: CACHE_MAX_AGE } },
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Document not found" },
      { status: res.status },
    );
  }

  const blob = (await res.json()) as GitHubBlobResponse;
  if (!blob.content) {
    return NextResponse.json(
      { error: "Empty document" },
      { status: 404 },
    );
  }

  const body = Buffer.from(blob.content, "base64").toString("utf-8");

  cache.set(filePath, { body, expiresAt: Date.now() + CACHE_MAX_AGE * 1000 });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
    },
  });
}
