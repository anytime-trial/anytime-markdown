// Flight Record 指示台帳の直書きが memory-core.db 上で成立することの検証
// （2026-08-07 の trail.db → memory-core.db 移設に追随）。
// mkdtempSync の一時ディレクトリに memory-core.db を作り、本番 DB へ触れない。

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { openMemoryDb, type OpenedDb } from '../openDb';
import {
  closeInstructionDirect,
  continueInstructionDirect,
  listOpenInstructionsDirect,
  openInstructionDirect,
} from '../instructions';

describe('openMemoryDb', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-trail-memory-db-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('ファイル不在は readwrite でも throw する（fail-closed。空 DB を黙って作らない）', async () => {
    const missing = path.join(tempDir, 'memory-core.db');
    await expect(openMemoryDb(missing, 'readwrite')).rejects.toThrow('memory-core.db not found');
    expect(fs.existsSync(missing)).toBe(false);
  });

  it('readonly でファイル不在は throw する', async () => {
    await expect(openMemoryDb(path.join(tempDir, 'memory-core.db'), 'readonly')).rejects.toThrow(
      'memory-core.db not found',
    );
  });
});

describe('instructions direct write on memory-core.db', () => {
  let tempDir: string;
  let dbPath: string;
  let opened: OpenedDb;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-trail-memory-db-'));
    dbPath = path.join(tempDir, 'memory-core.db');
    // 実運用では拡張が memory-core.db を作る。テストでは空ファイルを先に置く
    // （openMemoryDb は fail-closed で自分では作らないため）。
    fs.writeFileSync(dbPath, '');
    opened = await openMemoryDb(dbPath, 'readwrite');
  });

  afterEach(() => {
    opened.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('new → list → continue → close の round trip が成立する', () => {
    const declared = openInstructionDirect(opened.db, {
      sessionId: 'sess-1',
      summary: 'テスト指示',
      originPrompt: 'やって',
      workspacePath: '/ws',
    });
    expect(declared.instructionId).toBeTruthy();
    expect(declared.sequence).toBe(1);

    const open1 = listOpenInstructionsDirect(opened.db, '/ws', 10);
    expect(open1).toHaveLength(1);
    expect(open1[0]?.summary).toBe('テスト指示');
    expect(open1[0]?.sessionCount).toBe(1);

    const continued = continueInstructionDirect(opened.db, {
      sessionId: 'sess-2',
      instructionId: declared.instructionId,
      workspacePath: '/ws',
    });
    expect(continued.sequence).toBe(2);

    const closed = closeInstructionDirect(opened.db, declared.instructionId);
    expect(closed.instructionId).toBe(declared.instructionId);
    expect(listOpenInstructionsDirect(opened.db, '/ws', 10)).toHaveLength(0);
  });

  it('別ワークスペースの指示への継続宣言は拒否される', () => {
    const declared = openInstructionDirect(opened.db, {
      sessionId: 'sess-1',
      summary: 'ws A の指示',
      workspacePath: '/ws-a',
    });
    expect(() =>
      continueInstructionDirect(opened.db, {
        sessionId: 'sess-2',
        instructionId: declared.instructionId,
        workspacePath: '/ws-b',
      }),
    ).toThrow();
  });
});
