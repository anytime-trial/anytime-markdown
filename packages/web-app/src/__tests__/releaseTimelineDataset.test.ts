/**
 * 生成物 `releases.json` が raw/*.json と同期していることを固定する。
 *
 * raw を直して再生成を忘れても、画面は前の内容を正しく描画し続ける。ビルドも型検査も
 * 通るので、乖離は「古い年表が出ている」という**観測しにくい形**でしか現れない。
 * ここで実際に再生成して突き合わせ、忘れをテストの失敗として現す。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import releasesJson from '../../data/claude-code-releases/releases.json';
import { normalizeReleases } from '../lib/releaseTimeline/normalize';
import type { RawRelease, ReleaseEntry } from '../lib/releaseTimeline/types';

const DATA_DIR = join(__dirname, '..', '..', 'data', 'claude-code-releases');
const RAW_DIR = join(DATA_DIR, 'raw');

function loadRawFiles(): { files: string[]; entries: RawRelease[] } {
  const files = readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const entries = files.flatMap(
    (file) => JSON.parse(readFileSync(join(RAW_DIR, file), 'utf8')) as RawRelease[],
  );
  return { files, entries };
}

describe('releases.json と raw の同期', () => {
  const { files, entries: raw } = loadRawFiles();
  const dataset = releasesJson as unknown as {
    sourceFiles: string[];
    rawCount: number;
    entryCount: number;
    entries: ReleaseEntry[];
  };

  it('raw が 1 件も読めない状態で通らない（fail-open 防止）', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(raw.length).toBeGreaterThan(0);
  });

  it('raw を再正規化した結果が生成物と一致する', () => {
    expect(dataset.entries).toEqual(normalizeReleases(raw));
  });

  it('生成物が申告する件数・入力ファイルが実態と一致する', () => {
    expect(dataset.sourceFiles).toEqual(files);
    expect(dataset.rawCount).toBe(raw.length);
    expect(dataset.entryCount).toBe(dataset.entries.length);
  });

  it('年表として意味を持つ最小限の内容がある', () => {
    // 空配列でも上の 3 件は「空 === 空」で通る。中身があることは別に主張する
    expect(dataset.entries.length).toBeGreaterThan(50);
    expect(dataset.entries.some((e) => e.kind === 'cli')).toBe(true);
    expect(dataset.entries.some((e) => e.kind === 'model')).toBe(true);
    expect(dataset.entries.some((e) => e.impact === 'high')).toBe(true);
  });

  it('ID が重複しない（React key と DOM アンカーの前提）', () => {
    const ids = dataset.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('日付が昇順に並んでいる', () => {
    const dates = dataset.entries.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
  });
});
