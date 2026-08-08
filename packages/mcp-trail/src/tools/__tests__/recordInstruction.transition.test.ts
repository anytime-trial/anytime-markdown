// Flight Record 台帳移設（activity.db → caravan-book.db・2026-08-07）の過渡期リグレッション。
//
// 退行の実測（2026-08-07・/mcp reconnect 直後）: 移行前の caravan-book.db（台帳テーブル未作成）
// に対して list_open_instructions が「attempt to write a readonly database」で失敗した。
// 原因は読み取り経路の listOpenInstructionsDirect が ensureTables（CREATE TABLE）を呼ぶこと。
// activity.db 時代はテーブルが常在し IF NOT EXISTS が無書き込みで素通りしていたため露見しなかった。
//
// 本テストは (a) readonly 読みがテーブル不在で落ちず、activity.db 残存分を union で返すこと、
// (b) 書き込み（record_instruction）が遅延移行で旧台帳を回収し、旧指示への continue が
// 成立することを固定する。

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { handleListOpenInstructions, handleRecordInstruction } from '../recordInstruction';
import { ensureInstructionTables, openInstructionDirect } from '../../sqlite/instructions';

/** 一時ワークスペース（<root>/.anytime/trail/db/{activity.db, caravan-book.db}）を作る。 */
function createTransitionWorkspace(): { root: string; dbDir: string; cleanup(): void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-trail-transition-'));
  const dbDir = path.join(root, '.anytime', 'trail', 'db');
  fs.mkdirSync(dbDir, { recursive: true });
  // 旧配置: activity.db に台帳があり、未完了の旧指示が 1 件残っている
  const trail = new BetterSqlite3(path.join(dbDir, 'activity.db'));
  trail.pragma('foreign_keys = OFF');
  ensureInstructionTables(trail);
  openInstructionDirect(trail, {
    sessionId: 'sess-old',
    summary: '移行前の旧指示',
    originPrompt: '古い依頼',
    workspacePath: root,
  });
  // ensure は接頭辞移行後の新名で作るため、旧配置の activity.db を再現するには
  // 投入後にレガシー名へ戻す（歴史時点の DDL の書き写しを避ける）
  trail.exec('ALTER TABLE caravan_instruction_sessions RENAME TO instruction_sessions');
  trail.exec('ALTER TABLE caravan_instructions RENAME TO instructions');
  trail.close();
  // 新配置: caravan-book.db は実在するが台帳テーブルはまだ無い（拡張の migration 前）
  const memory = new BetterSqlite3(path.join(dbDir, 'caravan-book.db'));
  memory.close();
  return {
    root,
    dbDir,
    cleanup(): void {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('Flight Record 台帳の移設過渡期', () => {
  let ws: ReturnType<typeof createTransitionWorkspace>;

  beforeEach(() => {
    ws = createTransitionWorkspace();
  });

  afterEach(() => {
    ws.cleanup();
  });

  it('list_open_instructions はテーブル未作成の caravan-book.db で落ちず、activity.db 残存分を返す', async () => {
    const { instructions } = await handleListOpenInstructions({ workspacePath: ws.root });
    expect(instructions).toHaveLength(1);
    expect(instructions[0]?.summary).toBe('移行前の旧指示');
  });

  it('record_instruction (new) が遅延移行で旧台帳を回収し、以後は caravan-book.db だけで完結する', async () => {
    const declared = await handleRecordInstruction({
      mode: 'new',
      session_id: 'sess-new',
      summary: '移行後の新指示',
      workspacePath: ws.root,
    });
    expect('sequence' in declared && declared.sequence).toBe(1);

    // activity.db 側の生テーブルは回収され、退避テーブルが残る
    const trail = new BetterSqlite3(path.join(ws.dbDir, 'activity.db'), { readonly: true });
    try {
      const names = (
        trail
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'instruction%' ORDER BY name`)
          .all() as Array<{ name: string }>
      ).map((r) => r.name);
      expect(names).toEqual(['instruction_sessions__pre_move_backup', 'instructions__pre_move_backup']);
    } finally {
      trail.close();
    }

    // 旧指示・新指示の両方が caravan-book.db から見える
    const { instructions } = await handleListOpenInstructions({ workspacePath: ws.root });
    const summaries = instructions.map((i) => i.summary).sort();
    expect(summaries).toEqual(['移行前の旧指示', '移行後の新指示']);
  });

  it('コピーできない行が残ると DROP せず verification_failed（非破壊）', async () => {
    // CHECK 制約の無い自作 DDL で「新スキーマへコピーできない行」を trail 側に作る
    // （INSERT OR IGNORE は CHECK 違反を黙って捨てる — その黙殺をアンチ結合検証が捕まえること）
    const trail = new BetterSqlite3(path.join(ws.dbDir, 'activity.db'));
    trail.exec(`DROP TABLE instruction_sessions`);
    trail.exec(`DROP TABLE instructions`);
    trail.exec(`CREATE TABLE instructions (
      id TEXT PRIMARY KEY, workspace_path TEXT NOT NULL DEFAULT '', workspace_name TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '', origin_prompt TEXT NOT NULL DEFAULT '', origin_session_id TEXT NOT NULL,
      started_at TEXT NOT NULL, closed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    // started_at が新スキーマの TS GLOB CHECK に合わない行
    trail
      .prepare(
        `INSERT INTO instructions (id, origin_session_id, started_at, created_at, updated_at)
         VALUES ('bad-1', 's', 'not-a-timestamp', 'x', 'y')`,
      )
      .run();
    trail.close();

    await handleRecordInstruction({
      mode: 'new',
      session_id: 'sess-new',
      summary: '移行トリガ',
      workspacePath: ws.root,
    });

    // 非破壊: trail 側の生テーブルが残る（宣言そのものは成功している）
    const check = new BetterSqlite3(path.join(ws.dbDir, 'activity.db'), { readonly: true });
    try {
      const names = (
        check
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = 'instructions'`)
          .all() as Array<{ name: string }>
      ).map((r) => r.name);
      expect(names).toEqual(['instructions']);
    } finally {
      check.close();
    }
  });

  it('union の limit マージ: 両側に複数件あっても全体の started_at 上位 N を返す', async () => {
    // memory 側にも宣言を作る（trail 側の旧指示より新しい started_at になる）
    await handleRecordInstruction({
      mode: 'new',
      session_id: 'sess-new-a',
      summary: '新しい指示 A',
      workspacePath: ws.root,
    });
    // 移行済みなので trail 側は空。もう 1 件追加して limit=1 で最新のみが返ること
    // （started_at は ms 精度のため、同一 ms での順序不定を避けて 5ms 空ける）
    await new Promise((resolve) => setTimeout(resolve, 5));
    await handleRecordInstruction({
      mode: 'new',
      session_id: 'sess-new-b',
      summary: '新しい指示 B',
      workspacePath: ws.root,
    });
    const { instructions } = await handleListOpenInstructions({ workspacePath: ws.root, limit: 1 });
    expect(instructions).toHaveLength(1);
    expect(instructions[0]?.summary).toBe('新しい指示 B');
  });

  it('移行後は activity.db に残っていた旧指示へ continue できる', async () => {
    // 書き込みが遅延移行を起こす
    await handleRecordInstruction({
      mode: 'new',
      session_id: 'sess-new',
      summary: '移行トリガ',
      workspacePath: ws.root,
    });
    const { instructions } = await handleListOpenInstructions({ workspacePath: ws.root });
    const old = instructions.find((i) => i.summary === '移行前の旧指示');
    expect(old).toBeDefined();

    const continued = await handleRecordInstruction({
      mode: 'continue',
      session_id: 'sess-continue',
      instruction_id: old?.id as string,
      workspacePath: ws.root,
    });
    expect('sequence' in continued && continued.sequence).toBe(2);
  });
});
