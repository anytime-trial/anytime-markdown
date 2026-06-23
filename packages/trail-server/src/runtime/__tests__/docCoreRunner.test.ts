import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { wireDocCoreRunner, createDocCoreRunner, type WiredDocCore } from '../docCoreRunner';
import type { EmbedFn } from '@anytime-markdown/doc-core';

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

describe('createDocCoreRunner status + reconciliation (止血 RC3)', () => {
  let dir: string;
  let dbPath: string;
  let statusPath: string;
  const goodEmbed: EmbedFn = (text: string) => Promise.resolve([text.length % 5, 0.5, -0.25]);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-core-status-'));
    dbPath = path.join(dir, 'db', 'doc-core.db');
    statusPath = path.join(dir, 'db', 'doc-core-status.json');
    writeDoc(dir, 'spec/10.a/a.ja.md', 'title: a\ncategory: s', 'alpha body');
    writeDoc(dir, 'spec/20.b/b.ja.md', 'title: b\ncategory: s', 'bravo body');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function readStatus(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  }

  it('embed 成功時: status に ingest/embed/突合 を記録し ok=true', async () => {
    const runner = createDocCoreRunner({
      docsRoot: dir,
      dbPath,
      statusPath,
      embed: goodEmbed,
      embedModel: 'test-model',
      logSink: { appendLine: () => {} },
    });
    await runner.runOnce();
    runner.dispose();

    const s = readStatus() as any;
    expect(s.ok).toBe(true);
    expect(s.ingest.ingested).toBeGreaterThan(0);
    expect(s.embed.embedded).toBeGreaterThan(0);
    expect(s.embed.failed).toBe(0);
    expect(s.reconcile.docs).toBe(2);
    expect(s.reconcile.embeddings).toBe(2);
    expect(s.reconcile.missing).toBe(0);
  });

  it('embed 全件失敗時: 失敗を握り潰さず status に failed/firstError を記録し ok=false・doc_embedding=0 を突合で検出', async () => {
    const boomEmbed: EmbedFn = () => Promise.reject(new Error('ollama_unreachable'));
    const logs: string[] = [];
    const runner = createDocCoreRunner({
      docsRoot: dir,
      dbPath,
      statusPath,
      embed: boomEmbed,
      embedModel: 'test-model',
      logSink: { appendLine: (m) => logs.push(m) },
    });
    await runner.runOnce();
    runner.dispose();

    const s = readStatus() as any;
    expect(s.ok).toBe(false);
    expect(s.ingest.ingested).toBeGreaterThan(0); // ingest は成功(embed失敗に巻き込まれない)
    expect(s.embed.failed).toBe(2);
    expect(s.embed.embedded).toBe(0);
    expect(s.embed.firstError).toContain('ollama_unreachable');
    expect(s.reconcile.embeddings).toBe(0);
    // doc_embedding=0 が WARN として可視化される(silent failure の撲滅)。
    expect(logs.some((l) => l.includes('doc_embedding=0'))).toBe(true);
  });

  it('embed 未注入時: embedSkippedReason を記録', async () => {
    const runner = createDocCoreRunner({
      docsRoot: dir,
      dbPath,
      statusPath,
      logSink: { appendLine: () => {} },
    });
    await runner.runOnce();
    runner.dispose();

    const s = readStatus() as any;
    expect(s.embedSkippedReason).toContain('not provided');
    expect(s.reconcile.docs).toBe(2);
  });
});
