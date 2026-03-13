import { type NextRequest, NextResponse } from "next/server";
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
  const res = await fetch(
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
    );
  }
  // Single file: decode base64 content
  const content = Buffer.from(
    (data as { content: string }).content,
    "base64",
  ).toString("utf-8");
  return NextResponse.json({ content });
}
