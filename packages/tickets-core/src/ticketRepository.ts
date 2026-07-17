import {
  buildTicketBody,
  nextTicketId,
  parseTicketMarkdown,
  serializeTicket,
  ticketFileName,
  validateTicketFrontmatter,
  type FrontmatterValue,
  type TicketFrontmatter,
  type TicketAssignee,
  type TicketPriority,
  type TicketStatus,
  type TicketWorkspace,
} from './ticketModel';

/**
 * GitHub Contents API を正本とするチケットリポジトリ操作（サーバー専用）。
 * fetch は注入可能にし、web-app 側のリトライ付き fetch / テストのモックを受け入れる。
 */
export interface TicketRepositoryConfig {
  token: string;
  /** `owner/repo` 形式 */
  repo: string;
  branch: string;
  fetchFn?: typeof fetch;
  apiBaseUrl?: string;
}

export interface TicketFile {
  path: string;
  sha: string;
  frontmatter: TicketFrontmatter;
  extras: Record<string, FrontmatterValue>;
  body: string;
  archived: boolean;
}

export interface InvalidTicketFile {
  path: string;
  sha: string;
  reason: string;
}

export interface TicketListResult {
  tickets: TicketFile[];
  invalid: InvalidTicketFile[];
}

export class TicketApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'TicketApiError';
    this.status = status;
  }
}

/** sha 楽観ロックの競合（他の更新が先行）を表す。 */
export class TicketConflictError extends TicketApiError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = 'TicketConflictError';
  }
}

export const TICKETS_DIR = '.tickets';
export const TICKETS_ARCHIVE_DIR = '.tickets/archive';

const TICKET_PATH_RE = /^\.tickets\/(?:archive\/)?[A-Za-z0-9._-]+\.md$/;
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const DEFAULT_API_BASE = 'https://api.github.com';
const FETCH_CHUNK_SIZE = 10;

/** チケットパス以外（トラバーサル・領域外・非 md）を拒否する。 */
export function assertTicketPath(path: string): void {
  if (!TICKET_PATH_RE.test(path) || path.includes('..')) {
    throw new TicketApiError(400, `チケットパスとして不正です: ${path}`);
  }
}

interface GitHubContext {
  token: string;
  repo: string;
  branch: string;
  fetchFn: typeof fetch;
  apiBaseUrl: string;
}

function toContext(config: TicketRepositoryConfig): GitHubContext {
  if (!REPO_RE.test(config.repo)) {
    throw new TicketApiError(400, `リポジトリ名として不正です: ${config.repo}`);
  }
  return {
    token: config.token,
    repo: config.repo,
    branch: config.branch,
    fetchFn: config.fetchFn ?? fetch,
    apiBaseUrl: config.apiBaseUrl ?? DEFAULT_API_BASE,
  };
}

function contentsUrl(ctx: GitHubContext, path: string, withRef: boolean): string {
  const ref = withRef ? `?ref=${encodeURIComponent(ctx.branch)}` : '';
  return `${ctx.apiBaseUrl}/repos/${ctx.repo}/contents/${encodeURIComponent(path)}${ref}`;
}

function baseHeaders(ctx: GitHubContext): Record<string, string> {
  return {
    Authorization: `Bearer ${ctx.token}`,
    Accept: 'application/vnd.github+json',
  };
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { message?: string };
    return json.message ?? res.statusText;
  } catch (error) {
    return `${res.statusText}（本文解析不可: ${String(error)}）`;
  }
}

async function throwApiError(res: Response): Promise<never> {
  const message = await readErrorMessage(res);
  if (res.status === 409 || res.status === 422) {
    throw new TicketConflictError(res.status, `他の更新が先行しました: ${message}`);
  }
  throw new TicketApiError(res.status, message);
}

interface DirEntry {
  name: string;
  path: string;
  sha: string;
  type: string;
}

/** ディレクトリ一覧。存在しない（404）は空配列。 */
async function listDir(ctx: GitHubContext, dir: string): Promise<DirEntry[]> {
  const res = await ctx.fetchFn(contentsUrl(ctx, dir, true), { headers: baseHeaders(ctx) });
  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    return throwApiError(res);
  }
  const json = (await res.json()) as DirEntry[] | DirEntry;
  if (!Array.isArray(json)) {
    throw new TicketApiError(500, `${dir} はディレクトリではありません`);
  }
  return json.filter((entry) => entry.type === 'file' && entry.name.endsWith('.md'));
}

interface RawFile {
  sha: string;
  text: string;
}

async function fetchFile(ctx: GitHubContext, path: string): Promise<RawFile> {
  const res = await ctx.fetchFn(contentsUrl(ctx, path, true), { headers: baseHeaders(ctx) });
  if (!res.ok) {
    return throwApiError(res);
  }
  const json = (await res.json()) as { content?: string; sha: string };
  const text = Buffer.from((json.content ?? '').replaceAll('\n', ''), 'base64').toString('utf8');
  return { sha: json.sha, text };
}

