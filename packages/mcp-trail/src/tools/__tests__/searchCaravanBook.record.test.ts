import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openCaravanBookDb } from '@anytime-markdown/trail-caravan-book/query';
import { recordAgentSearchEvent, AGENT_SEARCH_HIT_CAP } from '../searchCaravanBook';

/**
 * エージェント照会の記録（screen spec §2.5）。記録は fail-open だが、毎回失敗すると
 * 恒久欠落になるため、成功経路は件数 assert まで行う（INSERT OR IGNORE 型の
 * 「静かに 0 件」を検知する）。
 */
describe('recordAgentSearchEvent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-agent-rec-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('kind=search・source=agent・ヒット ID JSON 付きで 1 行記録する', async () => {
    const handle = await openCaravanBookDb(path.join(tmpDir, 'caravan-book.db'));
    try {
      const ok = recordAgentSearchEvent(handle.db, {
        query: 'blockAlignment',
        hitEntityIds: ['e1', 'e2', 'e3'],
      });
      expect(ok).toBe(true);
      const rows = handle.db
        .prepare(
          `SELECT kind, query, result_count, source, hit_entity_ids FROM caravan_search_events`,
        )
        .all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        kind: 'search',
        query: 'blockAlignment',
        result_count: 3,
        source: 'agent',
        hit_entity_ids: JSON.stringify(['e1', 'e2', 'e3']),
      });
    } finally {
      handle.close();
    }
  });

  it('ヒット ID は上限で打ち切り、result_count は打ち切り前の件数を保つ', async () => {
    const handle = await openCaravanBookDb(path.join(tmpDir, 'caravan-book.db'));
    try {
      const many = Array.from({ length: AGENT_SEARCH_HIT_CAP + 5 }, (_, i) => `e${i}`);
      expect(recordAgentSearchEvent(handle.db, { query: 'q', hitEntityIds: many })).toBe(true);
      const row = handle.db
        .prepare(`SELECT result_count, hit_entity_ids FROM caravan_search_events`)
        .all()[0];
      expect(row?.['result_count']).toBe(AGENT_SEARCH_HIT_CAP + 5);
      const stored = JSON.parse(String(row?.['hit_entity_ids'])) as string[];
      expect(stored).toHaveLength(AGENT_SEARCH_HIT_CAP);
    } finally {
      handle.close();
    }
  });

  it('記録失敗は throw せず false を返す（fail-open）', () => {
    const broken = {
      run(): void {
        throw new Error('db is closed');
      },
    };
    expect(recordAgentSearchEvent(broken, { query: 'q', hitEntityIds: [] })).toBe(false);
  });
});
