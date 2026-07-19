import {
  archiveTicket,
  createTicket,
  deleteTicket,
  getTicket,
  listTickets,
  updateTicketContent,
  type CreateTicketInput,
  type InvalidTicketFile,
  type TicketFile,
  type TicketRepositoryConfig,
} from './ticketRepository';
import type {
  ArchiveTicketRecordInput,
  DeleteTicketRecordInput,
  GitHubContentsProviderConfig,
  InvalidTicketRecord,
  TicketProvider,
  TicketProviderListResult,
  TicketRecord,
  UpdateTicketRecordInput,
} from './ticketProvider';

function toRecord(file: TicketFile): TicketRecord {
  return {
    path: file.path,
    version: file.sha,
    frontmatter: file.frontmatter,
    extras: file.extras,
    body: file.body,
    archived: file.archived,
  };
}

function toInvalidRecord(file: InvalidTicketFile): InvalidTicketRecord {
  return { path: file.path, version: file.sha, reason: file.reason };
}

/**
 * GitHub Contents API（`.tickets/*.md`）を正本とする既定プロバイダ。
 * 既存の ticketRepository 関数群へ委譲し、`sha` を不透明 `version` トークンへ写像する。
 */
export class GitHubContentsProvider implements TicketProvider {
  readonly kind = 'github-contents' as const;

  private readonly config: TicketRepositoryConfig;

  constructor(config: GitHubContentsProviderConfig) {
    this.config = {
      token: config.token,
      repo: config.repo,
      branch: config.branch,
      fetchFn: config.fetchFn,
      apiBaseUrl: config.apiBaseUrl,
    };
  }

  async list(options?: { includeArchive?: boolean }): Promise<TicketProviderListResult> {
    const result = await listTickets({ ...this.config, includeArchive: options?.includeArchive });
    return { tickets: result.tickets.map(toRecord), invalid: result.invalid.map(toInvalidRecord) };
  }

  async get(path: string): Promise<TicketRecord | InvalidTicketRecord> {
    const result = await getTicket({ ...this.config, path });
    return 'frontmatter' in result ? toRecord(result) : toInvalidRecord(result);
  }

  async create(input: CreateTicketInput): Promise<TicketRecord> {
    return toRecord(await createTicket({ ...this.config, input }));
  }

  async update(input: UpdateTicketRecordInput): Promise<{ path: string; version: string; commitId?: string }> {
    const result = await updateTicketContent({
      ...this.config,
      input: { path: input.path, content: input.content, sha: input.version, message: input.message },
    });
    return { path: result.path, version: result.sha, commitId: result.commitSha };
  }

  async remove(input: DeleteTicketRecordInput): Promise<void> {
    await deleteTicket({
      ...this.config,
      input: { path: input.path, sha: input.version, message: input.message },
    });
  }

  async archive(input: ArchiveTicketRecordInput): Promise<{ newPath: string }> {
    return archiveTicket({
      ...this.config,
      input: { path: input.path, sha: input.version, message: input.message },
    });
  }
}
