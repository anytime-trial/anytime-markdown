/**
 * 確定セクションロックの共有モデル（純粋テキスト関数・実行時依存ゼロ）。
 *
 * ロック情報は文書 frontmatter の `lockedSections` 配列に保持する
 * （要件: phase5-emergency-protocol-requirements.ja.md §22.1。サイドカー・本文マーカーは却下済み）。
 * YAML は本モジュールが emit する限定サブセットのみを扱う。lockedSections ブロックは
 * 機械管理であり、他の frontmatter キーには一切触れない。
 * gray-matter 等を使わないのは、ブラウザバンドル（markdown-viewer）で Buffer polyfill を
 * 要求しないため。
 */

export interface LockedSectionEntry {
  /** 見出しパス（先祖見出しテキストを " > " で連結） */
  path: string;
  /** 同一パスが複数あるときの出現順（1 始まり） */
  occurrence: number;
  /** 正規化本文の指紋 "fnv1a64:<16hex>" */
  hash: string;
  /** UTC ISO 8601 */
  lockedAt: string;
  lockedBy: string;
  reason?: string;
}

export interface SectionInfo {
  path: string;
  occurrence: number;
  level: number;
  /** 見出し行（0 始まり・見出し行自体もロック範囲） */
  headingLine: number;
  startLine: number;
  /** 次の同レベル以上の見出しの直前行（末尾セクションは最終行） */
  endLine: number;
}

export type LockViolation =
  | { kind: 'section_modified'; entry: LockedSectionEntry }
  | { kind: 'section_removed'; entry: LockedSectionEntry }
  | { kind: 'lock_entry_removed'; entry: LockedSectionEntry }
  | { kind: 'lock_entry_altered'; entry: LockedSectionEntry };

export interface LockEvaluation {
  /** deny 対象（ロック節への変更・ロックエントリの削除 / 改変） */
  violations: LockViolation[];
  /** before 時点で既にロック外経路の逸脱がある（warn 対象・deny しない） */
  tampers: LockedSectionEntry[];
}

const HASH_PREFIX = 'fnv1a64:';
const LOCK_KEY = 'lockedSections';
const ENTRY_FIELDS = ['path', 'occurrence', 'hash', 'lockedAt', 'lockedBy', 'reason'] as const;

// --- frontmatter -----------------------------------------------------------

interface FrontmatterSlice {
  /** 開始 `---` と終了 `---` を含まない内側の行 */
  innerLines: string[];
  /** 元テキスト上で frontmatter 全体（終了 --- の改行まで）が占める文字数 */
  matchLength: number;
}

function sliceFrontmatter(text: string): FrontmatterSlice | null {
  const re = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
  const m = re.exec(text);
  if (!m) return null;
  return { innerLines: m[1].split(/\r?\n/), matchLength: m[0].length };
}

function parseScalar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // 引用符付きだが JSON として不正 → 生値へフォールバック（下で return）
    }
  }
  // js-yaml（gray-matter の update_frontmatter 等）が再直列化した単引用符スカラも受理する
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed;
}

interface LockBlockRange {
  start: number;
  /** exclusive */
  end: number;
}

function findLockBlock(innerLines: string[]): LockBlockRange | null {
  const start = innerLines.findIndex((line) => /^lockedSections:\s*(\[\s*\]\s*)?$/.test(line));
  if (start < 0) return null;
  let end = start + 1;
  while (end < innerLines.length && !/^\S/.test(innerLines[end])) end += 1;
  return { start, end };
}

function parseEntriesFromBlock(blockLines: string[]): LockedSectionEntry[] {
  const entries: LockedSectionEntry[] = [];
  let current: Record<string, string> | null = null;
  const flush = (): void => {
    if (!current) return;
    const record = current;
    current = null;
    if (!record['path'] || !record['hash']) return; // 不正エントリは無視（改変は evaluateLockChange 側で顕在化）
    const occurrence = Number.parseInt(record['occurrence'] ?? '1', 10);
    const entry: LockedSectionEntry = {
      path: record['path'],
      occurrence: Number.isNaN(occurrence) ? 1 : occurrence,
      hash: record['hash'],
      lockedAt: record['lockedAt'] ?? '',
      lockedBy: record['lockedBy'] ?? '',
    };
    if (record['reason'] !== undefined) entry.reason = record['reason'];
    entries.push(entry);
  };
  for (const line of blockLines) {
    const dashMatch = /^\s*-\s+(\w+):\s?(.*)$/.exec(line);
    if (dashMatch) {
      flush();
      current = { [dashMatch[1]]: parseScalar(dashMatch[2]) };
      continue;
    }
    const contMatch = /^\s+(\w+):\s?(.*)$/.exec(line);
    if (contMatch && current) {
      current[contMatch[1]] = parseScalar(contMatch[2]);
    }
  }
  flush();
  return entries;
}

