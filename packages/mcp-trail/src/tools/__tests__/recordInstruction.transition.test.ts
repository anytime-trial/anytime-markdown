// Flight Record 台帳移設（trail.db → memory-core.db・2026-08-07）の過渡期リグレッション。
//
// 退行の実測（2026-08-07・/mcp reconnect 直後）: 移行前の memory-core.db（台帳テーブル未作成）
// に対して list_open_instructions が「attempt to write a readonly database」で失敗した。
// 原因は読み取り経路の listOpenInstructionsDirect が ensureTables（CREATE TABLE）を呼ぶこと。
// trail.db 時代はテーブルが常在し IF NOT EXISTS が無書き込みで素通りしていたため露見しなかった。
//
// 本テストは (a) readonly 読みがテーブル不在で落ちず、trail.db 残存分を union で返すこと、
// (b) 書き込み（record_instruction）が遅延移行で旧台帳を回収し、旧指示への continue が
// 成立することを固定する。

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { handleListOpenInstructions, handleRecordInstruction } from '../recordInstruction';
import { ensureInstructionTables, openInstructionDirect } from '../../sqlite/instructions';

/** 一時ワークスペース（<root>/.anytime/trail/db/{trail.db, memory-core.db}）を作る。 */
function createTransitionWorkspace(): { root: string; dbDir: string; cleanup(): void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-trail-transition-'));
  const dbDir = path.join(root, '.anytime', 'trail', 'db');
  fs.mkdirSync(dbDir, { recursive: true });
  // 旧配置: trail.db に台帳があり、未完了の旧指示が 1 件残っている
  const trail = new BetterSqlite3(path.join(dbDir, 'trail.db'));
  trail.pragma('foreign_keys = OFF');
  ensureInstructionTables(trail);
  openInstructionDirect(trail, {
    sessionId: 'sess-old',
    summary: '移行前の旧指示',
    originPrompt: '古い依頼',
    workspacePath: root,
  });
  trail.close();
  // 新配置: memory-core.db は実在するが台帳テーブルはまだ無い（拡張の migration 前）
  const memory = new BetterSqlite3(path.join(dbDir, 'memory-core.db'));
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

  it('list_open_instructions はテーブル未作成の memory-core.db で落ちず、trail.db 残存分を返す', async () => {
    const { instructions } = await handleListOpenInstructions({ workspacePath: ws.root });
    expect(instructions).toHaveLength(1);
    expect(instructions[0]?.summary).toBe('移行前の旧指示');
  });

  it('record_instruction (new) が遅延移行で旧台帳を回収し、以後は memory-core.db だけで完結する', async () => {
    const declared = await handleRecordInstruction({
      mode: 'new',
      session_id: 'sess-new',
      summary: '移行後の新指示',
      workspacePath: ws.root,
    });
    expect('sequence' in declared && declared.sequence).toBe(1);

    // trail.db 側の生テーブルは回収され、退避テーブルが残る
    const trail = new BetterSqlite3(path.join(ws.dbDir, 'trail.db'), { readonly: true });
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

    // 旧指示・新指示の両方が memory-core.db から見える
    const { instructions } = await handleListOpenInstructions({ workspacePath: ws.root });
    const summaries = instructions.map((i) => i.summary).sort();
    expect(summaries).toEqual(['移行前の旧指示', '移行後の新指示']);
  });

  it('移行後は trail.db に残っていた旧指示へ continue できる', async () => {
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
