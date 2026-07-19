export const TICKET_STATUSES = ['backlog', 'up_next', 'in_progress', 'completed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface TicketFrontmatter {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee?: TicketAssignee;
  workspace?: TicketWorkspace;
  creator?: string;
  created_at: string;
  updated_at: string;
  dependencies?: string[];
  /** 予定工数（分） */
  estimate?: number;
  /** 実施工数（分）。累積値。実行ループが手を離すたびに加算する（AL-4） */
  actual?: number;
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

/**
 * 担当（assignee）。`agent` は AI エージェント（実行ループの選定対象）、`user` は人間。未設定も可。
 * 人の回答待ちは `user` への返却で表現する（要件 AL-5。旧 `question` ラベルは 2026-07-17 に廃止）。
 */
export const TICKET_ASSIGNEES = ['agent', 'user'] as const;
export type TicketAssignee = (typeof TICKET_ASSIGNEES)[number];

/**
 * ワークスペース（workspace）の選択肢。実行ループは自ワークスペースと一致するチケットのみを
 * 対象とする（要件 AL-2）。新規属性で旧値が存在し得ないため enum を厳密検証する。
 */
export const TICKET_WORKSPACES = ['anytime-markdown', 'anytime-trade', 'other'] as const;
export type TicketWorkspace = (typeof TICKET_WORKSPACES)[number];

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;
// frontmatter は 1 行 1 スカラーの自前フォーマットのため、値・キーに制御文字（改行等）が入ると
// 別キー・別行を注入できる。パーサは `\n` を復元しない（往復不能）ので、エスケープではなく拒否する。
const CONTROL_CHARS_RE = new RegExp('[\\u0000-\\u001f]');
// パーサのキー規則（parseTicketMarkdown の `^([A-Za-z_][\w-]*):`）と一致させる。
const SAFE_KEY_RE = /^[A-Za-z_][\w-]*$/;
// 2026-07-17 に廃止した `labels` / `progress` は意図的に含めない。未知キーとして extras へ落ち、
// 既存チケットの当該行が往復保存される（破棄しない。FR-2）。
const KNOWN_KEYS = new Set([
  'id',
  'title',
  'status',
  'priority',
  'assignee',
  'workspace',
  'creator',
  'created_at',
  'updated_at',
  'dependencies',
  'estimate',
  'actual',
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

/** 文字列 / 文字列配列フィールドに制御文字（改行等）が含まれる場合にエラーを積む。 */
function checkNoControlChars(raw: Record<string, unknown>, key: string, errors: string[]): void {
  const value = raw[key];
  const hasControl =
    (typeof value === 'string' && CONTROL_CHARS_RE.test(value)) ||
    (isStringArray(value) && value.some((item) => CONTROL_CHARS_RE.test(item)));
  if (hasControl) {
    errors.push(`${key} に制御文字（改行等）は使用できません`);
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
  // assignee / workspace は UI が選択式のため enum を厳密検証する（未設定は可）。
  if (raw.assignee !== undefined && !TICKET_ASSIGNEES.includes(raw.assignee as TicketAssignee)) {
    errors.push(`assignee は ${TICKET_ASSIGNEES.join(' / ')} のいずれかのみ許可されます`);
  }
  if (raw.workspace !== undefined && !TICKET_WORKSPACES.includes(raw.workspace as TicketWorkspace)) {
    errors.push(`workspace は ${TICKET_WORKSPACES.join(' / ')} のいずれかのみ許可されます`);
  }
  if (raw.creator !== undefined && typeof raw.creator !== 'string') {
    errors.push('creator は文字列のみ許可されます');
  }
  if (raw.dependencies !== undefined && !isStringArray(raw.dependencies)) {
    errors.push('dependencies は文字列配列のみ許可されます');
  }
  checkOptionalNumber(raw, 'estimate', { min: 0, max: Number.MAX_SAFE_INTEGER }, errors);
  checkOptionalNumber(raw, 'actual', { min: 0, max: Number.MAX_SAFE_INTEGER }, errors);
  checkOptionalNumber(raw, 'ai_confidence', { min: 0, max: 1 }, errors);
  for (const key of ['id', 'title', 'assignee', 'creator', 'dependencies']) {
    checkNoControlChars(raw, key, errors);
  }
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
  if (raw.assignee !== undefined) value.assignee = raw.assignee as TicketAssignee;
  if (raw.workspace !== undefined) value.workspace = raw.workspace as TicketWorkspace;
  if (raw.creator !== undefined) value.creator = raw.creator as string;
  if (raw.dependencies !== undefined) value.dependencies = raw.dependencies as string[];
  if (raw.estimate !== undefined) value.estimate = raw.estimate as number;
  if (raw.actual !== undefined) value.actual = raw.actual as number;
  if (raw.ai_confidence !== undefined) value.ai_confidence = raw.ai_confidence as number;
  return { ok: true, value, extras };
}

function serializeScalar(value: string | number): string {
  if (typeof value === 'number') {
    return String(value);
  }
  // 制御文字は行を分断して別キー注入を許すため、シリアライズ段階で必ず弾く（最終防衛線）。
  if (CONTROL_CHARS_RE.test(value)) {
    throw new Error('frontmatter のスカラー値に制御文字（改行等）は使用できません');
  }
  if (value === '' || /[:#[\]{}"']/.test(value) || NUMBER_RE.test(value) || value.trim() !== value) {
    return `"${value.replaceAll('"', String.raw`\"`)}"`;
  }
  return value;
}

function serializeValue(key: string, value: FrontmatterValue): string {
  // キーは引用符なしで出力されるため、パーサのキー規則に反するキーは行注入の温床になる。
  if (!SAFE_KEY_RE.test(key)) {
    throw new Error(`frontmatter キーとして不正です: ${JSON.stringify(key)}`);
  }
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
    ['workspace', frontmatter.workspace],
    ['creator', frontmatter.creator],
    ['created_at', frontmatter.created_at],
    ['updated_at', frontmatter.updated_at],
    ['dependencies', frontmatter.dependencies],
    ['estimate', frontmatter.estimate],
    ['actual', frontmatter.actual],
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
// Why not: 非アンカーの /Comments|コミュニケーションスレッド/ だと、セクション本文中に
// 「Comments」という単語がある行を見出しと誤検知し、そこからを Comments セクションとして
// 切り出してしまう（splitCommentsSection 経由で Description が本文編集から消える実害）。
// 見出し行（^## ）のみに一致させ、終端判定の /^##\s/（findSectionRange）と対称にする。
const COMMENTS_SECTION_RE = /^##\s.*(?:Comments|コミュニケーションスレッド)/;

export function appendComment(body: string, comment: TicketComment): string {
  const entry = `### ${comment.author} - ${comment.timestamp}\n\n${comment.text.trim()}\n`;
  const range = findSectionRange(body, COMMENTS_SECTION_RE);
  if (!range) {
    return `${body.trimEnd()}\n\n${COMMENTS_HEADING}\n\n${entry}`;
  }
  const lines = body.split('\n');
  const before = lines.slice(0, range.end).join('\n').trimEnd();
  const after = lines.slice(range.end).join('\n');
  const tail = after === '' ? '' : `\n${after}`;
  return `${before}\n\n${entry}${tail}`;
}

// Why not: 単なる `^### ` をコメント境界にすると、コメント本文へ書かれたコード例・見出し風の
// 行を別コメントに分割してしまう。appendComment が書く「### <投稿者> - <ISO UTC 日時>」の
// 日時部分まで一致した行だけを境界とする（投稿者名にスペース・日本語・ハイフンを許すため
// 区切りは末尾の日時形式で判定する）。
const COMMENT_HEADER_RE = /^###\s+(.+)\s-\s(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)\s*$/;

interface CommentBlock extends TicketComment {
  /** Comments セクション内の行 index（ヘッダー行） */
  headerLine: number;
  /** ブロック終端（次ヘッダー行 or セクション末尾・exclusive） */
  endLine: number;
}

function scanCommentBlocks(body: string): { lines: string[]; range: { start: number; end: number } | null; blocks: CommentBlock[] } {
  const lines = body.split('\n');
  const range = findSectionRange(body, COMMENTS_SECTION_RE);
  if (!range) {
    return { lines, range: null, blocks: [] };
  }
  const blocks: CommentBlock[] = [];
  for (let i = range.start + 1; i < range.end; i += 1) {
    const match = COMMENT_HEADER_RE.exec(lines[i]);
    if (!match) {
      continue;
    }
    if (blocks.length > 0) {
      blocks[blocks.length - 1].endLine = i;
    }
    blocks.push({ author: match[1], timestamp: match[2], text: '', headerLine: i, endLine: range.end });
  }
  for (const block of blocks) {
    block.text = lines.slice(block.headerLine + 1, block.endLine).join('\n').trim();
  }
  return { lines, range, blocks };
}

/**
 * Comments セクションを「投稿者 - 日時」単位の構造化リストへ解析する。
 * セクションが無い・コメントが無い場合は空配列を返す。
 */
export function parseComments(body: string): TicketComment[] {
  return scanCommentBlocks(body).blocks.map(({ author, timestamp, text }) => ({ author, timestamp, text }));
}

/**
 * 本文を Comments セクション（見出し含む）とそれ以外へ分離する。
 * コメントの表示・編集を専用 UI に寄せ、本文編集の対象から Comments を外すための分離点。
 * セクションが無い場合は `commentsSection` を空文字で返す。
 */
export function splitCommentsSection(body: string): { content: string; commentsSection: string } {
  const { lines, range } = scanCommentBlocks(body);
  if (!range) {
    return { content: body, commentsSection: '' };
  }
  const pre = lines.slice(0, range.start).join('\n').trimEnd();
  const post = lines.slice(range.end).join('\n').trim();
  const content = post === '' ? `${pre}\n` : `${pre}\n\n${post}\n`;
  const commentsSection = `${lines.slice(range.start, range.end).join('\n').trimEnd()}\n`;
  return { content, commentsSection };
}

/**
 * splitCommentsSection の逆操作。Comments セクションは常に本文末尾へ結合する
 * （テンプレート上も Comments は最終セクション。中間位置は正規化される）。
 */
export function joinCommentsSection(content: string, commentsSection: string): string {
  if (commentsSection === '') {
    return content;
  }
  return `${content.trimEnd()}\n\n${commentsSection.trimEnd()}\n`;
}

/**
 * 指定 index（parseComments の並び順）のコメント本文テキストのみ置換する。
 * author・日時・他コメント・他セクションは変更しない。index が範囲外なら null
 * （silent に原文を返すと「保存できたのに変わらない」に見えるため、呼び出し側でエラー表示させる）。
 */
export function replaceCommentText(body: string, index: number, text: string): string | null {
  const { lines, blocks } = scanCommentBlocks(body);
  if (index < 0 || index >= blocks.length) {
    return null;
  }
  const target = blocks[index];
  const replacement = ['', text.trim(), ''];
  const next = [...lines.slice(0, target.headerLine + 1), ...replacement, ...lines.slice(target.endLine)];
  return next.join('\n');
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
