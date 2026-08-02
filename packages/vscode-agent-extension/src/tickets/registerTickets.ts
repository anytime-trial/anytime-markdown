import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { resolveLocale } from '@anytime-markdown/vscode-common';

import { TicketsViewProvider } from '../providers/TicketsViewProvider';
import { getGitHubToken } from './githubAuth';
import { createLocalGitIo } from './localGitIo';
import { createGitHubProvider, createLocalGitProvider } from './providerFactory';
import {
  readTicketConfig,
  readTicketsDirectorySetting,
  resolveTicketsRepoRoot,
  resolveTicketSource,
  type TicketSource,
} from './repoResolver';
import { TicketsPanelManager, type PanelContext } from './TicketsPanelManager';
import type { TicketsLogger } from './ticketsRpcHandler';

const run = promisify(execFile);

const CONFIG_SECTION = 'anytimeAgent.tickets.github';

/**
 * git を実行し stdout を返す。git 未インストール・リポジトリ外・対象ブランチ無し等は
 * 「解決できなかった」として呼び出し側では null 扱いにするが、原因調査ができるよう
 * 失敗した引数とエラー内容を warn ログへ残す（silent catch 禁止）。
 *
 * execFile は引数を配列で渡すためシェルを経由しない（`cwd` がユーザー環境依存の
 * パスであってもシェルインジェクションの余地はない）。
 */
