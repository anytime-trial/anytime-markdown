import * as vscode from 'vscode';

const SCOPES = ['repo'];

/**
 * VS Code 標準の GitHub 認証からアクセストークンを取得する。
 *
 * `createIfNone: false`（既定）で「既存セッションがあれば返す・無ければ undefined」になる。
 * 初期表示でこれを立てないのは、Remote SSH 等でパネルを開いただけで認証ダイアログに
 * ブロックされるのを避けるためである。
 *
 * Why not: `silent: true` を渡さない。この API の `silent` は「静かにセッションを取る」
 * という意味ではなく **「Accounts メニューにサインイン案内のバッジを出さない」** である。
 * 立てると、未サインインのユーザーに残った唯一の受動的な導線を自分で塞いでしまい、
 * 「認証が未完了」の表示だけが出続けてサインイン手段が見つからない状態になる（実機で発生）。
 */
export async function getGitHubToken(options: { interactive: boolean }): Promise<string | null> {
  const session = await vscode.authentication.getSession('github', SCOPES, {
    createIfNone: options.interactive,
  });
  return session?.accessToken ?? null;
}
