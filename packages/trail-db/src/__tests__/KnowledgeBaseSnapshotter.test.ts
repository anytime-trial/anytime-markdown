import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { noopDbLogger } from '../DbLogger';
import { FileKnowledgeBaseSnapshotter } from '../KnowledgeBaseSnapshotter';

describe('FileKnowledgeBaseSnapshotter', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-snapshotter-'));
    dbPath = path.join(dir, 'trail.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('snapshotBeforeDestructiveWrite が書込前状態を trail.db.kb.1.gz へ退避する', () => {
    fs.writeFileSync(dbPath, 'before-bytes');
    const s = new FileKnowledgeBaseSnapshotter(dbPath, noopDbLogger);
    const r = s.snapshotBeforeDestructiveWrite('current_code_graphs');

    expect(r.created).toBe(true);
    const kbPath = `${dbPath}.kb.1.gz`;
    expect(fs.existsSync(kbPath)).toBe(true);
    expect(zlib.gunzipSync(fs.readFileSync(kbPath)).toString()).toBe('before-bytes');
    // 起動時バックアップの系列（.bak）には触れない
    expect(fs.existsSync(`${dbPath}.bak.1.gz`)).toBe(false);
  });

  it('直近スナップショットからデバウンス間隔未満の再呼び出しは skip する', () => {
    fs.writeFileSync(dbPath, 'v1');
    const s = new FileKnowledgeBaseSnapshotter(dbPath, noopDbLogger);
    expect(s.snapshotBeforeDestructiveWrite('current_graphs').created).toBe(true);
    fs.writeFileSync(dbPath, 'v2');
    expect(s.snapshotBeforeDestructiveWrite('current_code_graphs').created).toBe(false);
    expect(fs.existsSync(`${dbPath}.kb.2.gz`)).toBe(false);
  });

  it('restoreSnapshot が書込前の内容へ戻し、safety copy を残す', () => {
    fs.writeFileSync(dbPath, 'original');
    const s = new FileKnowledgeBaseSnapshotter(dbPath, noopDbLogger);
    s.snapshotBeforeDestructiveWrite('current_code_graphs');
    fs.writeFileSync(dbPath, 'shrunk');

    const result = s.restoreSnapshot(1);
    expect(fs.readFileSync(dbPath).toString()).toBe('original');
    expect(result.safetyCopy).not.toBeNull();
    expect(fs.readFileSync(result.safetyCopy as string).toString()).toBe('shrunk');
  });

  it('listSnapshots が世代情報を返す', () => {
    fs.writeFileSync(dbPath, 'v1');
    const s = new FileKnowledgeBaseSnapshotter(dbPath, noopDbLogger);
    s.snapshotBeforeDestructiveWrite('release_code_graphs');

    const entries = s.listSnapshots();
    expect(entries).toHaveLength(1);
    expect(entries[0].generation).toBe(1);
    expect(entries[0].path).toBe(`${dbPath}.kb.1.gz`);
    expect(entries[0].compressedSize).toBeGreaterThan(0);
  });

  it('DB ファイル不在でも throw しない（fail-open）', () => {
    const s = new FileKnowledgeBaseSnapshotter(path.join(dir, 'missing.db'), noopDbLogger);
    expect(() => s.snapshotBeforeDestructiveWrite('current_graphs')).not.toThrow();
  });

  it('存在しない世代の restoreSnapshot は throw する', () => {
    fs.writeFileSync(dbPath, 'v1');
    const s = new FileKnowledgeBaseSnapshotter(dbPath, noopDbLogger);
    expect(() => s.restoreSnapshot(1)).toThrow(/Backup not found/);
  });
});
