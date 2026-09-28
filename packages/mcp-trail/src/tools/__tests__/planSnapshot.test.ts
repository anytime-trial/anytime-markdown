// record_plan_snapshot / verify_plan_snapshot（共用 UI 優先 3・FR-11/12）。
// 一時ワークスペースに caravan-book.db を作り、本番 DB へ触れない。
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { handleRecordPlanSnapshot, handleVerifyPlanSnapshot } from '../planSnapshot';
import { ensureInstructionTables, openInstructionDirect } from '../../sqlite/instructions';

function createWorkspace(): { root: string; planPath: string; cleanup(): void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-trail-plan-snapshot-'));
  const dbDir = path.join(root, '.anytime', 'trail', 'db');
  fs.mkdirSync(dbDir, { recursive: true });
  const db = new BetterSqlite3(path.join(dbDir, 'caravan-book.db'));
  ensureInstructionTables(db);
  openInstructionDirect(db, { sessionId: 'sess-1', summary: '優先 3', originPrompt: '優先 3 に着手して', workspacePath: root });
  db.close();
  const planPath = path.join(root, 'plan.md');
  fs.writeFileSync(planPath, '# 計画\n\n## タスク\n\n### T1\n\n- [ ] A\n\n### T2\n\n- [ ] B\n', 'utf8');
  return { root, planPath, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

describe('plan snapshot tools', () => {
  let ws: ReturnType<typeof createWorkspace>;
  beforeEach(() => {
    ws = createWorkspace();
  });
  afterEach(() => {
    ws.cleanup();
  });

  it('未記録の照合は recorded=false', async () => {
    const result = await handleVerifyPlanSnapshot({ plan_path: ws.planPath, workspacePath: ws.root });
    expect(result).toEqual({ recorded: false, planPath: ws.planPath });
  });

  it('記録はセッションの指示 ID を解決し、改変後の照合が changed / added を返す', async () => {
    const recorded = await handleRecordPlanSnapshot({ plan_path: ws.planPath, session_id: 'sess-1', workspacePath: ws.root });
    expect(recorded.instructionId).not.toBeNull();
    expect(recorded.sectionCount).toBe(4);

    const same = await handleVerifyPlanSnapshot({ plan_path: ws.planPath, workspacePath: ws.root });
    expect(same).toMatchObject({ recorded: true, changed: [], removed: [], added: [], unchanged: 4 });

    fs.writeFileSync(ws.planPath, '# 計画\n\n## タスク\n\n### T1\n\n- [x] A（人間が変更）\n\n### T2\n\n- [ ] B\n\n### T3\n\n新規\n', 'utf8');
    const diff = await handleVerifyPlanSnapshot({ plan_path: ws.planPath, workspacePath: ws.root });
    expect(diff).toMatchObject({
      recorded: true,
      instructionId: recorded.instructionId,
      changed: [{ heading: '### T1', occurrence: 1 }],
      removed: [],
      added: [{ heading: '### T3', occurrence: 1 }],
      unchanged: 3,
    });
  });

  it('相対パスはワークスペース基準で解決し、未宣言セッションの指示 ID は null', async () => {
    const recorded = await handleRecordPlanSnapshot({ plan_path: 'plan.md', session_id: 'sess-none', workspacePath: ws.root });
    expect(recorded.planPath).toBe(ws.planPath);
    expect(recorded.instructionId).toBeNull();
  });
});