function serializeLockBlock(entries: LockedSectionEntry[]): string[] {
  const lines: string[] = [`${LOCK_KEY}:`];
  for (const entry of entries) {
    lines.push(`    - path: ${JSON.stringify(entry.path)}`);
    lines.push(`      occurrence: ${entry.occurrence}`);
    lines.push(`      hash: ${JSON.stringify(entry.hash)}`);
    lines.push(`      lockedAt: ${JSON.stringify(entry.lockedAt)}`);
    lines.push(`      lockedBy: ${JSON.stringify(entry.lockedBy)}`);
    if (entry.reason !== undefined) lines.push(`      reason: ${JSON.stringify(entry.reason)}`);
  }
  return lines;
}

function rebuildWithFrontmatter(text: string, innerLines: string[]): string {
  const fm = sliceFrontmatter(text);
  const body = fm ? text.slice(fm.matchLength) : text;
  const hasContent = innerLines.some((line) => line.trim() !== '');
  if (!hasContent) {
    // frontmatter が空になったら丸ごと除去（直後の空行 1 つも取り除く）
    return body.startsWith('\n') ? body.slice(1) : body;
  }
  const inner = innerLines.join('\n');
  const separator = fm ? '' : '\n';
  return `---\n${inner}\n---\n${separator}${body}`;
}

export function parseLockedSections(text: string): LockedSectionEntry[] {
  const fm = sliceFrontmatter(text);
  if (!fm) return [];
  const block = findLockBlock(fm.innerLines);
  if (!block) return [];
  return parseEntriesFromBlock(fm.innerLines.slice(block.start + 1, block.end));
}

export function hasLockedSections(text: string): boolean {
  if (!text.startsWith('---')) return false;
  const fm = sliceFrontmatter(text);
  if (!fm) return false;
  return fm.innerLines.some((line) => line.startsWith(`${LOCK_KEY}:`));
}

function writeEntries(text: string, entries: LockedSectionEntry[]): string {
  const fm = sliceFrontmatter(text);
  const innerLines = fm ? [...fm.innerLines] : [];
  const block = findLockBlock(innerLines);
  const newBlock = entries.length > 0 ? serializeLockBlock(entries) : [];
  if (block) {
    innerLines.splice(block.start, block.end - block.start, ...newBlock);
  } else if (newBlock.length > 0) {
    innerLines.push(...newBlock);
  }
  return rebuildWithFrontmatter(text, innerLines);
}

export function upsertLockedSection(text: string, entry: LockedSectionEntry): string {
  const entries = parseLockedSections(text);
  const index = entries.findIndex(
    (e) => e.path === entry.path && e.occurrence === entry.occurrence,
  );
  if (index >= 0) {
    entries[index] = entry;
  } else {
    entries.push(entry);
  }
  return writeEntries(text, entries);
}

export function removeLockedSection(text: string, path: string, occurrence: number): string {
  const entries = parseLockedSections(text).filter(
    (e) => !(e.path === path && e.occurrence === occurrence),
  );
  return writeEntries(text, entries);
}

// --- sections ---------------------------------------------------------------

