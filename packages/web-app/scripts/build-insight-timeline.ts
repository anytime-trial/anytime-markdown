/**
 * 「知見の経緯」トラックのデータ生成スクリプト。
 *
 *   npm run data:insights -w @anytime-markdown/web-app
 *
 * 入力: data/insight-timeline/themes.json + data/insight-timeline/raw/*.json
 *   `<docsRoot>/report/daily-research/*.md` と `report/weekly-research/*.md` から
 *   抽出した生データ。抽出そのものは散文の読解を伴うため機械化していない（手順は
 *   同ディレクトリの README.md を参照）。ここでは正規化（表記ゆれ吸収・重複統合・
 *   並べ替え）だけを決定論的に行う。
 *
 * 出力: data/insight-timeline/insights.json
 *   /timeline ページが import する成果物。
 *
 * Why not: レポート本文を実行時に読んで組み立てない。docsRoot は web-app と別リポジトリで、
 * 本番のランタイムからは到達できない（リリース年表と同じ理由・同じ構造）。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { InsightSchemaError, normalizeInsights } from '../src/lib/insightTimeline/normalize';
import type { InsightCategory, InsightTheme, RawInsight } from '../src/lib/insightTimeline/types';
import type { DateConfidence } from '../src/lib/releaseTimeline/types';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(SCRIPT_DIR, '..', 'data', 'insight-timeline');
const RAW_DIR = join(DATA_DIR, 'raw');
const THEMES_PATH = join(DATA_DIR, 'themes.json');
const OUTPUT_PATH = join(DATA_DIR, 'insights.json');

const CATEGORIES: readonly InsightCategory[] = [
  'claude-code',
  'tech-trend',
  'vocabulary',
  'ecosystem',
];
const DATE_CONFIDENCES: readonly DateConfidence[] = ['explicit', 'report-date'];

function requireString(v: Record<string, unknown>, key: string, where: string): string {
  const field = v[key];
  if (typeof field !== 'string' || field.length === 0) {
    throw new InsightSchemaError(`${where}: ${key} が空か文字列でない`);
  }
  return field;
}

function assertRawInsight(value: unknown, where: string): RawInsight {
  if (typeof value !== 'object' || value === null) {
    throw new InsightSchemaError(`${where}: オブジェクトではない`);
  }
  const v = value as Record<string, unknown>;
  const category = requireString(v, 'category', where);
  const dateConfidence = requireString(v, 'dateConfidence', where);
  if (!CATEGORIES.includes(category as InsightCategory)) {
    throw new InsightSchemaError(`${where}: category が不正 (${category})`);
  }
  if (!DATE_CONFIDENCES.includes(dateConfidence as DateConfidence)) {
    throw new InsightSchemaError(`${where}: dateConfidence が不正 (${dateConfidence})`);
  }
  if (!Array.isArray(v.themes) || v.themes.some((t) => typeof t !== 'string')) {
    throw new InsightSchemaError(`${where}: themes が文字列配列でない`);
  }
  const impact = v.impact;
  if (impact !== undefined && impact !== null && typeof impact !== 'string') {
    throw new InsightSchemaError(`${where}: impact が文字列でも null でもない`);
  }
  const sourceUrl = v.sourceUrl;
  if (sourceUrl !== undefined && sourceUrl !== null && typeof sourceUrl !== 'string') {
    throw new InsightSchemaError(`${where}: sourceUrl が文字列でも null でもない`);
  }
  return {
    date: requireString(v, 'date', where),
    dateConfidence: dateConfidence as DateConfidence,
    category: category as InsightCategory,
    title: requireString(v, 'title', where),
    summary: requireString(v, 'summary', where),
    themes: v.themes as string[],
    impact: (impact ?? null) as string | null,
    sourceReport: requireString(v, 'sourceReport', where),
    sourceUrl: (sourceUrl ?? null) as string | null,
  };
}

function readThemes(): InsightTheme[] {
  const parsed = JSON.parse(readFileSync(THEMES_PATH, 'utf8')) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { themes?: unknown }).themes)
  ) {
    throw new InsightSchemaError('themes.json: themes 配列がない');
  }
  const themes = (parsed as { themes: unknown[] }).themes.map((value, index) => {
    const where = `themes[${index}]`;
    if (typeof value !== 'object' || value === null) {
      throw new InsightSchemaError(`${where}: オブジェクトではない`);
    }
    const v = value as Record<string, unknown>;
    return {
      id: requireString(v, 'id', where),
      label: requireString(v, 'label', where),
      description: requireString(v, 'description', where),
    };
  });
  const ids = new Set(themes.map((t) => t.id));
  if (ids.size !== themes.length) {
    throw new InsightSchemaError('themes.json: id が重複している');
  }
  return themes;
}

function readRaw(): { raws: RawInsight[]; files: string[] } {
  const files = readdirSync(RAW_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
  const raws: RawInsight[] = [];
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(RAW_DIR, file), 'utf8')) as unknown;
    if (!Array.isArray(parsed)) {
      throw new InsightSchemaError(`${file}: 配列ではない`);
    }
    parsed.forEach((value, index) => raws.push(assertRawInsight(value, `${file}[${index}]`)));
  }
  return { raws, files };
}

function main(): void {
  const themes = readThemes();
  const { raws, files } = readRaw();
  if (files.length === 0) {
    throw new InsightSchemaError(`${RAW_DIR}: 生データが 1 件も無い`);
  }
  const entries = normalizeInsights(raws, themes);
  // 投入直後に件数を突き合わせる。正規化は同日同題を畳むので減ること自体は正常だが、
  // 桁が変わる欠落は抽出側の事故（ファイルの書き損ない）であって統合ではない
  if (entries.length === 0) {
    throw new InsightSchemaError('正規化の結果が 0 件（生データはあるのに全滅している）');
  }
  const sourceReports = new Set(entries.flatMap((e) => e.sources.map((s) => s.report)));
  const usedThemes = new Set(entries.flatMap((e) => e.themes));
  const output = {
    generatedBy: 'scripts/build-insight-timeline.ts',
    sourceFiles: files,
    rawCount: raws.length,
    entryCount: entries.length,
    sourceReportCount: sourceReports.size,
    themes,
    entries,
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  const unused = themes.filter((t) => !usedThemes.has(t.id)).map((t) => t.id);
  console.log(
    `raw ${raws.length} 件 → entry ${entries.length} 件 / レポート ${sourceReports.size} 本 / テーマ ${usedThemes.size}/${themes.length}`,
  );
  if (unused.length > 0) {
    console.log(`未使用テーマ: ${unused.join(', ')}`);
  }
}

main();
