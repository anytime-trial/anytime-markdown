import { appendFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drainSpool, spoolPath } from '../gitActivitySpool';

describe('gitActivitySpool', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spool-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('spoolPath はワークスペース直下の .anytime/agent に解決する', () => {
    expect(spoolPath('/ws')).toBe('/ws/.anytime/agent/git-activity-spool.jsonl');
  });

  it('存在しない spool は空配列を返す', () => {
    expect(drainSpool(join(dir, 'missing.jsonl'))).toEqual([]);
  });

  it('JSONL を読み出し、読み終わったらファイルを消す', () => {
    const p = join(dir, 'spool.jsonl');
    appendFileSync(p, `${JSON.stringify({ opType: 'commit', refName: 'refs/heads/a' })}\n`);
    appendFileSync(p, `${JSON.stringify({ opType: 'reset', refName: 'refs/heads/b' })}\n`);

    const rows = drainSpool(p);

    expect(rows.map((r) => r.opType)).toEqual(['commit', 'reset']);
    expect(existsSync(p)).toBe(false);
  });

  it('壊れた行は捨てるが、健全な行は取り込む（silent catch しない）', () => {
    const p = join(dir, 'spool.jsonl');
    writeFileSync(p, `{"opType":"commit"}\nNOT-JSON\n{"opType":"reset"}\n`);
    const errors: string[] = [];

    const rows = drainSpool(p, (msg) => errors.push(msg));

    expect(rows.map((r) => r.opType)).toEqual(['commit', 'reset']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('NOT-JSON');
  });
});
