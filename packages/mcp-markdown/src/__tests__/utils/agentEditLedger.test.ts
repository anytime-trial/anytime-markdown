import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { appendAgentEdit, parseAgentEditLedger, resolveAgentEditLedgerPath, AGENT_EDIT_LEDGER_RELATIVE_PATH, type AgentEditEntry } from '../../utils/agentEditLedger';

describe('agent edit ledger', () => {
  let dir: string;
  const entry: AgentEditEntry = { at: '2026-09-28T00:00:00.000Z', path: './a.md', tool: 'update_section', heading: '## A', occurrence: 2 };
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ledger-')); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('resolves the specified ledger path', () => {
    expect(AGENT_EDIT_LEDGER_RELATIVE_PATH).toBe('.anytime/markdown/agent-edits.jsonl');
    expect(resolveAgentEditLedgerPath(dir)).toBe(path.join(dir, AGENT_EDIT_LEDGER_RELATIVE_PATH));
  });
  it('creates parents and appends one JSON line per call with round trip parsing', async () => {
    await appendAgentEdit(dir, entry);
    expect(await fs.readFile(resolveAgentEditLedgerPath(dir), 'utf8')).toBe(JSON.stringify(entry) + '\n');
    const second: AgentEditEntry = { at: entry.at, path: 'b.md', tool: 'update_frontmatter', heading: null };
    await appendAgentEdit(dir, second);
    const text = await fs.readFile(resolveAgentEditLedgerPath(dir), 'utf8');
    expect(text.split('\n')).toHaveLength(3);
    expect(parseAgentEditLedger(text)).toEqual([entry, second]);
  });
  it('skips broken JSON, missing keys and invalid field types', () => {
    const invalid: unknown[] = [null, [], {}, ...['at', 'path', 'tool', 'heading'].map((key) => {
      const value: Record<string, unknown> = { ...entry };
      delete value[key];
      return value;
    }), { ...entry, at: 1 }, { ...entry, path: null }, { ...entry, tool: 'unknown' }, { ...entry, heading: 2 }, { ...entry, occurrence: '2' }];
    expect(parseAgentEditLedger(['broken', ...invalid.map((v) => JSON.stringify(v)), JSON.stringify(entry), ''].join('\n'))).toEqual([entry]);
    expect(parseAgentEditLedger('')).toEqual([]);
  });
  it('logs failures with the ledger path and cause without throwing', async () => {
    const file = path.join(dir, 'file');
    await fs.writeFile(file, 'occupied');
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(appendAgentEdit(file, entry)).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(
        `[mcp-markdown] agent edit ledger append failed: ${resolveAgentEditLedgerPath(file)}`,
        expect.objectContaining({ code: 'ENOTDIR', message: expect.any(String) }),
      );
    } finally { error.mockRestore(); }
  });
});
