/** GitHub リポジトリ参照 (owner / name)。 */
export interface GitHubRepoRef {
  readonly owner: string;
  readonly name: string;
}

/**
 * `git remote get-url origin` の出力から GitHub の owner/name を抽出する純粋関数。
 *
 * 対応形式:
 * - `git@github.com:owner/name.git`
 * - `ssh://git@github.com/owner/name.git`
 * - `https://github.com/owner/name(.git)`
 * - `https://github.com/owner/name/` (末尾スラッシュ)
 *
 * GitHub 以外の host (gitlab 等) や解析不能なら `null` を返す (Ingester は warn + skip)。
 * GitHub Enterprise の独自ホストは本参照実装では非対応 (将来 host 設定で拡張)。
 */
export function parseGitHubRemote(remoteUrl: string | null | undefined): GitHubRepoRef | null {
  if (!remoteUrl) return null;
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  // host が github.com のものだけを対象にする。scp 形式 (git@github.com:owner/name) と
  // URL 形式 (https://github.com/owner/name) の両方を 1 本の正規表現で吸収する。
  const match = /github\.com[/:]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(trimmed);
  if (!match) return null;

  const owner = match[1];
  const name = match[2];
  if (!owner || !name || name.includes('/')) return null;

  return { owner, name };
}
