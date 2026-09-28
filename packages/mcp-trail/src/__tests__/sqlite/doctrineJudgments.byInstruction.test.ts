import BetterSqlite3 from 'better-sqlite3';
import { ensureDoctrineJudgmentsTable, recordDoctrineJudgmentDirect, listDoctrineJudgmentsByInstruction, listDoctrineJudgmentsBySession } from '../../sqlite/doctrineJudgments';
describe('listDoctrineJudgmentsByInstruction', () => {
  let db: BetterSqlite3.Database;
  beforeEach(() => { db = new BetterSqlite3(':memory:'); });
  afterEach(() => { db.close(); });
  it('filters instructions, orders by time and id, and returns metadata', () => {
    ensureDoctrineJudgmentsTable(db);
    for (const [subject, instructionId, judgedAt] of [
      ['later', 'i-1', '2026-09-28T02:00:00.000Z'], ['earlier', 'i-1', '2026-09-28T01:00:00.000Z'],
      ['other', 'i-2', '2026-09-28T00:00:00.000Z'], ['none', null, '2026-09-28T00:00:00.000Z'],
    ] as const) recordDoctrineJudgmentDirect(db, { sessionId: 's', subject, instructionId, judgedAt,
      judgment: 'approve', coverage: 'silent', citations: [], toolName: 'upload_doc', actionScope: 'Requested work' });
    const rows = listDoctrineJudgmentsByInstruction(db, 'i-1');
    expect(rows.map(row => row.subject)).toEqual(['earlier', 'later']);
    for (const row of rows) expect(row).toMatchObject({ instructionId: 'i-1', toolName: 'upload_doc', actionScope: 'Requested work' });
    db.prepare('UPDATE caravan_doctrine_judgments SET judged_at = ?').run('2026-09-28T00:00:00.000Z');
    expect(listDoctrineJudgmentsByInstruction(db, 'i-1').map(row => row.id)).toEqual([rows[1].id, rows[0].id]);
  });
  it('returns empty for a missing table', () => {
    expect(listDoctrineJudgmentsByInstruction(db, 'i-1')).toEqual([]);
  });
  it('supports legacy tables without adding columns', () => {
    ensureDoctrineJudgmentsTable(db);
    recordDoctrineJudgmentDirect(db, { sessionId: 's', subject: 'legacy', judgment: 'approve', coverage: 'silent', citations: [] });
    for (const column of ['instruction_id', 'tool_name', 'action_scope']) db.exec('ALTER TABLE caravan_doctrine_judgments DROP COLUMN ' + column);
    expect(listDoctrineJudgmentsByInstruction(db, 'i-1')).toEqual([]);
    expect(listDoctrineJudgmentsBySession(db, 's')[0]).toMatchObject({ instructionId: null, toolName: null, actionScope: null });
  });
});
