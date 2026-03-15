import { type NextRequest, NextResponse } from "next/server";
import { fetchWithRetry } from "../../../../lib/fetchWithRetry";
import { getGitHubToken } from "../../../../lib/githubAuth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const repo = request.nextUrl.searchParams.get("repo");
  if (!repo) {
    return NextResponse.json({ error: "Missing repo param" }, { status: 400 });
  }
  const res = await fetchWithRetry(
    `https://api.github.com/repos/${repo}/branches?per_page=100`,
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
  return NextResponse.json(
    (data as { name: string }[]).map((b) => b.name),
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
