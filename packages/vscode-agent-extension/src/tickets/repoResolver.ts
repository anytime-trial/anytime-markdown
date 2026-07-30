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
