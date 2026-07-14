import { appendFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

describe('drainSpool のレース安全性', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spool-race-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('drain の read 完了後・削除前にフックが追記した行を失わない', () => {
    const p = join(dir, 'spool.jsonl');
    appendFileSync(p, `${JSON.stringify({ opType: 'commit' })}\n`);

    // 「読み終わったが、まだ後始末していない」窓を決定的に踏む。
    // 素朴な read → rmSync 実装ではこの追記行がファイルごと消える（記録の完全消失）。
    const realParse = JSON.parse;
    const parseSpy = jest.spyOn(JSON, 'parse').mockImplementationOnce((text: string) => {
      appendFileSync(p, `${JSON.stringify({ opType: 'reset' })}\n`);
      return realParse(text);
    });

    const first = drainSpool(p);
    parseSpy.mockRestore();

    const second = drainSpool(p);

    expect(first.map((r) => r.opType)).toEqual(['commit']);
    expect(second.map((r) => r.opType)).toEqual(['reset']);
  });

  it('drain 後に元ファイルを残さない（作業用ファイルも掃除する）', () => {
    const p = join(dir, 'spool.jsonl');
    appendFileSync(p, `${JSON.stringify({ opType: 'commit' })}\n`);

    drainSpool(p);

    expect(existsSync(p)).toBe(false);
    // .draining-* のような作業ファイルを残さない
    expect(readdirSync(dir)).toEqual([]);
  });
});
