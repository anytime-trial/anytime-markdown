import {
  buildTicketBody,
  nextTicketId,
  parseTicketMarkdown,
  serializeTicket,
  validateTicketFrontmatter,
  type TicketFrontmatter,
} from './ticketModel';
import { TicketApiError, TicketConflictError, type CreateTicketInput } from './ticketRepository';
import type {
  ArchiveTicketRecordInput,
  DeleteTicketRecordInput,
  GitHubIssuesProviderConfig,
  InvalidTicketRecord,
  TicketProvider,
  TicketProviderListResult,
  TicketRecord,
  UpdateTicketRecordInput,
} from './ticketProvider';

/** 管理対象マーカー。resolve-issues 系（Dependabot / CodeQL 等の外部課題）と名前空間を分離する */
const TICKET_LABEL = 'ticket';
/** remove（REST では issue を削除できない）の代用: close + 本ラベルで一覧から恒久除外する */
const DELETED_LABEL = 'ticket:deleted';

const DEFAULT_API_BASE = 'https://api.github.com';
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const ISSUE_PATH_RE = /^issues\/(\d+)$/;
const PER_PAGE = 100;

interface IssueLabel {
  name?: string;
}

interface IssueJson {
  number: number;
  state: 'open' | 'closed';
  title: string;
  body?: string | null;
  updated_at: string;
  labels?: (IssueLabel | string)[];
  pull_request?: unknown;
}

function labelNames(issue: IssueJson): string[] {
  return (issue.labels ?? []).map((label) => (typeof label === 'string' ? label : (label.name ?? '')));
}

/** frontmatter が正本・ラベルは閲覧用ミラー（status / priority / workspace / assignee） */
function buildMirrorLabels(frontmatter: TicketFrontmatter): string[] {
  const labels = [TICKET_LABEL, `status:${frontmatter.status}`, `priority:${frontmatter.priority}`];
  if (frontmatter.workspace !== undefined) {
    labels.push(`workspace:${frontmatter.workspace}`);
  }
  if (frontmatter.assignee !== undefined) {
    labels.push(`assignee:${frontmatter.assignee}`);
  }
  return labels;
}

function issuePath(issueNumber: number): string {
  return `issues/${issueNumber}`;
}

function parseIssuePath(path: string): number {
  const match = ISSUE_PATH_RE.exec(path);
  if (!match) {
    throw new TicketApiError(400, `Issues プロバイダのチケットパスとして不正です: ${path}`);
  }
  return Number(match[1]);
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { message?: string };
    return json.message ?? res.statusText;
  } catch (error) {
    return `${res.statusText}（本文解析不可: ${String(error)}）`;
  }
}

function parseIssueTicket(issue: IssueJson): TicketRecord | InvalidTicketRecord {
  const path = issuePath(issue.number);
  const version = issue.updated_at;
  const parsed = parseTicketMarkdown(issue.body ?? '');
  if (!parsed) {
    return { path, version, reason: 'フロントマターがありません' };
  }
  const result = validateTicketFrontmatter(parsed.frontmatter);
  if (!result.ok) {
    return { path, version, reason: result.errors.join(' / ') };
  }
  return {
    path,
    version,
    frontmatter: result.value,
    extras: result.extras,
    body: parsed.body,
    archived: issue.state === 'closed',
  };
}

function isRecord(entry: TicketRecord | InvalidTicketRecord): entry is TicketRecord {
  return 'frontmatter' in entry;
}

/**
 * GitHub Issues を正本ストアとする第 2 実装（RFC 詳細設計 2。抽象境界の実証用）。
 *
 * - issue body = チケット Markdown 全文（frontmatter 込み。ticketModel を全面再利用し、frontmatter が正本）
 * - `version` = issue の `updated_at`。Issues API に compare-and-swap が無いため、
 *   書き込みは「取得 → version 比較 → PATCH」の check-then-act で楽観ロック相当を実装する（NFR-7）
 * - `remove` は close + `ticket:deleted` ラベル（REST では削除不可）、`archive` は close
 */
export class GitHubIssuesProvider implements TicketProvider {
  readonly kind = 'github-issues' as const;

  private readonly token: string;

  private readonly repo: string;

  private readonly fetchFn: typeof fetch;

  private readonly apiBaseUrl: string;

