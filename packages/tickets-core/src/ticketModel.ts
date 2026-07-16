export const TICKET_STATUSES = ['backlog', 'up_next', 'in_progress', 'in_review', 'completed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface TicketFrontmatter {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee?: string;
  creator?: string;
  created_at: string;
  updated_at: string;
  labels?: string[];
  dependencies?: string[];
  estimate?: number;
  progress?: number;
  ai_confidence?: number;
}

export type FrontmatterValue = string | number | string[];

export interface ParsedTicketFile {
  frontmatter: Record<string, FrontmatterValue>;
  body: string;
}

export type TicketValidationResult =
  | { ok: true; value: TicketFrontmatter; extras: Record<string, FrontmatterValue> }
  | { ok: false; errors: string[] };

/** AI が人の回答を待っていることを表すラベル（要件 AL-5） */
export const QUESTION_LABEL = 'question';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;
const KNOWN_KEYS = new Set([
  'id',
  'title',
  'status',
  'priority',
  'assignee',
  'creator',
  'created_at',
  'updated_at',
  'labels',
  'dependencies',
  'estimate',
  'progress',
  'ai_confidence',
]);

function unquote(raw: string): { value: string; quoted: boolean } {
  const isDouble = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"');
  const isSingle = raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'");
  if (isDouble) {
    return { value: raw.slice(1, -1).replaceAll(String.raw`\"`, '"'), quoted: true };
  }
  if (isSingle) {
    return { value: raw.slice(1, -1), quoted: true };
  }
  return { value: raw, quoted: false };
}

function parseScalar(raw: string): string | number {
  const { value, quoted } = unquote(raw);
  if (!quoted && NUMBER_RE.test(value)) {
    return Number(value);
  }
  return value;
}

function parseInlineArray(raw: string): string[] {
  const inner = raw.slice(1, -1).trim();
  if (inner === '') {
    return [];
  }
  return inner.split(',').map((item) => unquote(item.trim()).value);
}

/**
 * チケット Markdown を frontmatter と本文に分離する。frontmatter ブロックが無ければ null。
 *
 * SHORTCUT: YAML サブセット（スカラー・インライン/ブロックの文字列配列）のみ対応の自前パーサー.
 * ceiling: ネスト・複数行文字列・カンマを含む配列要素は非対応（チケット標準仕様 FR-2 の属性で十分）.
 * upgrade: FR-2 を超える属性構造が要件化されたら yaml/gray-matter の依存追加を承認取得して移行.
 */
export function parseTicketMarkdown(text: string): ParsedTicketFile | null {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) {
    return null;
  }
  const frontmatter: Record<string, FrontmatterValue> = {};
  let pendingArrayKey: string | null = null;
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (item && pendingArrayKey) {
      (frontmatter[pendingArrayKey] as string[]).push(unquote(item[1].trim()).value);
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (!kv) {
      continue;
    }
    const [, key, rest] = kv;
    const rawValue = rest.trim();
    if (rawValue === '') {
      frontmatter[key] = [];
      pendingArrayKey = key;
      continue;
    }
    pendingArrayKey = null;
    frontmatter[key] = rawValue.startsWith('[') && rawValue.endsWith(']')
      ? parseInlineArray(rawValue)
      : parseScalar(rawValue);
  }
  return { frontmatter, body: match[2] ?? '' };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function checkRequiredString(raw: Record<string, unknown>, key: string, errors: string[]): void {
  const value = raw[key];
  if (typeof value !== 'string' || value === '') {
    errors.push(`${key} は必須の文字列です`);
  }
}

function checkUtcDate(raw: Record<string, unknown>, key: string, errors: string[]): void {
  const value = raw[key];
  if (typeof value !== 'string' || !ISO_UTC_RE.test(value) || Number.isNaN(Date.parse(value))) {
    errors.push(`${key} は ISO 8601 UTC（...Z）の日時が必須です`);
  }
}

function checkOptionalNumber(
  raw: Record<string, unknown>,
  key: string,
  range: { min: number; max: number },
  errors: string[],
): void {
  const value = raw[key];
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'number' || Number.isNaN(value) || value < range.min || value > range.max) {
    errors.push(`${key} は ${range.min}〜${range.max} の数値のみ許可されます`);
  }
}

