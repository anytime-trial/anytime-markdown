/**
 * AI 編集台帳（mcp-markdown が書く `<rootDir>/.anytime/markdown/agent-edits.jsonl`）の照合。
 *
 * 外部変更の再読込時に、開いている文書へ mcp-markdown 経由で加えられた節を拾い、
 * markdown-editor の識別表示（`data-am-agent-edit`）へ渡す。台帳は「mcp-markdown 経由の書込」を
 * AI 編集とみなす近似であり、誰が書いたかの証明ではない（共用 UI 優先 3・FR-09）。
 *
 * vscode 非依存の純粋ロジックのみを置く（jest で検証。fs は呼び出し側が注入する）。
 */
import * as path from 'node:path';

export const AGENT_EDIT_LEDGER_RELATIVE_PATH = path.join('.anytime', 'markdown', 'agent-edits.jsonl');

export interface AgentEditLedgerEntry {
  readonly at: string;
  /** 台帳の rootDir 相対パス（mcp-markdown のツール入力そのまま） */
  readonly path: string;
  readonly tool: string;
  readonly heading: string | null;
  readonly occurrence?: number;
}

export interface AgentEditTarget {
  readonly heading: string;
  readonly occurrence?: number;
}

export interface AgentEditLedgerLocation {
  readonly ledgerPath: string;
  /** 台帳が相対パスの基点とする文書ルート（`.anytime/markdown/` の親） */
  readonly rootDir: string;
}

/** 文書の祖先ディレクトリを上へ辿り、最初に見つかった台帳を返す。無ければ null。 */
export function findAgentEditLedger(
  documentFsPath: string,
  exists: (candidate: string) => boolean,
): AgentEditLedgerLocation | null {
  let dir = path.dirname(path.resolve(documentFsPath));
  for (;;) {
    const ledgerPath = path.join(dir, AGENT_EDIT_LEDGER_RELATIVE_PATH);
    if (exists(ledgerPath)) return { ledgerPath, rootDir: dir };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 壊れた行は読み飛ばす（JSONL は行単位で復旧する）。 */
export function parseAgentEditLedger(text: string): AgentEditLedgerEntry[] {
  const entries: AgentEditLedgerEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      if (
        typeof entry.at === 'string' &&
        typeof entry.path === 'string' &&
        typeof entry.tool === 'string' &&
        (typeof entry.heading === 'string' || entry.heading === null) &&
        (entry.occurrence === undefined || typeof entry.occurrence === 'number')
      ) {
        entries.push(entry as unknown as AgentEditLedgerEntry);
      }
    } catch {
      // 破損行は読み飛ばす
    }
  }
  return entries;
}

export interface SelectAgentEditTargetsOptions {
  readonly rootDir: string;
  readonly documentFsPath: string;
  /** この時刻より後（`at > since`・ISO 8601 の辞書順比較）のエントリだけを対象にする */
  readonly since: string;
}

export interface SelectAgentEditTargetsResult {
  /** 識別表示の対象（見出し付きの編集。同一見出し・出現順は 1 つに畳む） */
  readonly targets: AgentEditTarget[];
  /** 対象文書の最新エントリの時刻（次回の since に使う）。該当なしは null */
  readonly latestAt: string | null;
}

/**
 * 台帳から「この文書へ since より後に加えられた編集」を選ぶ。
 * frontmatter / 整形（heading が null）は latestAt には数えるが、節の表示対象にはしない。
 */
export function selectAgentEditTargets(
  entries: readonly AgentEditLedgerEntry[],
  options: SelectAgentEditTargetsOptions,
): SelectAgentEditTargetsResult {
  const documentPath = path.resolve(options.documentFsPath);
  const seen = new Set<string>();
  const targets: AgentEditTarget[] = [];
  let latestAt: string | null = null;
  for (const entry of entries) {
    if (!(entry.at > options.since)) continue;
    if (path.resolve(options.rootDir, entry.path) !== documentPath) continue;
    if (latestAt === null || entry.at > latestAt) latestAt = entry.at;
    if (entry.heading === null) continue;
    const key = `${entry.occurrence ?? 1}\u0000${entry.heading}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(
      entry.occurrence === undefined ? { heading: entry.heading } : { heading: entry.heading, occurrence: entry.occurrence },
    );
  }
  return { targets, latestAt };
}
