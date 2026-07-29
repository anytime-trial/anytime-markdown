import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { resolveLocale } from '@anytime-markdown/vscode-common';

import { getGitHubToken } from './githubAuth';
import { createLogger, type Logger } from './logger';
import { createProvider } from './providerFactory';
import { readTicketConfig, resolveTicketSource, type TicketSource } from './repoResolver';
import { TicketsPanelManager, type PanelContext } from './TicketsPanelManager';

const run = promisify(execFile);

/**
 * git を実行し stdout を返す。git 未インストール・リポジトリ外・対象ブランチ無し等は
 * 「解決できなかった」として呼び出し側では null 扱いにするが、原因調査ができるよう
 * 失敗した引数とエラー内容を warn ログへ残す（silent catch 禁止）。
 *
 * execFile は引数を配列で渡すためシェルを経由しない（`cwd` がユーザー環境依存の
 * パスであってもシェルインジェクションの余地はない）。
 */
async function git(args: string[], cwd: string, logger: Logger): Promise<string | null> {
  try {
    const { stdout } = await run('git', args, { cwd });
    return stdout.trim();
  } catch (error) {
    logger.warn(
      `git ${args.join(' ')} が失敗しました (cwd=${cwd}): ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = createLogger();
  context.subscriptions.push({ dispose: () => logger.dispose() });

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const resolveSource = async (): Promise<TicketSource | null> => {
    const config = readTicketConfig();
    if (!workspaceRoot) {
      return resolveTicketSource(config, { remoteUrl: null, branch: null });
    }
    const [remoteUrl, branch] = await Promise.all([
      git(['remote', 'get-url', 'origin'], workspaceRoot, logger),
      git(['rev-parse', '--abbrev-ref', 'HEAD'], workspaceRoot, logger),
    ]);
    return resolveTicketSource(config, { remoteUrl, branch });
  };

  // git config user.name は VS Code セッション中に変わることを想定しない値である一方、
  // resolveContext は RPC のたびに呼ばれる設計のため、素朴に毎回子プロセスを起動すると
  // 無駄が大きい。値でなく Promise 自体をキャッシュすることで、解決結果が undefined
  // だった場合（git 未設定・workspaceRoot 無し）も「解決済み」として扱え、かつ同時多発
  // 呼び出しでの多重起動も防げる。activate() のライフタイム内では無効化しない
  // （途中で `git config user.name` を変更する運用は想定しない）。
  let currentUserPromise: Promise<string | undefined> | undefined;
  const resolveCurrentUser = (): Promise<string | undefined> => {
    if (!workspaceRoot) {
      return Promise.resolve(undefined);
    }
    if (!currentUserPromise) {
      currentUserPromise = git(['config', 'user.name'], workspaceRoot, logger).then((name) => name ?? undefined);
    }
    return currentUserPromise;
  };

  const resolveContext = async (interactive = false): Promise<PanelContext> => {
    // resolveLocale(override, envLanguage)。本拡張はロケール上書き設定を持たないため override は undefined。
    const locale = resolveLocale(undefined, vscode.env.language);
    const source = await resolveSource();
    if (!source) {
      logger.warn('リポジトリを解決できませんでした。anytimeTickets.repo を設定してください。');
      return { source: null, provider: null, locale };
    }
    // SHORTCUT: getGitHubToken を resolveContext 呼び出しのたび（RPC ごと）に呼んでいる.
    // ceiling: VS Code の authentication API はセッションをプロセス内で保持しており、
    // silent 呼び出しは通常ネットワーク往復を伴わない前提（拡張側で応答時間の実測はしていない）.
    // upgrade: プロファイリングで RPC 応答遅延の主要因と判明したら、
    // vscode.authentication.onDidChangeSessions を購読してアプリ層キャッシュ＋
    // サインアウト時の無効化を行う専用実装へ切り替える.
    const token = await getGitHubToken({ interactive });
    if (!token) {
      logger.warn('GitHub 認証セッションがありません。サインインしてください。');
      return { source, provider: null, locale };
    }
    const currentUser = await resolveCurrentUser();
    return { source, provider: createProvider(source, token), currentUser, locale };
  };

  // selectRepo は manager.reload() を呼ぶが、manager のコンストラクタは selectRepo を
  // onSelectRepo として要求する（webview からの 'selectRepo' 受信時に呼ぶため）ため、
  // 両者は本質的に相互参照になる。TDZ の暗黙のホイスティングに依存する代わりに、
  // 「後から代入されるスロット」であることをコード上で明示する。activate() は同期的に
  // 最後まで実行されるため、webview / コマンドからの実際の呼び出し時点では必ず代入済みになる。
  let selectRepoAction: (() => Promise<void>) | undefined;
  const manager = new TicketsPanelManager(
    context,
    logger,
    () => resolveContext(false),
    async () => {
      await selectRepoAction?.();
    },
  );
  context.subscriptions.push({ dispose: () => manager.dispose() });

  const selectRepo = async (): Promise<void> => {
    const repo = await vscode.window.showInputBox({
      title: 'Anytime Tickets',
      prompt: 'owner/repo',
      value: readTicketConfig().repo,
    });
    if (repo === undefined) return;
    const branch = await vscode.window.showInputBox({
      title: 'Anytime Tickets',
      prompt: 'branch',
      value: readTicketConfig().branch,
    });
    if (branch === undefined) return;
    const section = vscode.workspace.getConfiguration('anytimeTickets');
    await section.update('repo', repo, vscode.ConfigurationTarget.Workspace);
    await section.update('branch', branch, vscode.ConfigurationTarget.Workspace);
    await manager.reload();
  };
  selectRepoAction = selectRepo;

  context.subscriptions.push(
    vscode.commands.registerCommand('anytime-tickets.open', async () => {
      await manager.open();
    }),
    vscode.commands.registerCommand('anytime-tickets.reload', async () => {
      await manager.reload();
    }),
    vscode.commands.registerCommand('anytime-tickets.selectRepo', selectRepo),
    vscode.commands.registerCommand('anytime-tickets.signIn', async () => {
      const ctx = await resolveContext(true);
      if (ctx.provider) {
        logger.info('GitHub 認証に成功しました。');
        await manager.reload();
      } else {
        void vscode.window.showErrorMessage('GitHub 認証に失敗しました。');
      }
    }),
  );

  logger.info('anytime-tickets を有効化しました。');
}

export function deactivate(): void {
  // 後始末は context.subscriptions が担う
}
