import { type NextRequest, NextResponse } from "next/server";

import { fetchWithRetry, validateGitHubRepo } from "../../../../lib/fetchWithRetry";
import { getGitHubToken } from "../../../../lib/githubAuth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = request.nextUrl;
  const repo = searchParams.get("repo");
  const path = searchParams.get("path");
  const ref = searchParams.get("ref");
  if (!repo || !validateGitHubRepo(repo) || path === null || !ref) {
    return NextResponse.json({ error: "Invalid or missing params" }, { status: 400 });
  }
  const encodedPath = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const res = await fetchWithRetry(
    `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${ref}`,
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
  const data = await res.json();
  // Directory listing: GitHub returns an array
  if (Array.isArray(data)) {
    return NextResponse.json(
      data.map((item: Record<string, unknown>) => ({
        name: item.name,
        path: item.path,
        type: item.type,
      })),
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  }
  // Single file: decode base64 content
  const raw = (data as { content?: string | null }).content;
  const content = raw ? Buffer.from(raw, "base64").toString("utf-8") : "";
  return NextResponse.json(
    { content },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}

/** Create a new file via GitHub Contents API (PUT) */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = (await request.json()) as {
    repo?: string;
    path?: string;
    content?: string;
    message?: string;
    branch?: string;
    sha?: string;
  };
  const { repo, path, content, message, branch, sha } = body;
  if (!repo || !validateGitHubRepo(repo) || !path) {
    return NextResponse.json({ error: "Invalid or missing params" }, { status: 400 });
  }
  const encodedPath = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  // 既存ファイル更新時: sha が未指定なら自動取得
  let fileSha = sha;
  if (!fileSha && content != null) {
    const branchQuery = branch ? `?ref=${branch}` : "";
    const getRes = await fetchWithRetry(
      `https://api.github.com/repos/${repo}/contents/${encodedPath}${branchQuery}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );
    if (getRes.ok) {
      const fileData = (await getRes.json()) as { sha?: string };
      fileSha = fileData.sha;
    }
  }

  const res = await fetchWithRetry(
    `https://api.github.com/repos/${repo}/contents/${encodedPath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message ?? (fileSha ? `Update ${path}` : `Create ${path}`),
        content: Buffer.from(content ?? "").toString("base64"),
        ...(fileSha ? { sha: fileSha } : {}),
        ...(branch ? { branch } : {}),
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as { message?: string }).message ?? "GitHub API error" },
      { status: res.status },
    );
  }
  const data = await res.json() as {
    content?: { path?: string; sha?: string };
    commit?: { sha?: string; message?: string; author?: { name?: string; date?: string } };
  };
  return NextResponse.json({
    path: data.content?.path,
    sha: data.content?.sha,
    commit: data.commit ? {
      sha: data.commit.sha,
      message: data.commit.message,
      author: data.commit.author?.name,
      date: data.commit.author?.date,
    } : undefined,
  });
}
