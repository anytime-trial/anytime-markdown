/** GitHub API ユーティリティ — 重複する fetch パターンを集約 */

/** `/api/github/repos` が返すリポジトリ。 */
export interface GitHubRepo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

/** ファイル内容を取得（branch または commit SHA 指定） */
export async function fetchFileContent(repo: string, filePath: string, ref: string): Promise<string> {
  const res = await fetch(
    `/api/github/content?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(filePath)}&ref=${encodeURIComponent(ref)}`,
  );
  if (!res.ok) return "";
  const data = await res.json();
  return data.content ?? "";
}
