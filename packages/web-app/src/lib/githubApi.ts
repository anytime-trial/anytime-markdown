/** GitHub API ユーティリティ — 重複する fetch パターンを集約 */

import type { NoteGraphDocInput } from "@anytime-markdown/graph-core";

/** `/api/github/repos` が返すリポジトリ。 */
export interface GitHubRepo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

/**
 * ファイル内容を取得（branch または commit SHA 指定）。
 * 非 2xx はエラーとして投げる（401 等を空ファイルとして握りつぶすと、権限不足が
 * 「空文書が開けた」ように見えてしまうため）。
 */
export async function fetchFileContent(repo: string, filePath: string, ref: string): Promise<string> {
  const res = await fetch(
    `/api/github/content?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(filePath)}&ref=${encodeURIComponent(ref)}`,
  );
  if (!res.ok) {
    throw new Error(`GitHub content fetch failed: ${res.status} (${repo}/${filePath}@${ref})`);
  }
  const data = await res.json();
  return data.content ?? "";
}

/** ノート網入力（GitHub リポジトリの `.md` frontmatter 由来）を取得。失敗時は空配列。 */
export async function fetchNoteGraphDocs(
  repo: string,
  branch: string,
): Promise<NoteGraphDocInput[]> {
  const res = await fetch(
    `/api/note-graph?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.docs) ? (data.docs as NoteGraphDocInput[]) : [];
}
