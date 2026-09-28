import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { openInstructionDirect } from '../../sqlite/instructions';
import { recordDoctrineJudgmentDirect } from '../../sqlite/doctrineJudgments';
import { handleListInstructionJudgments } from '../listInstructionJudgments';
describe('handleListInstructionJudgments', () => {
  let root: string;
  let dbPath: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'instruction-judgments-'));
    dbPath = path.join(root, '.anytime', 'trail', 'db', 'caravan-book.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
  it('returns summary and judgments without writing', async () => {
    const db = new BetterSqlite3(dbPath);
    const { instructionId } = openInstructionDirect(db, { sessionId: 's', summary: 'Requested work', originPrompt: 'Do work', workspacePath: root });
    recordDoctrineJudgmentDirect(db, { sessionId: 's', subject: 'scope', instructionId, judgment: 'approve', coverage: 'silent', citations: [], toolName: 'upload_doc', actionScope: 'Requested work' });
    db.close();
    const before = fs.readFileSync(dbPath);
    const result = await handleListInstructionJudgments({ instruction_id: instructionId, workspacePath: root });
    expect(result).toMatchObject({ instructionId, summary: 'Requested work', sourceErrors: [], judgments: [expect.objectContaining({ instructionId, toolName: 'upload_doc', actionScope: 'Requested work' })] });
    expect(fs.readFileSync(dbPath)).toEqual(before);
  });
  it('reports a missing database without creating it', async () => {
    const result = await handleListInstructionJudgments({ instruction_id: 'missing', workspacePath: root });
    expect(result.judgments).toEqual([]);
    expect(result.summary).toBeNull();
    expect(result.sourceErrors.join()).toContain('caravan-book.db');
    expect(fs.existsSync(dbPath)).toBe(false);
  });
  it('reports missing tables without migrating them', async () => {
    new BetterSqlite3(dbPath).close();
    const before = fs.readFileSync(dbPath);
    const result = await handleListInstructionJudgments({ instruction_id: 'missing', workspacePath: root });
    expect(result.judgments).toEqual([]);
    expect(result.summary).toBeNull();
    expect(result.sourceErrors.join()).toContain('caravan_doctrine_judgments');
    expect(fs.readFileSync(dbPath)).toEqual(before);
  });
});
