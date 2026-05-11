import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PipelineStatusWriter } from '../../src/status/PipelineStatusWriter';

let tmpDir: string;
let statusPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-status-test-'));
  statusPath = path.join(tmpDir, 'pipeline-status.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('PipelineStatusWriter', () => {
  it('initialize: 全 pipeline を pending で書き出す', () => {
    const writer = new PipelineStatusWriter(statusPath, 'run-001', [
      'conversation_incremental',
      'embedding_backfill',
    ]);
    writer.initialize();

    const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    expect(data.run_id).toBe('run-001');
    expect(data.pipelines).toHaveLength(2);
    expect(data.pipelines[0]).toMatchObject({
      scope: 'conversation_incremental',
      state: 'pending',
    });
    expect(data.pipelines[1].scope).toBe('embedding_backfill');
    expect(data.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('start: 指定 scope を running に + started_at セット', () => {
    const writer = new PipelineStatusWriter(statusPath, 'r', ['embedding_backfill']);
    writer.initialize();
    writer.start('embedding_backfill', 2484);

    const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    const p = data.pipelines[0];
    expect(p.state).toBe('running');
    expect(p.items_total).toBe(2484);
    expect(p.items_processed).toBe(0);
    expect(p.items_failed).toBe(0);
    expect(p.started_at).toBeDefined();
  });

  it('update: items_processed / items_failed を更新', () => {
    const writer = new PipelineStatusWriter(statusPath, 'r', ['embedding_backfill']);
    writer.initialize();
    writer.start('embedding_backfill', 2484);
    writer.update('embedding_backfill', 150, 2);

    const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    expect(data.pipelines[0].items_processed).toBe(150);
    expect(data.pipelines[0].items_failed).toBe(2);
  });

  it('finish: state + finished_at を確定', () => {
    const writer = new PipelineStatusWriter(statusPath, 'r', ['embedding_backfill']);
    writer.initialize();
    writer.start('embedding_backfill', 2484);
    writer.finish('embedding_backfill', 'success', 2484, 0);

    const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    expect(data.pipelines[0].state).toBe('success');
    expect(data.pipelines[0].items_processed).toBe(2484);
    expect(data.pipelines[0].finished_at).toBeDefined();
  });

  it('finish: error 時 message を保存する', () => {
    const writer = new PipelineStatusWriter(statusPath, 'r', ['code_incremental']);
    writer.initialize();
    writer.start('code_incremental');
    writer.finish('code_incremental', 'error', 0, 0, 'tsconfig not found');

    const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    expect(data.pipelines[0].state).toBe('error');
    expect(data.pipelines[0].message).toBe('tsconfig not found');
  });

  it('atomic write: 連続更新で常に valid JSON が読める', () => {
    const writer = new PipelineStatusWriter(statusPath, 'r', ['a', 'b']);
    writer.initialize();
    writer.start('a', 100);
    for (let i = 0; i < 20; i++) {
      writer.update('a', i * 5, 0);
      const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      expect(data.pipelines).toHaveLength(2);
      expect(data.pipelines[0].items_processed).toBe(i * 5);
    }
  });

  it('未知の scope への呼び出しは no-op', () => {
    const writer = new PipelineStatusWriter(statusPath, 'r', ['known']);
    writer.initialize();
    writer.start('unknown', 100);
    writer.update('unknown', 50, 0);
    writer.finish('unknown', 'success', 100, 0);

    const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    expect(data.pipelines).toHaveLength(1);
    expect(data.pipelines[0].scope).toBe('known');
    expect(data.pipelines[0].state).toBe('pending');
  });
});
