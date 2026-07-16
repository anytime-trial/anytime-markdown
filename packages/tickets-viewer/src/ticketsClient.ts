import type {
  FrontmatterValue,
  InvalidTicketFile,
  TicketFrontmatter,
  TicketPriority,
  TicketStatus,
} from "@anytime-markdown/tickets-core";

/** web-app の /api/github/tickets 系ルートを呼ぶクライアント（トークンはサーバー側のみが扱う）。 */
export interface TicketItem {
  path: string;
  sha: string;
  frontmatter: TicketFrontmatter;
  extras: Record<string, FrontmatterValue>;
  body: string;
  archived: boolean;
}

export interface TicketsData {
  tickets: TicketItem[];
  invalid: InvalidTicketFile[];
}

export interface TicketsClientConfig {
  repo: string;
  branch: string;
  /** 既定 `/api/github/tickets` */
  basePath?: string;
}

export class TicketsClientError extends Error {
  readonly status: number;
  readonly conflict: boolean;
  readonly validationErrors: string[];

  constructor(status: number, message: string, options?: { conflict?: boolean; validationErrors?: string[] }) {
    super(message);
    this.name = "TicketsClientError";
    this.status = status;
    this.conflict = options?.conflict ?? false;
    this.validationErrors = options?.validationErrors ?? [];
  }
}

const DEFAULT_BASE_PATH = "/api/github/tickets";

async function toClientError(res: Response): Promise<TicketsClientError> {
  let payload: { error?: string; conflict?: boolean; errors?: string[] } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch (error) {
    payload = { error: `HTTP ${res.status}（本文解析不可: ${String(error)}）` };
  }
  return new TicketsClientError(res.status, payload.error ?? `HTTP ${res.status}`, {
    conflict: payload.conflict === true || res.status === 409,
    validationErrors: payload.errors,
  });
}

export async function fetchTickets(
  config: TicketsClientConfig,
  includeArchive: boolean,
): Promise<TicketsData> {
  const base = config.basePath ?? DEFAULT_BASE_PATH;
  const params = new URLSearchParams({ repo: config.repo, branch: config.branch });
  if (includeArchive) {
    params.set("includeArchive", "1");
  }
  const res = await fetch(`${base}?${params.toString()}`);
  if (!res.ok) {
    throw await toClientError(res);
  }
  return (await res.json()) as TicketsData;
}

export interface SaveTicketInput {
  path: string;
  sha: string;
  frontmatter: TicketFrontmatter;
  extras: Record<string, FrontmatterValue>;
  body: string;
  message?: string;
}

export async function saveTicket(
  config: TicketsClientConfig,
  input: SaveTicketInput,
): Promise<{ sha: string; updated_at: string }> {
  const base = config.basePath ?? DEFAULT_BASE_PATH;
  const res = await fetch(base, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: config.repo, branch: config.branch, ...input }),
  });
  if (!res.ok) {
    throw await toClientError(res);
  }
  return (await res.json()) as { sha: string; updated_at: string };
}

export interface CreateTicketClientInput {
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee?: string;
  creator?: string;
  labels?: string[];
  estimate?: number;
  description?: string;
}

export async function createTicketRemote(
  config: TicketsClientConfig,
  input: CreateTicketClientInput,
): Promise<TicketItem> {
  const base = config.basePath ?? DEFAULT_BASE_PATH;
  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: config.repo, branch: config.branch, ...input }),
  });
  if (!res.ok) {
    throw await toClientError(res);
  }
  return (await res.json()) as TicketItem;
}

export async function archiveTicketRemote(
  config: TicketsClientConfig,
  input: { path: string; sha: string },
): Promise<{ newPath: string }> {
  const base = config.basePath ?? DEFAULT_BASE_PATH;
  const res = await fetch(`${base}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: config.repo, branch: config.branch, ...input }),
  });
  if (!res.ok) {
    throw await toClientError(res);
  }
  return (await res.json()) as { newPath: string };
}
