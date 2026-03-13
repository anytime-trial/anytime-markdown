import { NextResponse } from "next/server";
import { getGitHubToken } from "../../../../lib/githubAuth";

export async function GET(): Promise<NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const res = await fetch(
    "https://api.github.com/user/repos?sort=updated&per_page=30",
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
  const repos = await res.json();
  return NextResponse.json(
    repos.map((r: Record<string, unknown>) => ({
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
    })),
  );
}
