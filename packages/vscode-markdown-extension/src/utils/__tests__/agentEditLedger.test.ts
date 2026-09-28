import * as path from 'node:path';
import {
  AGENT_EDIT_LEDGER_RELATIVE_PATH,
  findAgentEditLedger,
  parseAgentEditLedger,
  selectAgentEditTargets,
} from '../agentEditLedger';

describe('findAgentEditLedger', () => {
  it('文書の祖先ディレクトリを辿って最初の台帳を返す', () => {
    const root = path.resolve('/ws/docs');
    const ledger = path.join(root, AGENT_EDIT_LEDGER_RELATIVE_PATH);
    const found = findAgentEditLedger(path.join(root, 'spec', 'a', 'b.md'), (p) => p === ledger);
    expect(found).toEqual({ ledgerPath: ledger, rootDir: root });
  });

  it('どの祖先にも無ければ null', () => {
    expect(findAgentEditLedger('/ws/docs/a.md', () => false)).toBeNull();
  });
});

describe('parseAgentEditLedger', () => {
  it('正常行を読み、破損行・必須キー欠落行を読み飛ばす', () => {
    const text = [
      '{"at":"2026-09-28T10:00:00.000Z","path":"spec/a.md","tool":"update_section","heading":"## A"}',
      'not json',
      '{"at":"2026-09-28T10:01:00.000Z","path":"spec/a.md"}',
      '',
      '{"at":"2026-09-28T10:02:00.000Z","path":"spec/a.md","tool":"update_frontmatter","heading":null}',
    ].join('\n');
    const entries = parseAgentEditLedger(text);
    expect(entries).toHaveLength(2);
    expect(entries[0].heading).toBe('## A');
    expect(entries[1].heading).toBeNull();
  });
});

describe('selectAgentEditTargets', () => {
  const rootDir = path.resolve('/ws/docs');
  const documentFsPath = path.join(rootDir, 'spec', 'a.md');
  const entries = parseAgentEditLedger(
    [
      '{"at":"2026-09-28T09:00:00.000Z","path":"spec/a.md","tool":"update_section","heading":"## Old"}',
      '{"at":"2026-09-28T10:00:00.000Z","path":"spec/a.md","tool":"update_section","heading":"## A"}',
      '{"at":"2026-09-28T10:01:00.000Z","path":"spec/a.md","tool":"update_section","heading":"## A"}',
      '{"at":"2026-09-28T10:02:00.000Z","path":"spec/a.md","tool":"update_section","heading":"## B","occurrence":2}',
      '{"at":"2026-09-28T10:03:00.000Z","path":"spec/other.md","tool":"update_section","heading":"## C"}',
      '{"at":"2026-09-28T10:04:00.000Z","path":"spec/a.md","tool":"update_frontmatter","heading":null}',
    ].join('\n'),
  );

  it('since より後・同一文書のエントリだけを、見出し＋出現順で畳んで返す', () => {
    const result = selectAgentEditTargets(entries, {
      rootDir,
      documentFsPath,
      since: '2026-09-28T09:30:00.000Z',
    });
    expect(result.targets).toEqual([{ heading: '## A' }, { heading: '## B', occurrence: 2 }]);
    // frontmatter 編集は節の対象にならないが、最新時刻には数える
    expect(result.latestAt).toBe('2026-09-28T10:04:00.000Z');
  });

  it('該当が無ければ空と null', () => {
    const result = selectAgentEditTargets(entries, {
      rootDir,
      documentFsPath,
      since: '2026-09-28T11:00:00.000Z',
    });
    expect(result).toEqual({ targets: [], latestAt: null });
  });

  it('台帳の相対パスは rootDir 基準で文書パスと突合する', () => {
    const result = selectAgentEditTargets(entries, {
      rootDir,
      documentFsPath: path.join(rootDir, 'spec', 'other.md'),
      since: '2026-09-28T00:00:00.000Z',
    });
    expect(result.targets).toEqual([{ heading: '## C' }]);
  });
});
