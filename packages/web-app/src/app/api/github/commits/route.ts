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
  if (!repo || !path) {
    return NextResponse.json(
      { error: "Missing repo or path" },
      { status: 400 },
    );
  }
  const res = await fetch(
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
  return NextResponse.json(
    commits.map(
      (c: {
        sha: string;
        commit: { message: string; author: { name: string; date: string } };
      }) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author.name,
        date: c.commit.author.date,
      }),
    ),
  );
}
