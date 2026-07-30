import * as path from 'node:path';
import * as vscode from 'vscode';
import type { TicketProviderKind } from '@anytime-markdown/tickets-core';

const SSH_SCP = /^git@github\.com:([^/]+)\/([^/]+)$/;
const SSH_URL = /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+)$/;
const HTTPS_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/;

/**
 * git remote URL から `owner/repo` を取り出す。GitHub 以外のホストは null を返す。
 *
 * Why not: `apiBaseUrl` をユーザー設定可能にして GHE を受け入れると、
 * tickets-core の providerDefaultHosts() が供給する SSRF 許可リストが追随しない。
 * ホスト拡張は許可リストの供給経路を整えるまで行わない。
 */
export function parseGitHubRemote(url: string): string | null {
  // Why not: replace を先に行うと、末尾に空白/改行がある入力（git remote get-url の出力等）で
  // /\.git$/ がマッチせず .git が残る。trim を先に行う必要がある。
  const trimmed = url.trim().replace(/\.git$/, '');
  for (const pattern of [SSH_SCP, SSH_URL, HTTPS_URL]) {
    const matched = pattern.exec(trimmed);
    if (matched) {
      return `${matched[1]}/${matched[2]}`;
    }
  }
  return null;
}

export interface TicketSource {
  repo: string;
  branch: string;
  provider: TicketProviderKind;
}

export interface GitFacts {
  remoteUrl: string | null;
  branch: string | null;
}

/**
 * 設定 → git 実測の順で対象を解決する。解決できなければ null（呼び出し側が設定を促す）。
 */
export function resolveTicketSource(
  config: { repo: string; branch: string; provider: TicketSource['provider'] },
  git: GitFacts,
): TicketSource | null {
  const repo = config.repo.trim() || (git.remoteUrl ? parseGitHubRemote(git.remoteUrl) : null);
  if (!repo) {
    return null;
  }
  const branch = config.branch.trim() || git.branch?.trim() || '';
  if (!branch && config.provider === 'github-contents') {
    return null;
  }
  return { repo, branch, provider: config.provider };
}

export function readTicketConfig(): {
  repo: string;
  branch: string;
  provider: TicketSource['provider'];
} {
  const section = vscode.workspace.getConfiguration('anytimeAgent.tickets.github');
  return {
    repo: section.get<string>('repo') ?? '',
    branch: section.get<string>('branch') ?? '',
    provider: section.get<TicketSource['provider']>('provider') ?? 'github-contents',
  };
}

export interface TicketsDirectoryInputs {
  /** VS Code 設定 `anytimeAgent.tickets.directory`（絶対パスまたはワークスペース相対） */
  configured: string;
  workspaceRoot: string | null;
  /** ワークスペースルート直下に `.tickets/` が実在するか */
  workspaceHasTicketsDir: boolean;
  /** 環境変数 `ANYTIME_TICKETS_DIR` */
  envDir: string | undefined;
}

/**
 * チケットリポジトリのルートを解決する。
 *
 * 優先順位は anytime-loop-start スキルの規則に揃える（同じチケット実体を
 * ループとボードで別々に解決すると、片方だけ別リポジトリを見て食い違う）:
 *   1. VS Code 設定 `anytimeAgent.tickets.directory`
 *   2. ワークスペースルートの `.tickets/`
 *   3. 環境変数 `ANYTIME_TICKETS_DIR`
 *
 * 設定値は「クローンのルート」でも「`.tickets/` ディレクトリ自体」でもよい。
 * 後者の場合は git 操作の基点が変わるため、親をリポジトリルートとして返す。
 *
 * Why not: ワークスペース自身の origin から推定しない。チケットは別リポジトリ
 * （例: anytime-ticket）に置かれる運用であり、ワークスペース（例: anytime-markdown）の
 * remote を見ると存在しない `.tickets/` を探しに行く。
 */
export function resolveTicketsRepoRoot(inputs: TicketsDirectoryInputs): string | null {
  const raw = pickTicketsDirectory(inputs);
  if (raw === null) {
    return null;
  }
  const absolute = path.isAbsolute(raw)
    ? raw
    : inputs.workspaceRoot
      ? path.resolve(inputs.workspaceRoot, raw)
      : null;
  if (absolute === null) {
    return null;
  }
  // `.tickets` 自体を指された場合、git 操作の基点はその親。
  return path.basename(absolute) === '.tickets' ? path.dirname(absolute) : absolute;
}

function pickTicketsDirectory(inputs: TicketsDirectoryInputs): string | null {
  const configured = inputs.configured.trim();
  if (configured !== '') {
    return configured;
  }
  if (inputs.workspaceHasTicketsDir && inputs.workspaceRoot !== null) {
    return inputs.workspaceRoot;
  }
  const env = inputs.envDir?.trim();
  return env !== undefined && env !== '' ? env : null;
}

export function readTicketsDirectorySetting(): string {
  return vscode.workspace.getConfiguration('anytimeAgent.tickets').get<string>('directory') ?? '';
}
