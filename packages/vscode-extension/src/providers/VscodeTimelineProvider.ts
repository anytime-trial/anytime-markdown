import type * as vscode from "vscode";

interface TimelineCommit {
  sha: string;
  message: string;
  author: string;
  date: Date;
}

interface Repository {
  log(options?: { maxEntries?: number; path?: string }): Promise<Array<{
    hash: string;
    message: string;
    authorName?: string;
    authorDate?: Date;
  }>>;
  show(ref: string, path: string): Promise<string>;
}

export class VscodeTimelineProvider {
  constructor(
    private getRepository: (uri: vscode.Uri) => Promise<Repository | null>,
  ) {}

  async getCommits(
    uri: vscode.Uri,
    relativePath: string,
  ): Promise<TimelineCommit[]> {
    const repo = await this.getRepository(uri);
    if (!repo) return [];
    const commits = await repo.log({ path: relativePath });
    return commits.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.authorName ?? "Unknown",
      date: c.authorDate ?? new Date(),
    }));
  }

  async getFileContent(
    uri: vscode.Uri,
    relativePath: string,
    sha: string,
  ): Promise<string | null> {
    const repo = await this.getRepository(uri);
    if (!repo) return null;
    try {
      return await repo.show(sha, relativePath);
    } catch {
      return null;
    }
  }
}
