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
 * VS Code 拡張から子プロセス起動される場合、cwd はワークスペースとは限らないため
 * `ANYTIME_MARKDOWN_ROOT` でワークスペースルートを受け取る。standalone
 * (`npx mcp-markdown`) 起動では未設定なので cwd にフォールバックする。
 *
 * 解決した rootDir が実在しない場合は `warn` へ通知する。実在しないルートでも
 * サーバーは起動でき、「接続は成功するが何も見つからない」という発見の遅い壊れ方を
 * するため、失敗として観測できる唯一の経路がこの警告になる。
 */
export function resolveMarkdownRootDir(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
  deps: RootDirDependencies = {},
): string {
  const configured = env.ANYTIME_MARKDOWN_ROOT;
  const rootDir = configured ?? cwd;
  const pathExists = deps.pathExists ?? fs.existsSync;
  if (!pathExists(rootDir)) {
    const source = configured === undefined
      ? 'ANYTIME_MARKDOWN_ROOT unset → cwd fallback'
      : 'ANYTIME_MARKDOWN_ROOT';
    deps.warn?.(
      `[${new Date().toISOString()}] [WARN] mcp-markdown: rootDir does not exist: ${rootDir} (${source})`,
    );
  }
  return rootDir;
}
