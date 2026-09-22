/**
 * 生成物 `insights.json` が raw/*.json と同期していること、および画面が前提にしている
 * 不変条件を固定する。
 *
 * 画面の並びは `buildThemeTracks` が自前で作り直すため、**成果物の並びが崩れても
 * 一覧には現れない**。唯一の症状は `INSIGHT_PERIOD` が読む両端、つまり「収録期間」の
 * 表示が誤った日付になることだけで、誰も気づけない。表示の向きと成果物の向きを
 * 意図的に分けた以上、分けた側の前提はここで機械的に押さえる。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import insightsJson from '../../data/insight-timeline/insights.json';
import themesJson from '../../data/insight-timeline/themes.json';
import { normalizeInsightsWithDiagnostics } from '../lib/insightTimeline/normalize';
import type { InsightEntry, InsightTheme, RawInsight } from '../lib/insightTimeline/types';

const DATA_DIR = join(__dirname, '..', '..', 'data', 'insight-timeline');
const RAW_DIR = join(DATA_DIR, 'raw');

function loadRawFiles(): { files: string[]; entries: RawInsight[] } {
  const files = readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const entries = files.flatMap(
    (file) => JSON.parse(readFileSync(join(RAW_DIR, file), 'utf8')) as RawInsight[],
  );
  return { files, entries };
}

describe('insights.json と raw の同期', () => {
  const { files, entries: raw } = loadRawFiles();
  const themes = (themesJson as unknown as { themes: InsightTheme[] }).themes;
  const dataset = insightsJson as unknown as {
    readonly sourceFiles: readonly string[];
    readonly rawCount: number;
    readonly entryCount: number;
    readonly sourceReportCount: number;
    readonly themes: readonly InsightTheme[];
    readonly entries: readonly InsightEntry[];
  };

  it('raw を読み直した結果と一致する（再生成の忘れを落とす）', () => {
    const { entries } = normalizeInsightsWithDiagnostics(raw, themes);
    expect(dataset.entries).toEqual(entries);
  });

  it('生成時に読んだ raw ファイルの一覧が実在のものと一致する', () => {
    expect([...dataset.sourceFiles]).toEqual(files);
    expect(dataset.rawCount).toBe(raw.length);
    expect(dataset.entryCount).toBe(dataset.entries.length);
  });

  it('テーマ辞書を丸ごと同梱している（画面が id からラベルを引けるため）', () => {
    expect(dataset.themes).toEqual(themes);
  });

  it('ID が重複しない（React key と DOM アンカーの前提）', () => {
    const ids = dataset.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('日付が昇順に並んでいる（INSIGHT_PERIOD の両端が前提にしている）', () => {
    const dates = dataset.entries.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('出典レポート数が実際の出典と一致する', () => {
    const reports = new Set(dataset.entries.flatMap((e) => e.sources.map((s) => s.report)));
    expect(dataset.sourceReportCount).toBe(reports.size);
  });
});
