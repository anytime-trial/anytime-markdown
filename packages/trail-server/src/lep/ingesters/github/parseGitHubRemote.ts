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
  // URL 形式 (https://github.com/owner/name) の両方を吸収する。host 以降の path 部分は
  // 単一の貪欲キャプチャ (`.+`) で取り、末尾スラッシュ・`.git` の除去と owner/name 分割は
  // 文字列操作で行う (lazy + optional 連鎖による js/polynomial-redos / S5852 を回避)。
  const match = /github\.com[/:](.+)$/.exec(trimmed);
  if (!match) return null;

  // 末尾スラッシュを正規表現を使わず O(n) で除去する。
  let path = match[1];
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 0x2f /* '/' */) end--;
  path = path.slice(0, end);

  if (path.endsWith('.git')) path = path.slice(0, -4);

  const slash = path.indexOf('/');
  if (slash <= 0) return null;
  const owner = path.slice(0, slash);
  const name = path.slice(slash + 1);
  if (!name || name.includes('/')) return null;

  return { owner, name };
}