async function mapInChunks<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += FETCH_CHUNK_SIZE) {
    const chunk = items.slice(i, i + FETCH_CHUNK_SIZE);
    results.push(...(await Promise.all(chunk.map((item) => fn(item)))));
  }
  return results;
}

function parseTicketFile(path: string, sha: string, text: string, archived: boolean): TicketFile | InvalidTicketFile {
  const parsed = parseTicketMarkdown(text);
  if (!parsed) {
    return { path, sha, reason: 'フロントマターがありません' };
  }
  const result = validateTicketFrontmatter(parsed.frontmatter);
  if (!result.ok) {
    return { path, sha, reason: result.errors.join(' / ') };
  }
  return { path, sha, frontmatter: result.value, extras: result.extras, body: parsed.body, archived };
}

function isTicketFile(entry: TicketFile | InvalidTicketFile): entry is TicketFile {
  return 'frontmatter' in entry;
}

/** `.tickets/`（および任意で `archive/`）を一括取得し、解析済みチケットと要修復ファイルに分離する。 */
export async function listTickets(
  config: TicketRepositoryConfig & { includeArchive?: boolean },
): Promise<TicketListResult> {
  const ctx = toContext(config);
  const dirs: { dir: string; archived: boolean }[] = [{ dir: TICKETS_DIR, archived: false }];
  if (config.includeArchive) {
    dirs.push({ dir: TICKETS_ARCHIVE_DIR, archived: true });
  }
  const tickets: TicketFile[] = [];
  const invalid: InvalidTicketFile[] = [];
  for (const { dir, archived } of dirs) {
    const entries = await listDir(ctx, dir);
    const parsed = await mapInChunks(entries, async (entry) => {
      try {
        const file = await fetchFile(ctx, entry.path);
        return parseTicketFile(entry.path, file.sha, file.text, archived);
      } catch (error) {
        return { path: entry.path, sha: entry.sha, reason: `取得に失敗しました: ${String(error)}` };
      }
    });
    for (const item of parsed) {
      if (isTicketFile(item)) {
        tickets.push(item);
      } else {
        invalid.push(item);
      }
    }
  }
  return { tickets, invalid };
}

/** 1 ファイルを取得して解析する（詳細再読込・最新 sha 取得用）。 */
export async function getTicket(
  config: TicketRepositoryConfig & { path: string },
): Promise<TicketFile | InvalidTicketFile> {
  assertTicketPath(config.path);
  const ctx = toContext(config);
  const file = await fetchFile(ctx, config.path);
  return parseTicketFile(config.path, file.sha, file.text, config.path.startsWith(`${TICKETS_ARCHIVE_DIR}/`));
}

interface PutResponse {
  content: { path: string; sha: string };
  commit: { sha: string };
}

