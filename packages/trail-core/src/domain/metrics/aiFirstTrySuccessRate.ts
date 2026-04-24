import { classifyDoraLevel, DEFAULT_THRESHOLDS } from './thresholds';
import type { ThresholdsConfig } from './thresholds';
import type { DateRange, MetricValue } from './types';
import { buildTimeSeries } from './timeSeriesUtils';

export const AI_FIRST_TRY_FIX_WINDOW_MS = 168 * 60 * 60 * 1000; // 7 days
const FIX_WINDOW_MS = AI_FIRST_TRY_FIX_WINDOW_MS;

type Commit = {
  hash: string;
  subject: string;
  committed_at: string;
  is_ai_assisted: boolean;
  files: string[];
};

type Inputs = {
  commits: Commit[];
};

// 「AI 生成コード」品質指標のため、ドキュメント・画像・ロックファイル等の非コードファイルは
// 分母・分子判定から除外する。拡張子/ファイル名のブラックリスト方式。
const NON_CODE_EXTENSIONS = new Set<string>([
  'md', 'mdx', 'txt', 'rst', 'adoc', 'asciidoc',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp4', 'mp3', 'wav', 'webm', 'mov',
  'snap',
]);

const NON_CODE_FILENAMES = new Set<string>([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'npm-shrinkwrap.json',
  'composer.lock',
  'Gemfile.lock',
  'Cargo.lock',
  'poetry.lock',
]);

export function isCodeFile(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  if (NON_CODE_FILENAMES.has(base)) return false;
  const dot = base.lastIndexOf('.');
  if (dot === -1) return true;
  const ext = base.slice(dot + 1).toLowerCase();
  return !NON_CODE_EXTENSIONS.has(ext);
}

function filterCodeFiles(files: readonly string[]): string[] {
  return files.filter(isCodeFile);
}

export function isAiFirstTryFailureCommit(subject: string): boolean {
  return isFailureCommit(subject);
}

function isFailureCommit(subject: string): boolean {
  const lower = subject.toLowerCase();
  if (/^fix(\([^)]*\))?[!]?:\s/.test(lower)) return true;
  if (/^revert(\([^)]*\))?[!]?:\s/.test(lower)) return true;
  if (/^hotfix(\([^)]*\))?[!]?:\s/.test(lower)) return true;
  return false;
}

// AI コミットと fix コミットが少なくとも 1 ファイル（コードに限る）を共有しているかで failure 判定する。
// どちらかの files が空（未バックフィル・未取得）の場合は overlap を判定できないため楽観的に success。
function hasFileOverlap(aiFiles: readonly string[], fixFiles: readonly string[]): boolean {
  if (aiFiles.length === 0 || fixFiles.length === 0) return false;
  const aiSet = new Set(aiFiles);
  for (const f of fixFiles) {
    if (aiSet.has(f)) return true;
  }
  return false;
}

function computeRate(inputs: Inputs, range: DateRange): {
  value: number;
  sampleSize: number;
  successes: Array<{ date: string }>;
} {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();

  // 分母には fix/revert/hotfix も含める。要件定義「修正なしでマージされた AI 生成コードの割合」
  // において fix コミット自体も AI 生成コードの 1 つであり、自身の後続に更なる修正が
  // 入っていなければ「修正なしで済んだ」として成功扱いになる。
  const aiCommitsInRange = inputs.commits
    .filter((c) => {
      if (!c.is_ai_assisted) return false;
      const t = new Date(c.committed_at).getTime();
      if (t < fromMs || t > toMs) return false;
      // files が空 (未バックフィル) は楽観的に残す。files が非空でコードを 1 件も含まなければ除外。
      if (c.files.length > 0 && filterCodeFiles(c.files).length === 0) return false;
      return true;
    })
    .map((c) => ({ commit: c, codeFiles: filterCodeFiles(c.files) }));

  const fixes = inputs.commits
    .filter((c) => isFailureCommit(c.subject))
    .map((c) => ({
      ms: new Date(c.committed_at).getTime(),
      codeFiles: filterCodeFiles(c.files),
    }))
    .filter((f) => !Number.isNaN(f.ms));

  const successes: Array<{ date: string }> = [];
  for (const { commit, codeFiles } of aiCommitsInRange) {
    const commitMs = new Date(commit.committed_at).getTime();
    if (Number.isNaN(commitMs)) continue;
    const failed = fixes.some(
      (f) => f.ms > commitMs
        && f.ms - commitMs <= FIX_WINDOW_MS
        && hasFileOverlap(codeFiles, f.codeFiles),
    );
    if (!failed) {
      successes.push({ date: commit.committed_at });
    }
  }

  const value = aiCommitsInRange.length === 0
    ? 0
    : (successes.length / aiCommitsInRange.length) * 100;
  return { value, sampleSize: aiCommitsInRange.length, successes };
}

export function computeAiFirstTrySuccessRate(
  inputs: Inputs,
  range: DateRange,
  previousRange: DateRange,
  bucket: 'day' | 'week',
  previousInputs?: Inputs,
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS,
): MetricValue {
  const { value, sampleSize, successes } = computeRate(inputs, range);
  const level = sampleSize > 0
    ? classifyDoraLevel('aiFirstTrySuccessRate', value, thresholds)
    : undefined;

  const timeSeries = buildTimeSeries(
    successes.map((s) => ({ date: s.date, value: 1 })),
    range,
    bucket,
    'sum',
  );

  let comparison: MetricValue['comparison'] | undefined;
  if (previousInputs !== undefined) {
    const prev = computeRate(previousInputs, previousRange);
    const deltaPct = prev.sampleSize === 0 ? null : ((value - prev.value) / prev.value) * 100;
    comparison = { previousValue: prev.value, deltaPct };
  }

  return {
    id: 'aiFirstTrySuccessRate',
    value,
    unit: 'percent',
    sampleSize,
    level,
    comparison,
    timeSeries,
  };
}
