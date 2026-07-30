import * as path from 'node:path';
import * as vscode from 'vscode';
import { isTicketProviderKind, type TicketProviderKind } from '@anytime-markdown/tickets-core';

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

/** ローカルクローンの `.tickets/` を直接読み書きする対象。GitHub 認証を必要としない。 */
export interface LocalGitTicketSource {
  provider: 'local-git';
  /** チケットリポジトリのローカルクローンのルート */
  repoRoot: string;
}

/** GitHub API 経由で読み書きする対象。アクセストークンを必要とする。 */
export interface GitHubTicketSource {
  provider: 'github-contents' | 'github-issues';
  repo: string;
  branch: string;
}

/**
 * チケットの取得先。
 *
 * provider による判別共用体にしているのは、必要な情報が排他的なため
 * （local-git はローカルパスだけ、GitHub は repo/branch だけを持つ）。
 * 片方の形に寄せて未使用フィールドを空文字で埋めると、認証が要る経路と
 * 要らない経路の区別が型から消える。
 */
export type TicketSource = LocalGitTicketSource | GitHubTicketSource;

export interface GitFacts {
  remoteUrl: string | null;
  branch: string | null;
}

/**
 * 設定 → git 実測の順で対象を解決する。解決できなければ null（呼び出し側が設定を促す）。
 *
 * local-git はローカルクローンのルートだけを見る（remote 名やブランチ名に依存しない。
 * remote 未設定のクローンでもボードは開ける）。
 */
export function resolveTicketSource(
  config: { repo: string; branch: string; provider: TicketProviderKind },
  git: GitFacts,
  repoRoot: string | null,
): TicketSource | null {
  if (config.provider === 'local-git') {
    return repoRoot === null ? null : { provider: 'local-git', repoRoot };
  }
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

/** 既定のプロバイダ。GitHub 認証を必要とせず、ローカルクローンだけで完結する。 */
export const DEFAULT_TICKET_PROVIDER: TicketProviderKind = 'local-git';

/**
 * 新旧 2 つのプロバイダ設定キーから実際に使う種別を決める。
 *
 * `anytimeAgent.tickets.github.provider` は local-git を含まない名前になったため
 * `anytimeAgent.tickets.provider` へ移した。旧キーを明示的に設定していた利用者の
 * 設定を黙って無効化しないよう、新キーが未設定のときに限り旧キーを採用する。
 * どちらも未設定なら既定（local-git）。
 */
export function pickProviderKind(explicit: {
  provider: TicketProviderKind | undefined;
  legacyProvider: TicketProviderKind | undefined;
  /** 旧 GitHub 経路の設定 `anytimeAgent.tickets.github.repo` が明示されているか */
  hasLegacyRepo: boolean;
}): { kind: TicketProviderKind; usedLegacy: boolean } {
  if (explicit.provider !== undefined) {
    return { kind: explicit.provider, usedLegacy: false };
  }
  if (explicit.legacyProvider !== undefined) {
    return { kind: explicit.legacyProvider, usedLegacy: true };
  }
  // 旧既定（github-contents）に任せて repo だけ設定していた利用者を、既定変更で
  // 無言の機能停止に落とさない。repo の明示は GitHub 経路を使っていた証拠として扱う。
  if (explicit.hasLegacyRepo) {
    return { kind: 'github-contents', usedLegacy: true };
  }
  return { kind: DEFAULT_TICKET_PROVIDER, usedLegacy: false };
}

/**
 * 設定が「明示的に指定されている」場合だけ値を返す。
 * `get()` は package.json の既定値を返すため、未設定と既定値どおりの指定を区別できない。
 */
function readExplicit<T>(section: vscode.WorkspaceConfiguration, key: string): T | undefined {
  const inspected = section.inspect<T>(key);
  return (
    inspected?.workspaceFolderValue ?? inspected?.workspaceValue ?? inspected?.globalValue ?? undefined
  );
}

/**
 * 設定値をプロバイダ種別として検証する。
 *
 * package.json の enum は設定 UI を絞るだけで、手書きの settings.json には任意の文字列が
 * 入る。未検証のままキャストすると、綴り間違い（例 "github"）がどの分岐にも当たらず
 * 無言で別のプロバイダとして解決され、利用者は違う場所のチケットを見ることになる。
 */
function readProviderKind(
  section: vscode.WorkspaceConfiguration,
  key: string,
  onInvalid: (value: string) => void,
): TicketProviderKind | undefined {
  const raw = readExplicit<unknown>(section, key);
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== 'string' || !isTicketProviderKind(raw)) {
    onInvalid(String(raw));
    return undefined;
  }
  return raw;
}

export function readTicketConfig(): {
  repo: string;
  branch: string;
  provider: TicketProviderKind;
  /** 旧キー（`...github.*`）由来で種別を決めたか。呼び出し側が移行を促すために使う */
  usedLegacyProviderKey: boolean;
  /** 不正な設定値。呼び出し側が warn ログへ出す（黙って既定へ倒さない） */
  invalidProviderValues: string[];
} {
  const tickets = vscode.workspace.getConfiguration('anytimeAgent.tickets');
  const github = vscode.workspace.getConfiguration('anytimeAgent.tickets.github');
  const invalidProviderValues: string[] = [];
  const onInvalid = (value: string): void => void invalidProviderValues.push(value);
  const picked = pickProviderKind({
    provider: readProviderKind(tickets, 'provider', onInvalid),
    legacyProvider: readProviderKind(github, 'provider', onInvalid),
    hasLegacyRepo: (readExplicit<string>(github, 'repo') ?? '').trim() !== '',
  });
  return {
    repo: github.get<string>('repo') ?? '',
    branch: github.get<string>('branch') ?? '',
    provider: picked.kind,
    usedLegacyProviderKey: picked.usedLegacy,
    invalidProviderValues,
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