async function putFile(
  ctx: GitHubContext,
  input: { path: string; text: string; message: string; sha?: string },
): Promise<PutResponse> {
  const body: Record<string, unknown> = {
    message: input.message,
    content: Buffer.from(input.text, 'utf8').toString('base64'),
    branch: ctx.branch,
  };
  if (input.sha) {
    body.sha = input.sha;
  }
  const res = await ctx.fetchFn(contentsUrl(ctx, input.path, false), {
    method: 'PUT',
    headers: { ...baseHeaders(ctx), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return throwApiError(res);
  }
  return (await res.json()) as PutResponse;
}

async function deleteFile(
  ctx: GitHubContext,
  input: { path: string; sha: string; message: string },
): Promise<void> {
  const res = await ctx.fetchFn(contentsUrl(ctx, input.path, false), {
    method: "DELETE",
    headers: { ...baseHeaders(ctx), "Content-Type": "application/json" },
    body: JSON.stringify({ message: input.message, sha: input.sha, branch: ctx.branch }),
  });
  if (!res.ok) {
    return throwApiError(res);
  }
}

export interface CreateTicketInput {
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee?: TicketAssignee;
  workspace?: TicketWorkspace;
  creator?: string;
  dependencies?: string[];
  /** 予定工数（分） */
  estimate?: number;
  description?: string;
  /** ISO 8601 UTC。created_at / updated_at に設定する */
  now: string;
  message?: string;
}

function collectIdsFromNames(entries: DirEntry[]): string[] {
  const ids: string[] = [];
  for (const entry of entries) {
    const match = /^(T-\d+)-/.exec(entry.name);
    if (match) {
      ids.push(match[1]);
    }
  }
  return ids;
}

/** 既存ファイル名（archive 含む）から自動採番し、テンプレート本文付きで新規チケットを作成する。 */
export async function createTicket(
  config: TicketRepositoryConfig & { input: CreateTicketInput },
): Promise<TicketFile> {
  const ctx = toContext(config);
  const { input } = config;
  const [active, archived] = await Promise.all([
    listDir(ctx, TICKETS_DIR),
    listDir(ctx, TICKETS_ARCHIVE_DIR),
  ]);
  const id = nextTicketId(collectIdsFromNames([...active, ...archived]));
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
  const path = `${TICKETS_DIR}/${ticketFileName(id, input.title)}`;
  assertTicketPath(path);
  const res = await putFile(ctx, {
    path,
    text: serializeTicket(frontmatter, body),
    message: input.message ?? `ticket: create ${id} ${input.title}`,
  });
  await guardDuplicateId(ctx, id, res.content.path, res.content.sha);
  return { path: res.content.path, sha: res.content.sha, frontmatter, extras: {}, body, archived: false };
}

/**
 * 採番→PUT の間に他者が同じ id で作成した競合（slug が違うとパス衝突しない）を事後検出する。
 * 重複を見つけたら自分の作成分を巻き戻して TicketConflictError を投げる（双方が巻き戻しても
 * 重複が残るよりよい。利用者は再試行すれば次の採番で成功する）。
 */
async function guardDuplicateId(
  ctx: GitHubContext,
  id: string,
  createdPath: string,
  createdSha: string,
): Promise<void> {
  const [active, archived] = await Promise.all([
    listDir(ctx, TICKETS_DIR),
    listDir(ctx, TICKETS_ARCHIVE_DIR),
  ]);
  const duplicates = [...active, ...archived].filter(
    (entry) => entry.name.startsWith(`${id}-`) && entry.path !== createdPath,
  );
  if (duplicates.length === 0) {
    return;
  }
  await deleteFile(ctx, {
    path: createdPath,
    sha: createdSha,
    message: `ticket: rollback duplicate ${id}`,
  });
  throw new TicketConflictError(
    409,
    `同時作成により id ${id} が重複したため巻き戻しました。再試行してください`,
  );
}

export interface UpdateTicketInput {
  path: string;
  /** 直列化済みのチケット Markdown 全文 */
  content: string;
  /** 楽観ロック用の既知 sha（必須） */
  sha: string;
  message: string;
}

/** sha 楽観ロック付きでチケットファイルを更新する。競合は TicketConflictError。 */
export async function updateTicketContent(
  config: TicketRepositoryConfig & { input: UpdateTicketInput },
): Promise<{ path: string; sha: string; commitSha: string }> {
  assertTicketPath(config.input.path);
  const ctx = toContext(config);
  const res = await putFile(ctx, {
    path: config.input.path,
    text: config.input.content,
    message: config.input.message,
    sha: config.input.sha,
  });
  return { path: res.content.path, sha: res.content.sha, commitSha: res.commit.sha };
}

export interface DeleteTicketInput {
  path: string;
  /** 楽観ロック用の既知 sha（必須）。他の更新が先行していれば TicketConflictError */
  sha: string;
  message?: string;
}

/** チケットファイルを削除する（git 履歴には残るため復元可能）。 */
export async function deleteTicket(
  config: TicketRepositoryConfig & { input: DeleteTicketInput },
): Promise<void> {
  assertTicketPath(config.input.path);
  const ctx = toContext(config);
  const fileName = config.input.path.slice(config.input.path.lastIndexOf('/') + 1);
  await deleteFile(ctx, {
    path: config.input.path,
    sha: config.input.sha,
    message: config.input.message ?? `ticket: delete ${fileName}`,
  });
}

export interface ArchiveTicketInput {
  path: string;
  sha: string;
  message?: string;
}

/** チケットを `.tickets/archive/` へ移動する（新パスへ作成 → 旧パスを削除の 2 コミット）。 */
export async function archiveTicket(
  config: TicketRepositoryConfig & { input: ArchiveTicketInput },
): Promise<{ newPath: string }> {
  const { path } = config.input;
  assertTicketPath(path);
  if (path.startsWith(`${TICKETS_ARCHIVE_DIR}/`)) {
    throw new TicketApiError(400, 'すでにアーカイブ済みです');
  }
  const ctx = toContext(config);
  const current = await fetchFile(ctx, path);
  if (current.sha !== config.input.sha) {
    throw new TicketConflictError(
      409,
      `他の更新が先行しました: ${path} は表示時点から変更されています。再読込してください`,
    );
  }
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  const newPath = `${TICKETS_ARCHIVE_DIR}/${fileName}`;
  assertTicketPath(newPath);
  const message = config.input.message ?? `ticket: archive ${fileName}`;
  const created = await putFile(ctx, { path: newPath, text: current.text, message });
  try {
    await deleteFile(ctx, { path, sha: current.sha, message });
  } catch (error) {
    // 旧パス削除に失敗すると active/archive 両方に同一チケットが残るため、複製を巻き戻す
    try {
      await deleteFile(ctx, {
        path: newPath,
        sha: created.content.sha,
        message: `ticket: rollback archive ${fileName}`,
      });
    } catch (rollbackError) {
      throw new TicketApiError(
        500,
        `アーカイブの削除と巻き戻しの両方に失敗しました（${path} と ${newPath} が重複しています）: ` +
          `${String(error)} / ${String(rollbackError)}`,
      );
    }
    throw error;
  }
  return { newPath };
}
