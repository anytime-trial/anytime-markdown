import * as fs from 'node:fs';

interface RootDirDependencies {
  /** rootDir が実在するか。省略時は fs.existsSync。 */
  pathExists?: (rootDir: string) => boolean;
  /** 実在しないときの警告先。省略時は警告しない（テスト・ライブラリ利用のため）。 */
  warn?: (message: string) => void;
}

/**
 * サーバーの読み書き基準ディレクトリ (rootDir) を決める。
 *
 * 子プロセスの cwd は起動元によって違う。VS Code ネイティブの MCP 探索経路
 * (`McpMarkdownServerProvider`) は定義を要求されるたびにワークスペースを評価し
 * `ANYTIME_MARKDOWN_ROOT` で渡す。一方 `.mcp.json` 経路はこの環境変数を渡さない
 * （生成時のワークスペースを焼き付けると陳腐化するため。Claude Code は `.mcp.json` の
 * 在るディレクトリでサーバーを起動する）。CLI 直起動（`npx mcp-markdown`）も同様に
 * cwd を使う。未設定・空白のみは未指定として扱う。
 *
 * 解決した rootDir が実在しない場合は `warn` へ通知する。実在しないルートでも
 * サーバーは起動でき、MCP クライアントからは接続成功として見えるため、失敗として
 * 観測できる唯一の経路がこの警告になる。標準出力は MCP のプロトコル経路なので使わない。
 */
export function resolveMarkdownRootDir(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
  deps: RootDirDependencies = {},
): string {
  const configured = env.ANYTIME_MARKDOWN_ROOT?.trim();
  const rootDir = configured ? configured : cwd;
  const pathExists = deps.pathExists ?? fs.existsSync;
  if (!pathExists(rootDir)) {
    const source = configured
      ? 'ANYTIME_MARKDOWN_ROOT'
      : 'ANYTIME_MARKDOWN_ROOT unset → cwd fallback';
    deps.warn?.(
      `[${new Date().toISOString()}] [WARN] mcp-markdown: rootDir does not exist: ${rootDir} (${source})`,
    );
  }
  return rootDir;
}
