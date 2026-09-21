import * as fs from 'node:fs';

interface ResolveRootDirDependencies {
  /** rootDir が実在するか。省略時は fs.existsSync。 */
  pathExists?: (rootDir: string) => boolean;
  /** 実在しないときの警告先。省略時は警告しない（テスト・ライブラリ利用のため）。 */
  warn?: (message: string) => void;
}

/**
 * サーバーの読み書き基準ディレクトリ (rootDir) を決める。
 *
 * 子プロセスの cwd は起動元によって違う。VS Code ネイティブの MCP 探索経路は定義を要求される
 * たびにワークスペースを評価し `ANYTIME_DIAGRAM_ROOT` で渡す。一方 `.mcp.json` 経路はこの環境
 * 変数を渡さない（生成時のワークスペースを焼き付けると陳腐化するため）。CLI 直起動も cwd を使う。
 *
 * 解決した rootDir が実在しない場合は `warn` へ通知する。実在しないルートでもサーバーは起動でき、
 * MCP クライアントからは接続成功として見えるため、失敗として観測できる唯一の経路がこの警告になる。
 * 標準出力は MCP のプロトコル経路なので使わない。
 */
export function resolveRootDir(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
  deps: ResolveRootDirDependencies = {},
): string {
  const configured = env.ANYTIME_DIAGRAM_ROOT?.trim();
  const rootDir = configured ? configured : cwd;
  const pathExists = deps.pathExists ?? fs.existsSync;
  if (!pathExists(rootDir)) {
    const source = configured ? 'ANYTIME_DIAGRAM_ROOT' : 'ANYTIME_DIAGRAM_ROOT unset → cwd fallback';
    deps.warn?.(
      `[${new Date().toISOString()}] [WARN] mcp-diagram: rootDir does not exist: ${rootDir} (${source})`,
    );
  }
  return rootDir;
}
