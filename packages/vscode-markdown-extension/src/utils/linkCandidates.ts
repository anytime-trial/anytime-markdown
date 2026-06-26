/**
 * リンク target からファイルを開くための候補絶対パスを構築する純粋ヘルパ。
 *
 * - 相対パス（`./x.md` / `x.md` / `../x.md`）: ドキュメント位置 → ワークスペースルートの
 *   順で候補化（従来挙動を維持）。
 * - 先頭 `/`（または Windows のドライブ）絶対パス: VS Code 組込 Markdown プレビュー同様
 *   「ワークスペースルート相対」として解決する（OS ファイルシステムルートとしては扱わない）。
 *
 * いずれもワークスペース外への脱出（パストラバーサル）は拒否し `null` を返す。
 *
 * @param filePath リンクの target（`#L<n>` などのアンカーは呼び出し側で除去済み）
 * @param docDir 現在ドキュメントのディレクトリ（絶対パス）
 * @param workspaceRoot ワークスペースルート（絶対パス）。未定義可。
 * @returns 順に試行する絶対パス候補。解決不能・脱出時は `null`。
 */
import * as path from 'path';

function isInside(target: string, root: string): boolean {
  return target === root || target.startsWith(root + path.sep);
}

export function buildLinkCandidates(
  filePath: string,
  docDir: string,
  workspaceRoot: string | undefined,
): string[] | null {
  if (!filePath) return null;

  // 先頭 `/` の絶対パスはワークスペースルート相対として解決（VS Code 流儀）。
  if (path.isAbsolute(filePath)) {
    if (!workspaceRoot) return null;
    const rel = filePath.replace(/^[/\\]+/, '');
    const target = path.resolve(workspaceRoot, rel);
    return isInside(target, workspaceRoot) ? [target] : null;
  }

  // 相対パス（従来挙動を維持）: ドキュメント位置基準で解決。
  const targetPath = path.resolve(docDir, filePath);
  if (workspaceRoot && !isInside(targetPath, workspaceRoot)) {
    const fromRoot = path.resolve(workspaceRoot, filePath);
    if (!isInside(fromRoot, workspaceRoot)) return null;
  }
  const candidates = [targetPath];
  if (workspaceRoot) {
    const fromRoot = path.resolve(workspaceRoot, filePath);
    if (fromRoot !== targetPath) candidates.push(fromRoot);
  }
  return candidates;
}
