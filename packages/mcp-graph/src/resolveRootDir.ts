/**
 * サーバーの読み書き基準ディレクトリ (rootDir) を決める。
 *
 * VS Code 拡張 (anytime-graph) は子プロセスとして本サーバーを起動するため、
 * その cwd は拡張ホストのもので、ワークスペースを指さない。拡張は
 * `ANYTIME_GRAPH_ROOT` にワークスペースルートを渡す。
 *
 * 環境変数が無い / 空白のみの場合は、CLI から直接起動された場合として cwd を使う
 * （従来の振る舞い）。
 */
export function resolveRootDir(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const configured = env.ANYTIME_GRAPH_ROOT?.trim();
  return configured ? configured : cwd;
}