  constructor(config: GitHubIssuesProviderConfig) {
    if (!REPO_RE.test(config.repo)) {
      throw new TicketApiError(400, `リポジトリ名として不正です: ${config.repo}`);
    }
    this.token = config.token;
    this.repo = config.repo;
    // Workers(workerd)の fetch は this ブランドチェックを持つため常にアロー包みで this 非依存にする
    const rawFetch = config.fetchFn ?? fetch;
    this.fetchFn = (...args: Parameters<typeof fetch>) => rawFetch(...args);
    this.apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      // GitHub API は User-Agent 必須（Workers は自動付与しない）
      'User-Agent': 'anytime-markdown-tickets-core',
    };
  }

  private issuesUrl(suffix: string): string {
    return `${this.apiBaseUrl}/repos/${this.repo}/issues${suffix}`;
  }

  private async request(url: string, init?: RequestInit): Promise<Response> {
    const res = await this.fetchFn(url, {
      ...init,
      headers: { ...this.headers(), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    if (!res.ok) {
      throw new TicketApiError(res.status, await readErrorMessage(res));
    }
    return res;
  }

  /** `ticket` ラベル付き issue を全ページ取得する（PR は issues エンドポイントに混ざるため除外） */
  private async listManagedIssues(state: 'open' | 'closed' | 'all'): Promise<IssueJson[]> {
    const issues: IssueJson[] = [];
    for (let page = 1; ; page += 1) {
      const res = await this.request(
        this.issuesUrl(`?labels=${TICKET_LABEL}&state=${state}&per_page=${PER_PAGE}&page=${page}`),
      );
      const json = (await res.json()) as IssueJson[];
      issues.push(...json.filter((issue) => issue.pull_request === undefined));
      if (json.length < PER_PAGE) {
        return issues;
      }
    }
  }

  private async fetchIssue(issueNumber: number): Promise<IssueJson> {
    const res = await this.request(this.issuesUrl(`/${issueNumber}`));
    const issue = (await res.json()) as IssueJson;
    this.assertManagedIssue(issue);
    return issue;
  }

  /**
   * 管理対象（`ticket` ラベル付き・PR でない・削除済みでない）以外への読み書きを拒否する。
   * これが無いと update / remove / archive が同リポジトリの任意の issue / PR を改変・close できてしまう。
   */
  private assertManagedIssue(issue: IssueJson): void {
    const labels = labelNames(issue);
    if (issue.pull_request !== undefined || !labels.includes(TICKET_LABEL) || labels.includes(DELETED_LABEL)) {
      throw new TicketApiError(404, `チケットとして管理されていない issue です: issues/${issue.number}`);
    }
  }

  /**
   * 書き込み前の楽観ロック相当（NFR-7）。
   * SHORTCUT: version 比較は取得→PATCH の check-then-act. ceiling: 比較と更新の間に他者更新が入る TOCTOU 窓が残る(Issues API に compare-and-swap が無い). upgrade: GitHub API が条件付き更新(If-Match 等)を提供したら移行.
   */
  private async assertVersion(issueNumber: number, version: string): Promise<IssueJson> {
    const issue = await this.fetchIssue(issueNumber);
    if (issue.updated_at !== version) {
      throw new TicketConflictError(
        409,
        `他の更新が先行しました: issues/${issueNumber} は表示時点から変更されています。再読込してください`,
      );
    }
    return issue;
  }

  async list(options?: { includeArchive?: boolean }): Promise<TicketProviderListResult> {
    const issues = await this.listManagedIssues(options?.includeArchive ? 'all' : 'open');
    const tickets: TicketRecord[] = [];
    const invalid: InvalidTicketRecord[] = [];
    for (const issue of issues) {
      if (labelNames(issue).includes(DELETED_LABEL)) {
        continue;
      }
      const entry = parseIssueTicket(issue);
      if (isRecord(entry)) {
        tickets.push(entry);
      } else {
        invalid.push(entry);
      }
    }
    return { tickets, invalid };
  }

  async get(path: string): Promise<TicketRecord | InvalidTicketRecord> {
    const issue = await this.fetchIssue(parseIssuePath(path));
    return parseIssueTicket(issue);
  }

  async create(input: CreateTicketInput): Promise<TicketRecord> {
    // id は Contents 実装と同じ frontmatter 走査による T-<n> 採番を維持する
    // （issue number 採番にするとプロバイダ間で id 形式・dependencies 参照が非互換になる）
    const existing = await this.listManagedIssues('all');
    const ids = existing
      .map((issue) => parseIssueTicket(issue))
      .filter(isRecord)
      .map((record) => record.frontmatter.id);
    const id = nextTicketId(ids);
    const frontmatter: TicketFrontmatter = {
      id,
      title: input.title,
      status: input.status,
      priority: input.priority,
      created_at: input.now,
      updated_at: input.now,
    };
    if (input.assignee !== undefined) frontmatter.assignee = input.assignee;
    if (input.creator !== undefined) frontmatter.creator = input.creator;
    if (input.workspace !== undefined) frontmatter.workspace = input.workspace;
    if (input.dependencies !== undefined) frontmatter.dependencies = input.dependencies;
    if (input.estimate !== undefined) frontmatter.estimate = input.estimate;
    const validated = validateTicketFrontmatter(frontmatter as unknown as Record<string, unknown>);
    if (!validated.ok) {
      throw new TicketApiError(400, `入力が不正です: ${validated.errors.join(' / ')}`);
    }
    const body = buildTicketBody(input.description ?? '');
    const res = await this.request(this.issuesUrl(''), {
      method: 'POST',
      body: JSON.stringify({
        // タイトルにはファイル名相当（id + slug）でなく表題そのままを使い、id は frontmatter が持つ
        title: input.title,
        body: serializeTicket(frontmatter, body),
        labels: buildMirrorLabels(frontmatter),
      }),
    });
    const created = (await res.json()) as IssueJson;
    await this.guardDuplicateId(id, created);
    return {
      path: issuePath(created.number),
      version: created.updated_at,
      frontmatter,
      extras: {},
      body,
      archived: false,
    };
  }

  /**
   * 採番→POST の間に他者が同じ id で作成した競合を事後検出する（Contents 実装の guardDuplicateId と対称）。
   * REST では issue を削除できないため、巻き戻しは close + `ticket:deleted` で行う。
   */
  private async guardDuplicateId(id: string, created: IssueJson): Promise<void> {
    const issues = await this.listManagedIssues('all');
    const duplicated = issues.some((issue) => {
      if (issue.number === created.number || labelNames(issue).includes(DELETED_LABEL)) {
        return false;
      }
      const entry = parseIssueTicket(issue);
      return isRecord(entry) && entry.frontmatter.id === id;
    });
    if (!duplicated) {
      return;
    }
    await this.request(this.issuesUrl(`/${created.number}`), {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', labels: [TICKET_LABEL, DELETED_LABEL] }),
    });
    throw new TicketConflictError(
      409,
      `同時作成により id ${id} が重複したため巻き戻しました。再試行してください`,
    );
  }

  async update(input: UpdateTicketRecordInput): Promise<{ path: string; version: string; commitId?: string }> {
    const issueNumber = parseIssuePath(input.path);
    const parsed = parseTicketMarkdown(input.content);
    if (!parsed) {
      throw new TicketApiError(400, '更新内容にフロントマターがありません');
    }
    const validated = validateTicketFrontmatter(parsed.frontmatter);
    if (!validated.ok) {
      throw new TicketApiError(400, `更新内容が不正です: ${validated.errors.join(' / ')}`);
    }
    await this.assertVersion(issueNumber, input.version);
    const res = await this.request(this.issuesUrl(`/${issueNumber}`), {
      method: 'PATCH',
      body: JSON.stringify({
        title: validated.value.title,
        body: input.content,
        labels: buildMirrorLabels(validated.value),
      }),
    });
    const updated = (await res.json()) as IssueJson;
    return { path: input.path, version: updated.updated_at };
  }

  async remove(input: DeleteTicketRecordInput): Promise<void> {
    const issueNumber = parseIssuePath(input.path);
    await this.assertVersion(issueNumber, input.version);
    await this.request(this.issuesUrl(`/${issueNumber}`), {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', labels: [TICKET_LABEL, DELETED_LABEL] }),
    });
  }

  async archive(input: ArchiveTicketRecordInput): Promise<{ newPath: string }> {
    const issueNumber = parseIssuePath(input.path);
    const issue = await this.assertVersion(issueNumber, input.version);
    if (issue.state === 'closed') {
      throw new TicketApiError(400, 'すでにアーカイブ済みです');
    }
    await this.request(this.issuesUrl(`/${issueNumber}`), {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
    return { newPath: input.path };
  }
}