async function git(args: string[], cwd: string, logger: TicketsLogger): Promise<string | null> {
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

/**
 * チケット機能（TreeView + カンバンボードの webview + コマンド）を agent 拡張へ登録する。
 *
 * Why not: agent 拡張の `extension.ts` へ直接展開しない。既に 600 行超あり、
 * チケット機能は独立して有効・無効を判断できる単位のため、登録処理ごと分離しておく。
 */
export function registerTicketsFeature(
  context: vscode.ExtensionContext,
  logger: TicketsLogger,
): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  /**
   * git 操作の基点となるチケットリポジトリのルート。
   * ワークスペース自身ではなく `anytimeAgent.tickets.directory` が指すクローンを見る
   * （チケットは別リポジトリに置かれる運用のため）。
   */
  const resolveRepoRoot = (): string | null =>
    resolveTicketsRepoRoot({
      configured: readTicketsDirectorySetting(),
      workspaceRoot: workspaceRoot ?? null,
      workspaceHasTicketsDir:
        workspaceRoot !== undefined && existsSync(path.join(workspaceRoot, '.tickets')),
      envDir: process.env.ANYTIME_TICKETS_DIR,
    });

  const resolveSource = async (): Promise<TicketSource | null> => {
    const config = readTicketConfig();
    for (const value of config.invalidProviderValues) {
      logger.warn(
        `プロバイダ設定の値が不正なため無視しました: ${value}` +
          '（有効な値: local-git / github-contents / github-issues）',
      );
    }
    if (config.usedLegacyProviderKey) {
      logger.warn(
        '`anytimeAgent.tickets.github.provider` は非推奨です。' +
          '`anytimeAgent.tickets.provider` へ移してください（当面は旧キーの値を使用します）。',
      );
    }
    const repoRoot = resolveRepoRoot();
    if (!repoRoot) {
      return resolveTicketSource(config, { remoteUrl: null, branch: null }, null);
    }
    // local-git は remote / ブランチを見ないので、子プロセス起動ごと省く。
    if (config.provider === 'local-git') {
      return resolveTicketSource(config, { remoteUrl: null, branch: null }, repoRoot);
    }
    const [remoteUrl, branch] = await Promise.all([
      git(['remote', 'get-url', 'origin'], repoRoot, logger),
      git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot, logger),
    ]);
    return resolveTicketSource(config, { remoteUrl, branch }, repoRoot);
  };

  // 未認証の通知を 1 回の未認証状態につき 1 度だけ出すためのフラグ。
  // 認証が通った時点で false に戻し、サインアウト後は再度促せるようにする。
  let signInPrompted = false;

  // git config user.name は VS Code セッション中に変わることを想定しない値である一方、
  // resolveContext は RPC のたびに呼ばれる設計のため、素朴に毎回子プロセスを起動すると
  // 無駄が大きい。値でなく Promise 自体をキャッシュすることで、解決結果が undefined
  // だった場合（git 未設定・workspaceRoot 無し）も「解決済み」として扱え、かつ同時多発
  // 呼び出しでの多重起動も防げる。
  let currentUserPromise: Promise<string | undefined> | undefined;
  const resolveCurrentUser = (): Promise<string | undefined> => {
    // コメント著者はチケットリポジトリへのコミット者と一致させたいので、
    // ワークスペースではなくチケットリポジトリ側の user.name を引く。
    const repoRoot = resolveRepoRoot();
    if (!repoRoot) {
      return Promise.resolve(undefined);
    }
    currentUserPromise ??= git(['config', 'user.name'], repoRoot, logger).then(
      (name) => name ?? undefined,
    );
    return currentUserPromise;
  };

  const resolveContext = async (interactive = false): Promise<PanelContext> => {
    // resolveLocale(override, envLanguage)。ロケール上書き設定は持たないため override は undefined。
    const locale = resolveLocale(undefined, vscode.env.language);
    const source = await resolveSource();
    if (!source) {
      logger.warn(
        'チケットのリポジトリを解決できませんでした。' +
          '`anytimeAgent.tickets.directory` にチケットリポジトリのローカルクローンを指定するか、' +
          `\`${CONFIG_SECTION}.repo\` / \`.branch\` で直接指定してください。`,
      );
      return { source: null, provider: null, locale };
    }
    // local-git はクローンが既に持つ git の資格情報で完結するため、GitHub 認証を通らない。
    if (source.provider === 'local-git') {
      const currentUser = await resolveCurrentUser();
      return {
        source,
        provider: createLocalGitProvider(source, createLocalGitIo(source.repoRoot)),
        currentUser,
        locale,
      };
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
    signInPrompted = false;
    const currentUser = await resolveCurrentUser();
    return { source, provider: createGitHubProvider(source, token), currentUser, locale };
  };

  // promptSignInIfNeeded は manager.reload() を呼ぶ signIn を経由するため、
  // manager より後に定義される。後から代入されるスロットとして明示する
  // （init 送信時点では必ず代入済み）。
  let onContextResolved: ((ctx: PanelContext) => void) | undefined;
  const manager = new TicketsPanelManager(context, logger, () => resolveContext(false), (ctx) => {
    onContextResolved?.(ctx);
  });
  context.subscriptions.push({ dispose: () => manager.dispose() });

  const signIn = async (): Promise<void> => {
    const ctx = await resolveContext(true);
    if (ctx.source?.provider === 'local-git') {
      // local-git はクローンの git 資格情報で完結する。ここで「認証に成功」と伝えると、
      // GitHub のセッションが張られたと誤解させる。
      void vscode.window.showInformationMessage(
        'ローカルの git リポジトリを直接使う設定のため、GitHub へのサインインは不要です。',
      );
      return;
    }
    if (ctx.provider) {
      logger.info('GitHub 認証に成功しました。');
      await manager.reload();
    } else {
      void vscode.window.showErrorMessage('GitHub 認証に失敗しました。');
    }
  };

  /**
   * 未サインインのときにサインイン導線を出す。
   *
   * Accounts メニューのバッジだけでは気づきにくく、ボード側には
   * 「認証が未完了」という表示しか出ないため、パネルを開いた時点で能動的に促す。
   * 1 回の未認証状態につき 1 度だけ出す（RPC ごとに通知が積まれるのを防ぐ）。
   */
  const promptSignInIfNeeded = async (): Promise<void> => {
    if (signInPrompted) {
      return;
    }
    signInPrompted = true;
    const signInLabel = 'サインイン';
    const picked = await vscode.window.showWarningMessage(
      'チケットの読み込みには GitHub へのサインインが必要です。',
      signInLabel,
    );
    if (picked === signInLabel) {
      await signIn();
    }
  };

  // init を送るたび（open / reload の両方）に、解決済みの文脈で未認証を判定する。
  // リポジトリは解決できているのにトークンが無い場合だけ促す（未設定は空状態の案内で足りる）。
  onContextResolved = (ctx) => {
    if (ctx.source && !ctx.provider) {
      void promptSignInIfNeeded();
    }
  };

  const viewProvider = new TicketsViewProvider();
  context.subscriptions.push(
    vscode.window.createTreeView('anytimeAgent.tickets', { treeDataProvider: viewProvider }),
    vscode.commands.registerCommand('anytime-agent.tickets.open', async () => {
      await manager.open();
    }),
    vscode.commands.registerCommand('anytime-agent.tickets.reload', async () => {
      await manager.reload();
    }),
    vscode.commands.registerCommand('anytime-agent.tickets.signIn', signIn),
  );
}
