import type {
  TimelineCommit,
  TimelineDataProvider,
} from "@anytime-markdown/editor-core";

export class GitHubTimelineProvider implements TimelineDataProvider {
  private repo: string;
  private cache = new Map<string, string>();

  constructor(repo: string) {
    this.repo = repo;
  }

  async getCommits(filePath: string): Promise<TimelineCommit[]> {
    const params = new URLSearchParams({
      repo: this.repo,
      path: filePath,
    });
    const res = await fetch(`/api/github/commits?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch commits");
    const data: Array<{
      sha: string;
      message: string;
      author: string;
      date: string;
    }> = await res.json();
    return data.map((c) => ({
      ...c,
      date: new Date(c.date),
    }));
  }

  async getFileContent(filePath: string, sha: string): Promise<string> {
    const cacheKey = `${sha}:${filePath}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      repo: this.repo,
      path: filePath,
      ref: sha,
    });
    const res = await fetch(`/api/github/content?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch file content");
    const { content } = (await res.json()) as { content: string };
    this.cache.set(cacheKey, content);
    return content;
  }
}
