import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { wireDocCoreRunner, type WiredDocCore } from '../docCoreRunner';

function writeDoc(root: string, rel: string, fm: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `---\n${fm}\n---\n\n${body}\n`, 'utf8');
}

describe('wireDocCoreRunner', () => {
  let dir: string;
  let dbPath: string;
  const wired: WiredDocCore[] = [];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-wire-'));
    dbPath = path.join(dir, 'db', 'doc-core.db');
    writeDoc(dir, 'spec/10.sample/sample.ja.md', 'title: sample\ncategory: sample', 'sample document body');
  });

  afterEach(() => {
    while (wired.length) wired.pop()?.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('docsRoot が空なら null を返し DB を作らない (既定オフ)', () => {
    const handle = wireDocCoreRunner({
      docsRoot: '   ',
      dbPath,
      schedulerEnabled: false,
      logSink: { appendLine: () => {} },
    });
    expect(handle).toBeNull();
    expect(fs.existsSync(dbPath)).toBe(false);
  });

  it('docsRoot 設定時はハンドルを返し doc-core.db を同期生成する', () => {
    const logs: string[] = [];
    const handle = wireDocCoreRunner({
      docsRoot: dir,
      dbPath,
      schedulerEnabled: false,
      logSink: { appendLine: (m) => logs.push(m) },
    });
    expect(handle).not.toBeNull();
    if (handle) wired.push(handle);
    // openDocDb は runOnce の最初の同期処理で走るため、戻り値時点で DB ファイルが存在する。
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(logs.some((l) => l.includes('runner wired'))).toBe(true);
  });

  it('dispose は二重呼び出しでも throw しない', () => {
    const handle = wireDocCoreRunner({
      docsRoot: dir,
      dbPath,
      schedulerEnabled: true,
      logSink: { appendLine: () => {} },
    });
    expect(handle).not.toBeNull();
    expect(() => {
      handle?.dispose();
      handle?.dispose();
    }).not.toThrow();
  });
});