/** frontmatter を検証し、型付きの値と未知キー（extras）に分離する。 */
export function validateTicketFrontmatter(raw: Record<string, unknown>): TicketValidationResult {
  const errors: string[] = [];
  checkRequiredString(raw, 'id', errors);
  checkRequiredString(raw, 'title', errors);
  checkUtcDate(raw, 'created_at', errors);
  checkUtcDate(raw, 'updated_at', errors);
  if (!TICKET_STATUSES.includes(raw.status as TicketStatus)) {
    errors.push(`status は ${TICKET_STATUSES.join(' / ')} のいずれかが必須です`);
  }
  if (!TICKET_PRIORITIES.includes(raw.priority as TicketPriority)) {
    errors.push(`priority は ${TICKET_PRIORITIES.join(' / ')} のいずれかが必須です`);
  }
  for (const key of ['assignee', 'creator']) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') {
      errors.push(`${key} は文字列のみ許可されます`);
    }
  }
  for (const key of ['labels', 'dependencies']) {
    if (raw[key] !== undefined && !isStringArray(raw[key])) {
      errors.push(`${key} は文字列配列のみ許可されます`);
    }
  }
  checkOptionalNumber(raw, 'estimate', { min: 0, max: Number.MAX_SAFE_INTEGER }, errors);
  checkOptionalNumber(raw, 'progress', { min: 0, max: 100 }, errors);
  checkOptionalNumber(raw, 'ai_confidence', { min: 0, max: 1 }, errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const extras: Record<string, FrontmatterValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!KNOWN_KEYS.has(key) && value !== undefined) {
      extras[key] = value as FrontmatterValue;
    }
  }
  const value: TicketFrontmatter = {
    id: raw.id as string,
    title: raw.title as string,
    status: raw.status as TicketStatus,
    priority: raw.priority as TicketPriority,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
  };
  if (raw.assignee !== undefined) value.assignee = raw.assignee as string;
  if (raw.creator !== undefined) value.creator = raw.creator as string;
  if (raw.labels !== undefined) value.labels = raw.labels as string[];
  if (raw.dependencies !== undefined) value.dependencies = raw.dependencies as string[];
  if (raw.estimate !== undefined) value.estimate = raw.estimate as number;
  if (raw.progress !== undefined) value.progress = raw.progress as number;
  if (raw.ai_confidence !== undefined) value.ai_confidence = raw.ai_confidence as number;
  return { ok: true, value, extras };
}

