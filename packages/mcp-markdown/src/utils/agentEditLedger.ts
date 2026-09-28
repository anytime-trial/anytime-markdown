import fs from 'node:fs/promises';
import path from 'node:path';

export type AgentEditTool = 'update_section' | 'update_frontmatter' | 'format_markdown';

export interface AgentEditEntry {
  at: string;
  path: string;
  tool: AgentEditTool;
  heading: string | null;
  occurrence?: number;
}

export const AGENT_EDIT_LEDGER_RELATIVE_PATH = '.anytime/markdown/agent-edits.jsonl';

export function resolveAgentEditLedgerPath(rootDir: string): string {
  return path.resolve(rootDir, AGENT_EDIT_LEDGER_RELATIVE_PATH);
}

/** 台帳の障害で、成功済みの文書書込みを失敗にしない。 */
export async function appendAgentEdit(rootDir: string, entry: AgentEditEntry): Promise<void> {
  const ledgerPath = resolveAgentEditLedgerPath(rootDir);
  try {
    await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
    await fs.appendFile(ledgerPath, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (error) {
    console.error(`[mcp-markdown] agent edit ledger append failed: ${ledgerPath}`, error);
  }
}

/** 不完全・破損した行を読み飛ばし、後続の正常な行も読み取る。 */
export function parseAgentEditLedger(text: string): AgentEditEntry[] {
  const entries: AgentEditEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      if (
        typeof entry.at === 'string' &&
        typeof entry.path === 'string' &&
        (entry.tool === 'update_section' || entry.tool === 'update_frontmatter' || entry.tool === 'format_markdown') &&
        (typeof entry.heading === 'string' || entry.heading === null) &&
        (entry.occurrence === undefined || typeof entry.occurrence === 'number')
      ) {
        entries.push(entry as unknown as AgentEditEntry);
      }
    } catch {
      // JSONL は行単位で復旧する。
    }
  }
  return entries;
}
