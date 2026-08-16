/**
 * Claude Code リリース年表のデータ生成スクリプト。
 *
 *   npm run data:releases -w @anytime-markdown/web-app
 *
 * 入力: data/claude-code-releases/raw/*.json
 *   `<docsRoot>/report/daily-research/*.md` と `report/weekly-research/*.md` から
 *   抽出した生データ。抽出そのものは散文の読解を伴うため機械化していない（手順は
 *   同ディレクトリの README.md を参照）。抽出結果を版として commit し、ここでは
 *   正規化（表記ゆれ吸収・重複統合・並べ替え）だけを決定論的に行う。
 *
 * 出力: data/claude-code-releases/releases.json
 *   /timeline ページが import する成果物。
 *
 * Why not: 日次レポート本文を実行時に読んで年表を組み立てない。docsRoot は web-app
 * と別リポジトリで、本番のランタイムからは到達できない。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeReleasesWithDiagnostics } from '../src/lib/releaseTimeline/normalize';
import type { DateConfidence, RawRelease, ReleaseKind } from '../src/lib/releaseTimeline/types';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(SCRIPT_DIR, '..', 'data', 'claude-code-releases');
const RAW_DIR = join(DATA_DIR, 'raw');
const OUTPUT_PATH = join(DATA_DIR, 'releases.json');

const KINDS: readonly ReleaseKind[] = ['cli', 'model'];
const DATE_CONFIDENCES: readonly DateConfidence[] = ['explicit', 'report-date'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** 系列名の無いモデル版（"5" / "4.8"）。表示側で系列を推測させないため弾く */
const BARE_NUMBER = /^\d+(\.\d+)*$/;

class RawReleaseError extends Error {}

function assertRawRelease(value: unknown, where: string): RawRelease {
  if (typeof value !== 'object' || value === null) {
    throw new RawReleaseError(`${where}: オブジェクトではない`);
  }
  const v = value as Record<string, unknown>;
  const requireString = (key: string): string => {
    const field = v[key];
    if (typeof field !== 'string' || field.length === 0) {
      throw new RawReleaseError(`${where}: ${key} が空か文字列でない`);
    }
    return field;
  };
  const version = requireString('version');
  const kind = requireString('kind');
  const date = requireString('date');
  const dateConfidence = requireString('dateConfidence');
  if (!KINDS.includes(kind as ReleaseKind)) {
    throw new RawReleaseError(`${where}: kind が不正 (${kind})`);
  }
  // 系列名の無いモデル版（"4.8"）を通すと、表示側で系列を推測して補うほかなくなる。
  // 年表には Opus / Sonnet / Fable / Mythos が併記されており、推測は存在しない製品名を
  // 作る。抽出した人にしか判断できないので、ここで抽出側へ差し戻す
  if (kind === 'model' && BARE_NUMBER.test(version.trim())) {
    throw new RawReleaseError(
      `${where}: model の version に系列名が無い (${version})。Opus / Sonnet / Haiku / Fable / Mythos を明記する`,
    );
  }
  if (!DATE_CONFIDENCES.includes(dateConfidence as DateConfidence)) {
    throw new RawReleaseError(`${where}: dateConfidence が不正 (${dateConfidence})`);
  }
  if (!ISO_DATE.test(date)) {
    throw new RawReleaseError(`${where}: date が YYYY-MM-DD でない (${date})`);
  }
  const highlights = v.highlights;
  if (highlights != null && !Array.isArray(highlights)) {
    throw new RawReleaseError(`${where}: highlights が配列でない`);
  }
  return {
    version,
    kind: kind as ReleaseKind,
    date,
    dateConfidence: dateConfidence as DateConfidence,
    headline: requireString('headline'),
    highlights: (highlights ?? []).map(String),
    impact: typeof v.impact === 'string' ? v.impact : null,
    sourceReport: requireString('sourceReport'),
    sourceUrl: typeof v.sourceUrl === 'string' ? v.sourceUrl : null,
  };
}

function loadRaw(): { entries: RawRelease[]; files: string[] } {
  const files = readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (files.length === 0) {
    throw new RawReleaseError(`${RAW_DIR}: 生データが 1 件も無い`);
  }
  const entries: RawRelease[] = [];
  for (const file of files) {
    const parsed: unknown = JSON.parse(readFileSync(join(RAW_DIR, file), 'utf8'));
    if (!Array.isArray(parsed)) {
      throw new RawReleaseError(`${file}: トップレベルが配列でない`);
    }
    parsed.forEach((item, i) => entries.push(assertRawRelease(item, `${file}[${i}]`)));
  }
  return { entries, files };
}

function main(): void {
  const { entries: raw, files } = loadRaw();
  const { entries, dateConflicts } = normalizeReleasesWithDiagnostics(raw);
  // 矛盾で落とさないのは、どちらの日付が正しいかを機械が決められないため。ただし
  // 黙って片方を捨てると年表では「そのリリース日だった」ようにしか見えないので必ず出す
  for (const conflict of dateConflicts) {
    process.stderr.write(
      `[build-release-timeline] WARN ${conflict.id}: 複数レポートがリリース日を明記し食い違っている (${conflict.dates.join(' / ')})。先に読んだ日付を採用した\n`,
    );
  }
  const payload = {
    // 生成物であることと再生成の起点を成果物自身に持たせる（timestamp は入れない。
    // 内容が変わっていないのに毎回 diff が出るとレビューで差分が読めなくなる）
    generatedBy: 'packages/web-app/scripts/build-release-timeline.ts',
    sourceFiles: files,
    rawCount: raw.length,
    entryCount: entries.length,
    entries,
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const merged = raw.length - entries.length;
  process.stdout.write(
    `[build-release-timeline] raw=${raw.length} -> entries=${entries.length} (merged ${merged}) ` +
      `cli=${entries.filter((e) => e.kind === 'cli').length} ` +
      `model=${entries.filter((e) => e.kind === 'model').length}\n`,
  );
}

main();
