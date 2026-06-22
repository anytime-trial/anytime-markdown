/**
 * コードグラフのノード ID は `<repo>:<拡張子なしのリポジトリ相対パス>` 形式。
 * file-analysis が返す filePath（`packages/x/src/Foo.ts`）を get_code_dependencies が
 * 受理できるよう正規化する。既にノード ID（`:` を含む）ならそのまま返す。
 */
export function toCodeGraphNodeId(repoName: string, pathOrId: string): string {
  if (pathOrId.includes(':')) return pathOrId;
  // .d.ts / .d.mts / .d.cts などの複合拡張子を先に除去してから末尾拡張子を剥がす
  const noExt = pathOrId.replace(/\.d\.[cm]?ts$/, '').replace(/\.[^./]+$/, '');
  return `${repoName}:${noExt}`;
}