export function listSections(text: string): SectionInfo[] {
  const lines = text.split(/\r?\n/);
  let scanStart = 0;
  if (lines[0]?.trimEnd() === '---') {
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trimEnd() === '---') {
        scanStart = i + 1;
        break;
      }
    }
  }

  interface HeadingHit {
    level: number;
    text: string;
    line: number;
  }
  const headings: HeadingHit[] = [];
  let fence: { char: string; length: number } | null = null;
  for (let i = scanStart; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const char = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!fence) {
        fence = { char, length };
        continue;
      }
      if (fence.char === char && length >= fence.length && line.trim() === fenceMatch[1]) {
        fence = null;
        continue;
      }
    }
    if (fence) continue;
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!headingMatch) continue;
    const text2 = headingMatch[2].replace(/\s+#+$/, '');
    headings.push({ level: headingMatch[1].length, text: text2, line: i });
  }

  const stack: { level: number; text: string }[] = [];
  const occurrenceByPath = new Map<string, number>();
  const sections: SectionInfo[] = [];
  for (let h = 0; h < headings.length; h += 1) {
    const heading = headings[h];
    while (stack.length > 0 && stack.at(-1)!.level >= heading.level) stack.pop();
    const path = [...stack.map((s) => s.text), heading.text].join(' > ');
    stack.push({ level: heading.level, text: heading.text });
    const occurrence = (occurrenceByPath.get(path) ?? 0) + 1;
    occurrenceByPath.set(path, occurrence);
    const next = headings.slice(h + 1).find((n) => n.level <= heading.level);
    sections.push({
      path,
      occurrence,
      level: heading.level,
      headingLine: heading.line,
      startLine: heading.line,
      endLine: next ? next.line - 1 : lines.length - 1,
    });
  }
  return sections;
}

// --- hash --------------------------------------------------------------------

function fnv1a64Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/** 正規化 = 行末空白（\r 含む）除去 + 末尾空行除去。整形ゆらぎで tamper を誤検知しないための最小限 */
function normalizeSectionText(lines: string[]): string {
  const trimmed = lines.map((line) => line.replace(/\s+$/, ''));
  while (trimmed.length > 0 && trimmed.at(-1) === '') trimmed.pop();
  return trimmed.join('\n');
}

export function computeSectionHash(text: string, section: SectionInfo): string {
  const lines = text.split(/\r?\n/).slice(section.startLine, section.endLine + 1);
  return `${HASH_PREFIX}${fnv1a64Hex(normalizeSectionText(lines))}`;
}

// --- evaluation ---------------------------------------------------------------

function sameEntry(a: LockedSectionEntry, b: LockedSectionEntry): boolean {
  return ENTRY_FIELDS.every((field) => a[field] === b[field]);
}

function sectionKey(path: string, occurrence: number): string {
  return `${path} ${occurrence}`;
}

/**
 * before → after の変更がロックに違反するかを判定する（ゲート / mcp-markdown 共用の中核）。
 * violations は deny、tampers は warn（既に逸脱済みのため deny しない。要件 §22.3）。
 */
export function evaluateLockChange(beforeText: string, afterText: string): LockEvaluation {
  const empty: LockEvaluation = { violations: [], tampers: [] };
  const beforeEntries = parseLockedSections(beforeText);
  if (beforeEntries.length === 0 || beforeText === afterText) return empty;

  const beforeSections = new Map(
    listSections(beforeText).map((s) => [sectionKey(s.path, s.occurrence), s]),
  );
  const afterSections = new Map(
    listSections(afterText).map((s) => [sectionKey(s.path, s.occurrence), s]),
  );
  const afterEntries = parseLockedSections(afterText);

  const violations: LockViolation[] = [];
  const tampers: LockedSectionEntry[] = [];
  for (const entry of beforeEntries) {
    const key = sectionKey(entry.path, entry.occurrence);
    const beforeSection = beforeSections.get(key);
    if (!beforeSection || computeSectionHash(beforeText, beforeSection) !== entry.hash) {
      tampers.push(entry);
      continue;
    }
    const afterEntry = afterEntries.find(
      (e) => e.path === entry.path && e.occurrence === entry.occurrence,
    );
    if (!afterEntry) {
      violations.push({ kind: 'lock_entry_removed', entry });
      continue;
    }
    if (!sameEntry(afterEntry, entry)) {
      violations.push({ kind: 'lock_entry_altered', entry });
      continue;
    }
    const afterSection = afterSections.get(key);
    if (!afterSection) {
      violations.push({ kind: 'section_removed', entry });
      continue;
    }
    if (computeSectionHash(afterText, afterSection) !== entry.hash) {
      violations.push({ kind: 'section_modified', entry });
    }
  }
  return { violations, tampers };
}
