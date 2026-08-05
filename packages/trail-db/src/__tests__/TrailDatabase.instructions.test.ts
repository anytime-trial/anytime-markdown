// Flight Record: 指示台帳（instructions / instruction_sessions）と指示単位の一覧の外部仕様。

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';

function rawRun(db: TrailDatabase, sql: string, params: unknown[] = []): void {
  const inner = (db as unknown as { ensureDb(): { run(sql: string, params?: unknown[]): void } }).ensureDb();
  inner.run(sql, params);
}

function machineInput(sessionId: string, endedAt: string, overrides: Record<string, unknown> = {}) {
  return {
    sessionId,
    workspacePath: '/anytime-markdown',
    startedAt: null,
    endedAt,
    durationSeconds: 600,
    toolCallCount: 5,
    toolFailureCount: 1,
    reworkCount: 0,
    ...overrides,
  } as Parameters<TrailDatabase['upsertFlightReviewFromMachine']>[0];
}

function openInput(id: string, sessionId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    sessionId,
    workspacePath: '/anytime-markdown',
    workspaceName: 'anytime-markdown',
    summary: 'Flight Record を作る',
    originPrompt: 'Flight Review を指示単位にして',
    startedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  } as Parameters<TrailDatabase['openInstruction']>[0];
}

describe('TrailDatabase instructions (Flight Record)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  describe('宣言の記録', () => {
    it('新規指示は起点セッションを sequence=1 で紐付ける', () => {
      db.openInstruction(openInput('inst-1', 's1'));

      const sessions = db.listInstructionSessions('inst-1');
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.sessionId).toBe('s1');
      expect(sessions[0]?.sequence).toBe(1);
    });

    it('継続宣言はセッションを既存指示へ追番で足す', () => {
      db.openInstruction(openInput('inst-1', 's1'));

      const ok = db.continueInstruction({
        instructionId: 'inst-1',
        sessionId: 's2',
        declaredAt: '2026-08-05T02:00:00.000Z',
      });

      expect(ok).toBe(true);
      expect(db.listInstructionSessions('inst-1').map((s) => s.sessionId)).toEqual(['s1', 's2']);
    });

    it('存在しない指示への継続宣言は false を返し、何も書かない', () => {
      const ok = db.continueInstruction({
        instructionId: 'missing',
        sessionId: 's2',
        declaredAt: '2026-08-05T02:00:00.000Z',
      });

      expect(ok).toBe(false);
      expect(db.listInstructionSessions('missing')).toHaveLength(0);
    });

    it('ワークスペースをまたぐ継続宣言は拒否する', () => {
      db.openInstruction(openInput('inst-other', 's1', { workspacePath: '/anytime-trade' }));

      const ok = db.continueInstruction({
        instructionId: 'inst-other',
        sessionId: 's2',
        declaredAt: '2026-08-05T02:00:00.000Z',
        workspacePath: '/anytime-markdown',
      });

      expect(ok).toBe(false);
      expect(db.listInstructionSessions('inst-other').map((s) => s.sessionId)).toEqual(['s1']);
    });

    it('1 セッションは 1 指示にしか属さない（所属替えは上書き）', () => {
      db.openInstruction(openInput('inst-1', 's1'));
      db.openInstruction(openInput('inst-2', 's2', { summary: '別の指示' }));

      db.continueInstruction({ instructionId: 'inst-2', sessionId: 's1', declaredAt: '2026-08-05T03:00:00.000Z' });

      expect(db.listInstructionSessions('inst-1')).toHaveLength(0);
      expect(db.listInstructionSessions('inst-2').map((s) => s.sessionId)).toEqual(['s2', 's1']);
    });

    it('同一 id の再宣言は既存の指示を上書きしない', () => {
      db.openInstruction(openInput('inst-1', 's1'));
      db.openInstruction(openInput('inst-1', 's1', { summary: '書き換えられた概要' }));

      const records = db.listInstructionRecords();
      expect(records.find((r) => r.instructionId === 'inst-1')?.summary).toBe('Flight Record を作る');
    });
  });

  describe('未完了指示（継続宣言の候補）', () => {
    it('closed_at が未設定の指示だけを返す', () => {
      db.openInstruction(openInput('inst-open', 's1'));
      db.openInstruction(openInput('inst-done', 's2'));
      db.closeInstruction('inst-done', '2026-08-05T05:00:00.000Z');

      const open = db.listOpenInstructions('/anytime-markdown');
      expect(open.map((i) => i.id)).toEqual(['inst-open']);
    });

    it('ワークスペースが違う指示は候補に出ない', () => {
      db.openInstruction(openInput('inst-a', 's1'));
      db.openInstruction(openInput('inst-b', 's2', { workspacePath: '/anytime-trade' }));

      expect(db.listOpenInstructions('/anytime-trade').map((i) => i.id)).toEqual(['inst-b']);
    });

    it('存在しない指示の完了宣言は false', () => {
      expect(db.closeInstruction('missing', '2026-08-05T05:00:00.000Z')).toBe(false);
    });
  });

  describe('指示単位の一覧', () => {
    it('複数セッションを 1 行へ畳み、時間と件数を合算する', () => {
      db.upsertFlightReviewFromMachine(machineInput('s1', '2026-08-05T01:00:00.000Z', { durationSeconds: 600, toolFailureCount: 1 }));
      db.upsertFlightReviewFromMachine(machineInput('s2', '2026-08-05T04:00:00.000Z', { durationSeconds: 1200, toolFailureCount: 2 }));
      db.openInstruction(openInput('inst-1', 's1'));
      db.continueInstruction({ instructionId: 'inst-1', sessionId: 's2', declaredAt: '2026-08-05T02:00:00.000Z' });

      const records = db.listInstructionRecords();
      expect(records).toHaveLength(1);
      const record = records[0];
      expect(record?.instructionId).toBe('inst-1');
      expect(record?.sessionCount).toBe(2);
      expect(record?.durationSeconds).toBe(1800);
      expect(record?.toolFailureCount).toBe(3);
      expect(record?.endedAt).toBe('2026-08-05T04:00:00.000Z');
      expect(record?.workspaceName).toBe('anytime-markdown');
    });

    describe('ワークスペース名', () => {
      // flight_reviews.workspace_path はセッションの cwd 由来で、ワークスペース直下とは
      // 限らない（実測: /anytime-markdown/.anytime/trail/db → 基準名が 'db' になる）
      let wsRoot: string;

      beforeEach(() => {
        wsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-record-ws-'));
        fs.mkdirSync(path.join(wsRoot, '.git'), { recursive: true });
        fs.mkdirSync(path.join(wsRoot, '.anytime', 'trail', 'db'), { recursive: true });
      });

      afterEach(() => {
        fs.rmSync(wsRoot, { recursive: true, force: true });
      });

      it('cwd がワークスペース配下の深い階層でもワークスペース名を出す', () => {
        db.upsertFlightReviewFromMachine(
          machineInput('deep', '2026-08-05T01:00:00.000Z', {
            workspacePath: path.join(wsRoot, '.anytime', 'trail', 'db'),
          }),
        );

        const record = db.listInstructionRecords()[0];
        expect(record?.workspaceName).toBe(path.basename(wsRoot));
        // 記録値そのものは残す（原因を追えるように）
        expect(record?.workspacePath).toBe(path.join(wsRoot, '.anytime', 'trail', 'db'));
      });

      it('存在しないパスは記録値の基準名へ縮退する（推測で書き換えない）', () => {
        db.upsertFlightReviewFromMachine(
          machineInput('gone', '2026-08-05T01:00:00.000Z', { workspacePath: '/nonexistent/somewhere/deep' }),
        );

        expect(db.listInstructionRecords()[0]?.workspaceName).toBe('deep');
      });

      it('宣言済み指示も同じ規則でワークスペース名を揃える', () => {
        db.upsertFlightReviewFromMachine(
          machineInput('s1', '2026-08-05T01:00:00.000Z', { workspacePath: wsRoot }),
        );
        db.openInstruction(
          openInput('inst-1', 's1', {
            workspacePath: path.join(wsRoot, 'packages', 'trail-viewer'),
            workspaceName: 'trail-viewer',
          }),
        );

        expect(db.listInstructionRecords()[0]?.workspaceName).toBe(path.basename(wsRoot));
      });
    });

    it('宣言の無いセッションは 1 セッション = 1 指示の暗黙グループとして残る', () => {
      db.upsertFlightReviewFromMachine(machineInput('lonely', '2026-08-05T01:00:00.000Z'));

      const records = db.listInstructionRecords();
      expect(records).toHaveLength(1);
      expect(records[0]?.instructionId).toBe('lonely');
      expect(records[0]?.sessionCount).toBe(1);
      // 推測した見出しを人が書いた概要と同じ顔で出さない
      expect(records[0]?.summary).toBe('');
    });

    it('宣言済みセッションは暗黙グループとして二重に出ない', () => {
      db.upsertFlightReviewFromMachine(machineInput('s1', '2026-08-05T01:00:00.000Z'));
      db.upsertFlightReviewFromMachine(machineInput('s2', '2026-08-05T04:00:00.000Z'));
      db.openInstruction(openInput('inst-1', 's1'));
      db.continueInstruction({ instructionId: 'inst-1', sessionId: 's2', declaredAt: '2026-08-05T02:00:00.000Z' });

      expect(db.listInstructionRecords()).toHaveLength(1);
    });

    it('成否で絞り込むと指示単位の成否で判定する', () => {
      db.upsertFlightReviewFromMachine(machineInput('s1', '2026-08-05T01:00:00.000Z'));
      db.upsertFlightReviewFromMachine(machineInput('s2', '2026-08-05T04:00:00.000Z'));
      db.openInstruction(openInput('inst-1', 's1'));
      db.continueInstruction({ instructionId: 'inst-1', sessionId: 's2', declaredAt: '2026-08-05T02:00:00.000Z' });
      // 最終セッションだけ達成にすると、指示としては achieved になる
      db.updateFlightReviewManual('s2', { outcome: 'achieved' });

      expect(db.listInstructionRecords({ outcome: 'achieved' })).toHaveLength(1);
      expect(db.listInstructionRecords({ outcome: 'unachieved' })).toHaveLength(0);
    });

    it('進行中（記録がまだ無い指示）は末尾に回されず先頭へ出る', () => {
      // 走査窓を 1 件に絞っても、宣言直後の進行中指示が切り落とされないこと
      db.upsertFlightReviewFromMachine(machineInput('done', '2026-08-05T04:00:00.000Z'));
      db.openInstruction(openInput('inst-running', 'not-yet-recorded', { summary: '進行中の指示' }));

      const records = db.listInstructionRecords({ limit: 1 });
      expect(records).toHaveLength(1);
      expect(records[0]?.instructionId).toBe('inst-running');
      expect(records[0]?.endedAt).toBeNull();
    });

    it('走査窓から外れた古いセッションも所属メンバーとして合算する', () => {
      // 新しい記録を多数入れて古い s-old を「最新 N 件」から押し出す
      db.upsertFlightReviewFromMachine(machineInput('s-old', '2026-01-01T00:00:00.000Z', { durationSeconds: 600 }));
      // s-old より新しく s-new より古い記録で走査窓（scanLimit = limit * 10）を埋める
      for (let i = 0; i < 12; i += 1) {
        db.upsertFlightReviewFromMachine(machineInput(`noise-${i}`, `2026-07-${String(i + 10).padStart(2, '0')}T00:00:00.000Z`));
      }
      db.upsertFlightReviewFromMachine(machineInput('s-new', '2026-08-05T04:00:00.000Z', { durationSeconds: 1200 }));
      db.openInstruction(openInput('inst-1', 's-old'));
      db.continueInstruction({ instructionId: 'inst-1', sessionId: 's-new', declaredAt: '2026-08-05T02:00:00.000Z' });

      // limit=1 → scanLimit=10 で s-old は走査窓の外に落ちる
      const record = db.listInstructionRecords({ limit: 1 }).find((r) => r.instructionId === 'inst-1');
      expect(record?.sessionCount).toBe(2);
      // 欠落していれば 1200 になる（セッション数だけ正しく所要が小さい行）
      expect(record?.durationSeconds).toBe(1800);
    });

    it('ended_at 降順で並ぶ', () => {
      db.upsertFlightReviewFromMachine(machineInput('old', '2026-08-01T00:00:00.000Z'));
      db.upsertFlightReviewFromMachine(machineInput('new', '2026-08-05T00:00:00.000Z'));

      expect(db.listInstructionRecords().map((r) => r.instructionId)).toEqual(['new', 'old']);
    });
  });

  describe('トークン消費', () => {
    it('所属セッションの session_costs をモデル別に合算する', () => {
      db.upsertFlightReviewFromMachine(machineInput('s1', '2026-08-05T01:00:00.000Z'));
      db.upsertFlightReviewFromMachine(machineInput('s2', '2026-08-05T04:00:00.000Z'));
      db.openInstruction(openInput('inst-1', 's1'));
      db.continueInstruction({ instructionId: 'inst-1', sessionId: 's2', declaredAt: '2026-08-05T02:00:00.000Z' });
      rawRun(db, `INSERT INTO sessions (id) VALUES ('s1'), ('s2')`);
      rawRun(
        db,
        `INSERT INTO session_costs (session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
         VALUES ('s1', 'opus', 100, 200, 300, 400, 1.5), ('s2', 'opus', 10, 20, 30, 40, 0.5)`,
      );

      const record = db.listInstructionRecords()[0];
      expect(record?.tokenUsage.imported).toBe(true);
      expect(record?.tokenUsage.inputTokens).toBe(110);
      expect(record?.tokenUsage.outputTokens).toBe(220);
      expect(record?.tokenUsage.estimatedCostUsd).toBeCloseTo(2.0);
      expect(record?.tokenUsage.byModel).toHaveLength(1);
    });

    it('session_costs が無いセッションは imported=false（0 と区別する）', () => {
      db.upsertFlightReviewFromMachine(machineInput('s1', '2026-08-05T01:00:00.000Z'));

      const record = db.listInstructionRecords()[0];
      expect(record?.tokenUsage.imported).toBe(false);
      expect(record?.tokenUsage.inputTokens).toBe(0);
    });
  });

  describe('成果物', () => {
    beforeEach(() => {
      db.upsertFlightReviewFromMachine(machineInput('s1', '2026-08-05T01:00:00.000Z'));
      rawRun(db, `INSERT INTO sessions (id) VALUES ('s1')`);
    });

    it('コミット済みは .md をドキュメント、それ以外をコードに分ける', () => {
      rawRun(db, `INSERT INTO session_commits (session_id, commit_hash, repo_id) VALUES ('s1', 'abc1234567', 1)`);
      rawRun(
        db,
        `INSERT INTO commit_files (commit_hash, file_path, repo_id)
         VALUES ('abc1234567', 'spec/a.md', 1), ('abc1234567', 'src/b.ts', 1)`,
      );

      const deliverables = db.listInstructionRecords()[0]?.deliverables ?? [];
      const doc = deliverables.find((d) => d.filePath === 'spec/a.md');
      const code = deliverables.find((d) => d.filePath === 'src/b.ts');
      expect(doc?.kind).toBe('doc');
      expect(doc?.committed).toBe(true);
      expect(doc?.commitHash).toBe('abc12345');
      expect(code?.kind).toBe('code');
    });

    it('未コミットのドキュメントを Write / Edit の記録から拾う', () => {
      rawRun(
        db,
        `INSERT INTO messages (uuid, session_id, type, tool_calls)
         VALUES ('m1', 's1', 'assistant', '[{"name":"Write","input":{"file_path":"/ws/spec/new.md"}}]')`,
      );

      const deliverables = db.listInstructionRecords()[0]?.deliverables ?? [];
      const doc = deliverables.find((d) => d.filePath === '/ws/spec/new.md');
      expect(doc?.kind).toBe('doc');
      expect(doc?.committed).toBe(false);
    });

    it('serena / mcp-markdown 経由の未コミット編集も拾う（file_path 列には残らないため）', () => {
      rawRun(
        db,
        `INSERT INTO messages (uuid, session_id, type, tool_calls)
         VALUES ('m1', 's1', 'assistant', '[{"name":"mcp__serena__replace_content","input":{"relative_path":"docs/x.md"}}]'),
                ('m2', 's1', 'assistant', '[{"name":"mcp__mcp-markdown__update_section","input":{"path":"docs/y.md"}}]')`,
      );

      const paths = (db.listInstructionRecords()[0]?.deliverables ?? []).map((d) => d.filePath);
      expect(paths).toContain('docs/x.md');
      expect(paths).toContain('docs/y.md');
    });

    it('未コミットのコード編集は成果物に含めない（コードはコミット済みのみ）', () => {
      rawRun(
        db,
        `INSERT INTO messages (uuid, session_id, type, tool_calls)
         VALUES ('m1', 's1', 'assistant', '[{"name":"Edit","input":{"file_path":"src/draft.ts"}}]')`,
      );

      const paths = (db.listInstructionRecords()[0]?.deliverables ?? []).map((d) => d.filePath);
      expect(paths).not.toContain('src/draft.ts');
    });

    it('同一パスがコミット済みと未コミットの双方にあればコミット済みを採る', () => {
      rawRun(db, `INSERT INTO session_commits (session_id, commit_hash, repo_id) VALUES ('s1', 'abc1234567', 1)`);
      rawRun(db, `INSERT INTO commit_files (commit_hash, file_path, repo_id) VALUES ('abc1234567', 'spec/a.md', 1)`);
      rawRun(
        db,
        `INSERT INTO messages (uuid, session_id, type, tool_calls)
         VALUES ('m1', 's1', 'assistant', '[{"name":"Write","input":{"file_path":"spec/a.md"}}]')`,
      );

      const docs = (db.listInstructionRecords()[0]?.deliverables ?? []).filter((d) => d.filePath === 'spec/a.md');
      expect(docs).toHaveLength(1);
      expect(docs[0]?.committed).toBe(true);
    });

    it('コミットの相対パスとツール呼出の絶対パスが同じファイルなら 1 件に畳む', () => {
      // 実データではコミット側が repo 相対、ツール呼出側が絶対パスで残る
      rawRun(db, `INSERT INTO session_commits (session_id, commit_hash, repo_id) VALUES ('s1', 'abc1234567', 1)`);
      rawRun(db, `INSERT INTO commit_files (commit_hash, file_path, repo_id) VALUES ('abc1234567', 'spec/a.md', 1)`);
      rawRun(
        db,
        `INSERT INTO messages (uuid, session_id, type, tool_calls)
         VALUES ('m1', 's1', 'assistant', '[{"name":"Write","input":{"file_path":"/Shared/anytime-markdown-docs/spec/a.md"}}]')`,
      );

      const docs = (db.listInstructionRecords()[0]?.deliverables ?? []).filter((d) => d.kind === 'doc');
      expect(docs).toHaveLength(1);
      expect(docs[0]?.committed).toBe(true);
    });

    it('壊れた tool_calls の行があっても他の成果物を落とさない', () => {
      rawRun(
        db,
        `INSERT INTO messages (uuid, session_id, type, tool_calls)
         VALUES ('m1', 's1', 'assistant', 'not json'),
                ('m2', 's1', 'assistant', '[{"name":"Write","input":{"file_path":"spec/ok.md"}}]')`,
      );

      const paths = (db.listInstructionRecords()[0]?.deliverables ?? []).map((d) => d.filePath);
      expect(paths).toContain('spec/ok.md');
    });
  });
});
