import { type NextRequest, NextResponse } from "next/server";
import { fetchWithRetry } from "../../../../lib/fetchWithRetry";
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
  if (!repo || path === null || !ref) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
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
  if (!repo || !path) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }
  const encodedPath = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  // 既存ファイル更新時: sha が未指定なら自動取得
  let fileSha = sha;
  if (!fileSha && content != null) {
    const getRes = await fetchWithRetry(
      `https://api.github.com/repos/${repo}/contents/${encodedPath}${branch ? `?ref=${branch}` : ""}`,
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
  console.log("[content PUT] repo=%s path=%s commit=%s", repo, path, JSON.stringify(data.commit ?? null));
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

/** Delete a file via GitHub Contents API (DELETE) */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = (await request.json()) as {
    repo?: string;
    path?: string;
    message?: string;
    branch?: string;
  };
  const { repo, path, message, branch } = body;
  if (!repo || !path) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }
  const encodedPath = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  // ファイルの SHA を取得
  const getRes = await fetchWithRetry(
    `https://api.github.com/repos/${repo}/contents/${encodedPath}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );
  if (!getRes.ok) {
    return NextResponse.json(
      { error: "File not found" },
      { status: getRes.status },
    );
  }
  const fileData = (await getRes.json()) as { sha?: string };
  const sha = fileData.sha;
  if (!sha) {
    return NextResponse.json({ error: "Cannot get file SHA" }, { status: 400 });
  }

  const res = await fetchWithRetry(
    `https://api.github.com/repos/${repo}/contents/${encodedPath}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message ?? `Delete ${path}`,
        sha,
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
  return NextResponse.json({ deleted: true });
}

/** Rename a file via GitHub Contents API (GET + PUT + DELETE) */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = (await request.json()) as {
    repo?: string;
    oldPath?: string;
    newPath?: string;
    branch?: string;
  };
  const { repo, oldPath, newPath, branch } = body;
  if (!repo || !oldPath || !newPath) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
  };

  const encodeSegments = (p: string) =>
    p
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");

  // 1. GET old file (content + sha)
  const getRes = await fetchWithRetry(
    `https://api.github.com/repos/${repo}/contents/${encodeSegments(oldPath)}${branch ? `?ref=${branch}` : ""}`,
    { headers },
  );
  if (!getRes.ok) {
    return NextResponse.json(
      { error: "File not found" },
      { status: getRes.status },
    );
  }
  const fileData = (await getRes.json()) as {
    content?: string;
    sha?: string;
  };
  if (!fileData.sha || fileData.content == null) {
    return NextResponse.json(
      { error: "Cannot read file" },
      { status: 400 },
    );
  }

  // 2. PUT new file + DELETE old file in parallel
  const [putRes, delRes] = await Promise.all([
    fetchWithRetry(
      `https://api.github.com/repos/${repo}/contents/${encodeSegments(newPath)}`,
      {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Rename ${oldPath} → ${newPath}`,
          content: fileData.content.replace(/\n/g, ""),
          ...(branch ? { branch } : {}),
        }),
      },
    ),
    fetchWithRetry(
      `https://api.github.com/repos/${repo}/contents/${encodeSegments(oldPath)}`,
      {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Rename ${oldPath} → ${newPath} (delete old)`,
          sha: fileData.sha,
          ...(branch ? { branch } : {}),
        }),
      },
    ),
  ]);
  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as { message?: string }).message ?? "GitHub API error" },
      { status: putRes.status },
    );
  }
  if (!delRes.ok) {
    const err = await delRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as { message?: string }).message ?? "Failed to delete old file" },
      { status: delRes.status },
    );
  }

  return NextResponse.json({ renamed: true });
}