function serializeScalar(value: string | number): string {
  if (typeof value === 'number') {
    return String(value);
  }
  if (value === '' || /[:#[\]{}"']/.test(value) || NUMBER_RE.test(value) || value.trim() !== value) {
    return `"${value.replaceAll('"', String.raw`\"`)}"`;
  }
  return value;
}

function serializeValue(key: string, value: FrontmatterValue): string {
  if (Array.isArray(value)) {
    return `${key}: [${value.map((item) => serializeScalar(item)).join(', ')}]`;
  }
  return `${key}: ${serializeScalar(value)}`;
}

/** 型付き frontmatter（+未知キー extras）と本文からチケット Markdown を組み立てる。 */
export function serializeTicket(
  frontmatter: TicketFrontmatter,
  body: string,
  extras: Record<string, FrontmatterValue> = {},
): string {
  const lines: string[] = ['---'];
  const ordered: [string, FrontmatterValue | undefined][] = [
    ['id', frontmatter.id],
    ['title', frontmatter.title],
    ['status', frontmatter.status],
    ['priority', frontmatter.priority],
    ['assignee', frontmatter.assignee],
    ['creator', frontmatter.creator],
    ['created_at', frontmatter.created_at],
    ['updated_at', frontmatter.updated_at],
    ['labels', frontmatter.labels],
    ['dependencies', frontmatter.dependencies],
    ['estimate', frontmatter.estimate],
    ['progress', frontmatter.progress],
    ['ai_confidence', frontmatter.ai_confidence],
  ];
  for (const [key, value] of ordered) {
    if (value !== undefined) {
      lines.push(serializeValue(key, value));
    }
  }
  for (const [key, value] of Object.entries(extras)) {
    if (value !== undefined) {
      lines.push(serializeValue(key, value));
    }
  }
  lines.push('---', '');
  const trimmedBody = body.replace(/^\n+/, '');
  return `${lines.join('\n')}\n${trimmedBody}`;
}

/** 既存 id（`T-<連番>`）の最大値+1 を採番する。既存なしは T-1。 */
export function nextTicketId(existingIds: readonly string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const match = /^T-(\d+)$/.exec(id);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return `T-${max + 1}`;
}

/** タイトルから英数字ハイフンの slug を生成する。ASCII 英数字が無い場合は 'ticket'。 */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 50)
    .replaceAll(/-+$/g, '');
  return slug === '' ? 'ticket' : slug;
}

export function ticketFileName(id: string, title: string): string {
  return `${id}-${slugifyTitle(title)}.md`;
}

const DESCRIPTION_HEADING = '## 概要 (Description)';
const SUBTASKS_HEADING = '## 作業タスクリスト (Subtasks)';
const HANDOFF_HEADING = '## 引継ぎサマリー (Handoff Notes)';
const COMMENTS_HEADING = '## コミュニケーションスレッド (Comments)';

/** 新規チケットの本文テンプレート（推奨 4 セクション）。 */
export function buildTicketBody(description = ''): string {
  return [
    DESCRIPTION_HEADING,
    '',
    description,
    '',
    SUBTASKS_HEADING,
    '',
    HANDOFF_HEADING,
    '',
    COMMENTS_HEADING,
    '',
  ].join('\n');
}

function findSectionRange(
  body: string,
  headingPattern: RegExp,
): { start: number; end: number } | null {
  const lines = body.split('\n');
  let start = -1;
  for (const [index, line] of lines.entries()) {
    if (start === -1 && headingPattern.test(line)) {
      start = index;
      continue;
    }
    if (start !== -1 && /^##\s/.test(line)) {
      return { start, end: index };
    }
  }
  return start === -1 ? null : { start, end: lines.length };
}

export interface TicketComment {
  author: string;
  /** ISO 8601 UTC 日時（呼び出し側で採番する） */
  timestamp: string;
  text: string;
}

/**
 * Comments セクション末尾へ「投稿者名 - 日時」付きでコメントを追記する。
 * セクションが無ければ新設する。他セクションは変更しない。
 */
export function appendComment(body: string, comment: TicketComment): string {
  const entry = `### ${comment.author} - ${comment.timestamp}\n\n${comment.text.trim()}\n`;
  const range = findSectionRange(body, /Comments|コミュニケーションスレッド/);
  if (!range) {
    return `${body.trimEnd()}\n\n${COMMENTS_HEADING}\n\n${entry}`;
  }
  const lines = body.split('\n');
  const before = lines.slice(0, range.end).join('\n').trimEnd();
  const after = lines.slice(range.end).join('\n');
  const tail = after === '' ? '' : `\n${after}`;
  return `${before}\n\n${entry}${tail}`;
}

/** 作業タスクリストセクション内のチェックボックス（`- [x]` / `- [ ]`）を集計する。 */
export function countSubtasks(body: string): { done: number; total: number } {
  const range = findSectionRange(body, /Subtasks|作業タスクリスト/);
  if (!range) {
    return { done: 0, total: 0 };
  }
  const lines = body.split('\n').slice(range.start, range.end);
  let done = 0;
  let total = 0;
  for (const line of lines) {
    const match = /^\s*-\s\[([ xX])\]/.exec(line);
    if (match) {
      total += 1;
      if (match[1] !== ' ') {
        done += 1;
      }
    }
  }
  return { done, total };
}

/** 残工数 = estimate × (100 − progress) / 100（小数第 1 位丸め）。estimate 未設定は null。 */
export function remainingHours(estimate?: number, progress?: number): number | null {
  if (typeof estimate !== 'number' || Number.isNaN(estimate)) {
    return null;
  }
  const appliedProgress = typeof progress === 'number' && !Number.isNaN(progress) ? progress : 0;
  return Math.round(estimate * (100 - appliedProgress) * 0.1) / 10;
}
