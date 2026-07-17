// Phase 5 S4 (要件 §22.3): PreToolUse 全ツールゲートの Section Lock 検査。
// agent-status-report.mjs の gate モードから airspace バンドル経由で呼ばれる。
// 判定は「変更後内容のシミュレート + ロック節の前後比較」（old_string の位置推定はしない）。
// 例外・読取失敗・パース不能は pass（fail-open。可用性優先の既存ゲート方針と同一）。

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import {
  evaluateLockChange,
  hasLockedSections,
  listSections,
  parseLockedSections,
  type LockViolation,
} from '@anytime-markdown/section-lock-core';

export interface SectionLockSpoolEvent {
  event: 'section_lock_denied' | 'section_lock_tamper';
  reason: string;
  detailJson: string;
}

export interface SectionLockVerdict {
  kind: 'pass' | 'warn' | 'deny';
  reason?: string;
  spoolEvents: SectionLockSpoolEvent[];
}

const PASS: SectionLockVerdict = { kind: 'pass', spoolEvents: [] };

/** ロック保有 md への変更を合成できない Serena 変更系（regex 方言差のため保守的 deny） */
const SERENA_WRITE_TOOLS = new Set([
  'mcp__serena__replace_content',
  'mcp__serena__replace_in_files',
  'mcp__serena__replace_symbol_body',
  'mcp__serena__insert_after_symbol',
  'mcp__serena__insert_before_symbol',
]);

const UNLOCK_GUIDANCE =
  '解除は人間の明示操作のみ: エディタ（Anytime Markdown）のアウトラインパネルでロックを解除するか、' +
  'frontmatter の lockedSections を人間が編集してください。';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function resolveTargetPath(rawPath: string, cwd: string): string {
  return isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
}

function readBefore(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null; // 新規ファイル or 読取不能 → fail-open
  }
}

function describeViolation(v: LockViolation): string {
  const target = `「${v.entry.path}」(${v.entry.occurrence})`;
  switch (v.kind) {
    case 'section_modified':
      return `ロック節 ${target} の本文を変更しようとしています`;
    case 'section_removed':
      return `ロック節 ${target} の見出しを削除・リネームしようとしています`;
    case 'lock_entry_removed':
      return `ロックエントリ ${target} を削除しようとしています`;
    case 'lock_entry_altered':
      return `ロックエントリ ${target} を改変しようとしています`;
  }
}

function denyVerdict(
  toolName: string,
  filePath: string,
  violations: LockViolation[],
): SectionLockVerdict {
  const lines = violations.map((v) => {
    const reason = v.entry.reason ? `（ロック理由: ${v.entry.reason}）` : '';
    return `- ${describeViolation(v)}${reason}`;
  });
  const reason =
    `[Section Lock] ${filePath} には人間が確定したロック節があります。\n${lines.join('\n')}\n${UNLOCK_GUIDANCE}`;
  return {
    kind: 'deny',
    reason,
    spoolEvents: [
      {
        event: 'section_lock_denied',
        reason: `section lock violation denied (${toolName})`,
        detailJson: JSON.stringify({
          kind: 'section_lock_denied',
          tool: toolName,
          file: filePath,
          violations: violations.map((v) => ({
            kind: v.kind,
            path: v.entry.path,
            occurrence: v.entry.occurrence,
          })),
        }),
      },
    ],
  };
}

function tamperVerdict(
  toolName: string,
  filePath: string,
  tampers: ReturnType<typeof parseLockedSections>,
): SectionLockVerdict {
  const paths = tampers.map((t) => `「${t.path}」(${t.occurrence})`).join(', ');
  return {
    kind: 'warn',
    reason:
      `[Section Lock] ${filePath} のロック節 ${paths} がロック外経路で変更されています` +
      '（ハッシュ不一致）。エディタでロック状態を確認してください。',
    spoolEvents: [
      {
        event: 'section_lock_tamper',
        reason: `section lock tamper detected (${toolName})`,
        detailJson: JSON.stringify({
          kind: 'section_lock_tamper',
          tool: toolName,
          file: filePath,
          sections: tampers.map((t) => ({ path: t.path, occurrence: t.occurrence })),
        }),
      },
    ],
  };
}

function evaluateBeforeAfter(
  toolName: string,
  filePath: string,
  before: string,
  after: string,
): SectionLockVerdict {
  const { violations, tampers } = evaluateLockChange(before, after);
  if (violations.length > 0) return denyVerdict(toolName, filePath, violations);
  if (tampers.length > 0) return tamperVerdict(toolName, filePath, tampers);
  return PASS;
}

function simulateEdit(before: string, input: Record<string, unknown>): string | null {
  const oldString = asString(input['old_string']);
  const newString = asString(input['new_string']);
  if (oldString === null || newString === null || oldString === '') return null;
  if (!before.includes(oldString)) return null; // ツール自体が失敗する → pass
  // 置換関数形式でリテラル置換にする。文字列を直接渡すと $$ / $1 等の特殊置換が
  // 解釈され、実 Edit ツール（リテラル）とシミュレート結果が乖離する（cross-review 合意 #5）。
  return input['replace_all'] === true
    ? before.replaceAll(oldString, () => newString)
    : before.replace(oldString, () => newString);
}

