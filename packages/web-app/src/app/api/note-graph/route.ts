import type { NoteGraphDocInput } from "@anytime-markdown/graph-core";
import { type NextRequest, NextResponse } from "next/server";

import { fetchWithRetry, validateGitHubRepo } from "../../../lib/fetchWithRetry";
import { getGitHubToken } from "../../../lib/githubAuth";
import { parseNoteGraphDoc } from "../../../lib/noteGraphDoc";

/**
 * GET /api/note-graph?repo=owner/repo&branch=main
 *
 * GitHub リポジトリの `.md` を再帰列挙し、frontmatter から `title` / `type` / `related` を
 * 抽出してノート網入力（{@link NoteGraphDocInput}[]）を返す。web-app の Markdown エディタで
 * **GitHub から開いたときのみ** 呼ばれる閲覧専用エンドポイント。
 *
 * 認証は開いたユーザーの GitHub OAuth トークン（private repo 対応）。
 */

const CACHE_MAX_AGE = 300; // 5 min
const BATCH_SIZE = 20;

/** ブランチ名の防御的バリデーション（パストラバーサル禁止）。slash 付きブランチは許容。 */
function isValidBranch(branch: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(branch) && !branch.includes("..");
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
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const repo = searchParams.get("repo");
  const branch = searchParams.get("branch");
  if (!repo || !validateGitHubRepo(repo) || !branch || !isValidBranch(branch)) {
    return NextResponse.json({ error: "Invalid or missing params" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "anytime-markdown-web-app",
  };

  const treeRes = await fetchWithRetry(
    `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
    { headers },
  );
  if (!treeRes.ok) {
    return NextResponse.json({ error: "GitHub API error" }, { status: treeRes.status });
  }
  const treeData = (await treeRes.json()) as GitHubTreeResponse;
  const mdPaths = (treeData.tree ?? [])
    .filter((item) => item.type === "blob" && item.path?.endsWith(".md"))
    .map((item) => item.path as string);

  const docs: NoteGraphDocInput[] = [];
  for (let i = 0; i < mdPaths.length; i += BATCH_SIZE) {
    const batch = mdPaths.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (filePath) => {
        const encodedPath = filePath
          .split("/")
          .map((seg) => encodeURIComponent(seg))
          .join("/");
        const blobRes = await fetchWithRetry(
          `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
          { headers },
        );
        if (!blobRes.ok) return null;
        const blob = (await blobRes.json()) as GitHubBlobResponse;
        if (!blob.content) return null;
        const raw = Buffer.from(blob.content, "base64").toString("utf-8");
        return parseNoteGraphDoc(raw, filePath);
      }),
    );
    for (const doc of results) {
      if (doc) docs.push(doc);
    }
  }

  return NextResponse.json(
    { docs, truncated: treeData.truncated ?? false },
    { headers: { "Cache-Control": `private, max-age=${CACHE_MAX_AGE}` } },
  );
}
