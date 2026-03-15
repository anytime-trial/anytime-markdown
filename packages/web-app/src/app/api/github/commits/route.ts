import { type NextRequest, NextResponse } from "next/server";
import { fetchWithRetry } from "../../../../lib/fetchWithRetry";
import { getGitHubToken } from "../../../../lib/githubAuth";

async function getFileBlobSha(
  repo: string,
  path: string,
  ref: string,
  token: string,
): Promise<string | null> {
  const encodedPath = path.split("/").map((s) => encodeURIComponent(s)).join("/");
  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${ref}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
      cache: "no-store",
      next: { revalidate: 0 },
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { sha?: string };
  return data.sha ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = request.nextUrl;
  const repo = searchParams.get("repo");
  const path = searchParams.get("path");
  const branch = searchParams.get("branch");
  if (!repo || !path) {
    return NextResponse.json(
      { error: "Missing repo or path" },
      { status: 400 },
    );
  }
  const res = await fetchWithRetry(
    `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(path)}&per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: "GitHub API error" },
      { status: res.status },
    );
  }
  const commits = await res.json();
  const commitList = (commits as {
    sha: string;
    commit: { message: string; author: { name: string; date: string } };
  }[]).map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author.name,
    date: c.commit.author.date,
  }));

  // ファイルの最新 blob SHA と一覧先頭コミット時の blob SHA を比較して staleness を検出
  let stale = false;
  if (branch && commitList.length > 0) {
    const [headBlobSha, firstCommitBlobSha] = await Promise.all([
      getFileBlobSha(repo, path, branch, token),
      getFileBlobSha(repo, path, commitList[0].sha, token),
    ]);
    if (headBlobSha && firstCommitBlobSha && headBlobSha !== firstCommitBlobSha) {
      stale = true;
    }
    console.log("[commits] repo=%s path=%s count=%d stale=%s headBlob=%s firstCommitBlob=%s",
      repo, path, commitList.length, stale, headBlobSha, firstCommitBlobSha);
  }

  return NextResponse.json(
    { commits: commitList, stale },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
}