/** MultiEdit の edits 配列を順次適用して after を合成する（cross-review 合意 #2）。 */
function simulateMultiEdit(before: string, input: Record<string, unknown>): string | null {
  const edits = input['edits'];
  if (!Array.isArray(edits) || edits.length === 0) return null;
  let text = before;
  for (const edit of edits) {
    const record = asRecord(edit);
    if (!record) return null;
    const next = simulateEdit(text, record);
    if (next === null) return null; // 適用不能 = ツール自体が失敗する → pass
    text = next;
  }
  return text;
}

/** mcp-markdown update_section の after を合成する（正確な最終判定は第 2 層が担う） */
function simulateUpdateSection(before: string, input: Record<string, unknown>): string | null {
  const heading = asString(input['heading']);
  const content = asString(input['content']);
  if (heading === null || content === null) return null;
  const headingText = heading.replace(/^#{1,6}\s+/, '').trim();
  const occurrence = typeof input['occurrence'] === 'number' ? input['occurrence'] : 1;
  const matches = listSections(before).filter((s) => s.path.split(' > ').at(-1) === headingText);
  const target = matches.at(occurrence - 1) ?? matches.at(0);
  if (!target) return null;
  const lines = before.split('\n');
  const replaced = [
    ...lines.slice(0, target.startLine),
    ...content.split('\n'),
    ...lines.slice(target.endLine + 1),
  ];
  return replaced.join('\n');
}

function touchesLockKey(input: Record<string, unknown>): boolean {
  const removeKeys = input['removeKeys'];
  if (Array.isArray(removeKeys) && removeKeys.includes('lockedSections')) return true;
  const set = asRecord(input['set']);
  return set !== null && Object.hasOwn(set, 'lockedSections');
}

/**
 * PreToolUse gate の Section Lock 判定。deny = ロック節への変更 / ロックエントリの削除・改変、
 * warn = ロック外経路の逸脱検知（tamper）。判定不能はすべて pass（fail-open）。
 */
export function evaluateSectionLockGate(
  toolName: string,
  toolInput: unknown,
  cwd: string,
): SectionLockVerdict {
  try {
    const input = asRecord(toolInput);
    if (!input) return PASS;

    // update_frontmatter の自己保護: lockedSections はエディタ（人間）だけが管理する。
    if (toolName === 'mcp__mcp-markdown__update_frontmatter') {
      if (!touchesLockKey(input)) return PASS;
      const raw = asString(input['path']);
      const filePath = raw === null ? '(unknown)' : resolveTargetPath(raw, cwd);
      return {
        kind: 'deny',
        reason:
          `[Section Lock] frontmatter の lockedSections は人間が管理する領域です。` +
          `AI からの変更（${filePath}）は拒否します。${UNLOCK_GUIDANCE}`,
        spoolEvents: [
          {
            event: 'section_lock_denied',
            reason: `lockedSections frontmatter change denied (${toolName})`,
            detailJson: JSON.stringify({
              kind: 'section_lock_denied',
              tool: toolName,
              file: filePath,
              violations: [{ kind: 'lock_entry_altered' }],
            }),
          },
        ],
      };
    }

    const rawPath =
      asString(input['file_path']) ?? asString(input['path']) ?? asString(input['relative_path']);
    // mcp-markdown の許可拡張子（.md / .markdown）と揃える（cross-review 合意 #4）
    if (rawPath === null || !/\.(md|markdown)$/i.test(rawPath)) return PASS;
    const filePath = resolveTargetPath(rawPath, cwd);
    const before = readBefore(filePath);
    if (before === null || !hasLockedSections(before)) return PASS;

    if (SERENA_WRITE_TOOLS.has(toolName)) {
      // regex 方言差（Serena は Python 側で適用）で after を忠実に合成できないため保守的に deny。
      return {
        kind: 'deny',
        reason:
          `[Section Lock] ${filePath} にはロック節があり、${toolName} の変更結果を検証できません。` +
          `Edit / Write ツールを使用してください。${UNLOCK_GUIDANCE}`,
        spoolEvents: [
          {
            event: 'section_lock_denied',
            reason: `unverifiable edit on locked file denied (${toolName})`,
            detailJson: JSON.stringify({
              kind: 'section_lock_denied',
              tool: toolName,
              file: filePath,
              violations: [],
            }),
          },
        ],
      };
    }

    let after: string | null = null;
    if (toolName === 'Edit') {
      after = simulateEdit(before, input);
    } else if (toolName === 'MultiEdit') {
      after = simulateMultiEdit(before, input);
    } else if (toolName === 'Write' || toolName === 'mcp__mcp-markdown__write_markdown') {
      after = asString(input['content']);
    } else if (toolName === 'mcp__mcp-markdown__update_section') {
      after = simulateUpdateSection(before, input);
    } else {
      return PASS; // format_markdown / sanitize_markdown 等は合成不能 → 第 2 層が担保（要件 §22.3）
    }
    if (after === null) return PASS;
    return evaluateBeforeAfter(toolName, filePath, before, after);
  } catch {
    return PASS; // fail-open（ゲートのバグで全 md 編集を止めない）
  }
}
