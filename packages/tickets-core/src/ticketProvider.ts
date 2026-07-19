import type { FrontmatterValue, TicketFrontmatter } from './ticketModel';
import type { CreateTicketInput } from './ticketRepository';
import { GitHubContentsProvider } from './githubContentsProvider';
import { GitHubIssuesProvider } from './githubIssuesProvider';

/**
 * チケット正本ストアのプロバイダ抽象（要件 UR-10 / NFR-7）。
 * `version` は不透明な楽観ロックトークンで、実体はプロバイダ依存
 * （GitHub Contents: blob sha / GitHub Issues: updated_at）。呼び出し側は中身を解釈しない。
 */
export interface TicketRecord {
  path: string;
  /** 楽観ロックトークン（必須・不透明）。update / remove / archive に往復させる */
  version: string;
  frontmatter: TicketFrontmatter;
  extras: Record<string, FrontmatterValue>;
  body: string;
  archived: boolean;
}

export interface InvalidTicketRecord {
  path: string;
  version: string;
  reason: string;
}

export interface TicketProviderListResult {
  tickets: TicketRecord[];
  invalid: InvalidTicketRecord[];
}

export interface UpdateTicketRecordInput {
  path: string;
  /** 直列化済みのチケット Markdown 全文 */
  content: string;
  version: string;
  message: string;
}

export interface DeleteTicketRecordInput {
  path: string;
  version: string;
  message?: string;
}

export interface ArchiveTicketRecordInput {
  path: string;
  version: string;
  message?: string;
}

export interface TicketProvider {
  readonly kind: TicketProviderKind;
  list(options?: { includeArchive?: boolean }): Promise<TicketProviderListResult>;
  get(path: string): Promise<TicketRecord | InvalidTicketRecord>;
  create(input: CreateTicketInput): Promise<TicketRecord>;
  update(input: UpdateTicketRecordInput): Promise<{ path: string; version: string; commitId?: string }>;
  remove(input: DeleteTicketRecordInput): Promise<void>;
  archive(input: ArchiveTicketRecordInput): Promise<{ newPath: string }>;
}

export const TICKET_PROVIDER_KINDS = ['github-contents', 'github-issues'] as const;
export type TicketProviderKind = (typeof TICKET_PROVIDER_KINDS)[number];

export function isTicketProviderKind(value: unknown): value is TicketProviderKind {
  return typeof value === 'string' && (TICKET_PROVIDER_KINDS as readonly string[]).includes(value);
}

export interface GitHubContentsProviderConfig {
  provider: 'github-contents';
  token: string;
  /** `owner/repo` 形式 */
  repo: string;
  branch: string;
  fetchFn?: typeof fetch;
  apiBaseUrl?: string;
}

export interface GitHubIssuesProviderConfig {
  provider: 'github-issues';
  token: string;
  /** `owner/repo` 形式 */
  repo: string;
  fetchFn?: typeof fetch;
  apiBaseUrl?: string;
}

export type TicketProviderConfig = GitHubContentsProviderConfig | GitHubIssuesProviderConfig;

const DEFAULT_PROVIDER_API_BASE = 'https://api.github.com';

/**
 * プロバイダが到達する API ホスト（SSRF 許可リストの合成用。要件 NFR-5 / RFC 詳細設計 3）。
 * プロバイダ追加時は本関数がホストを供給するため、許可リスト側の変更漏れが起こらない。
 */
export function providerAllowedHosts(config: TicketProviderConfig): string[] {
  return [new URL(config.apiBaseUrl ?? DEFAULT_PROVIDER_API_BASE).host];
}

/** 種別ごとの既定ホスト（config なしで許可リストを静的合成する用途。現状は全種別 GitHub API） */
export function providerDefaultHosts(_kind: TicketProviderKind): string[] {
  return [new URL(DEFAULT_PROVIDER_API_BASE).host];
}

export function createTicketProvider(config: TicketProviderConfig): TicketProvider {
  switch (config.provider) {
    case 'github-contents':
      return new GitHubContentsProvider(config);
    case 'github-issues':
      return new GitHubIssuesProvider(config);
    default: {
      const exhaustive: never = config;
      throw new Error(`未知のチケットプロバイダです: ${JSON.stringify(exhaustive)}`);
    }
  }
}
