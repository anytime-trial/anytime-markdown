import * as vscode from 'vscode';

const SCOPES = ['repo'];

/**
 * VS Code 標準の GitHub 認証からアクセストークンを取得する。
 *
 * Why not: 初期表示で createIfNone を立てると、Remote SSH 等でパネルを開いただけで
 * 認証ダイアログにブロックされる。silent を既定にし、明示サインイン時のみ対話する。
 */
export async function getGitHubToken(options: { interactive: boolean }): Promise<string | null> {
  const session = await vscode.authentication.getSession('github', SCOPES, {
    createIfNone: options.interactive,
    silent: options.interactive ? undefined : true,
  });
  return session?.accessToken ?? null;
}
