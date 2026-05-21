import type {
  AggregatePairsOptions,
  GroupedFileRow,
  PairAggregation,
} from './types';

export const PAIR_KEY_SEPARATOR = ' ';

export const pairKey = (a: string, b: string): string =>
  a < b ? `${a}${PAIR_KEY_SEPARATOR}${b}` : `${b}${PAIR_KEY_SEPARATOR}${a}`;

export const normalizePair = (
  a: string,
  b: string,
): readonly [string, string] => (a < b ? [a, b] : [b, a]);

function buildGroupToFiles(
  rows: ReadonlyArray<GroupedFileRow>,
  pathFilter: AggregatePairsOptions['pathFilter'],
): Map<string, Set<string>> {
  const groupToFiles = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.groupKey) continue;
    if (pathFilter && !pathFilter(row.filePath)) continue;
    let files = groupToFiles.get(row.groupKey);
    if (!files) {
      files = new Set();
      groupToFiles.set(row.groupKey, files);
    }
    files.add(row.filePath);
  }
  return groupToFiles;
}

function buildFileChangeCount(
  groupToFiles: Map<string, Set<string>>,
  maxFilesPerGroup: number,
): Map<string, number> {
  const fileChangeCount = new Map<string, number>();
  for (const files of groupToFiles.values()) {
    if (files.size > maxFilesPerGroup) continue;
    for (const file of files) {
      fileChangeCount.set(file, (fileChangeCount.get(file) ?? 0) + 1);
    }
  }
  return fileChangeCount;
}

function buildEligibleFiles(
  fileChangeCount: Map<string, number>,
  minChangeCount: number,
): Set<string> {
  const eligible = new Set<string>();
  for (const [file, count] of fileChangeCount) {
    if (count >= minChangeCount) eligible.add(file);
  }
  return eligible;
}

function buildExcludeKeys(excludePairs: AggregatePairsOptions['excludePairs']): Set<string> {
  const keys = new Set<string>();
  if (excludePairs) {
    for (const [a, b] of excludePairs) keys.add(pairKey(a, b));
  }
  return keys;
}

function buildCoChangeMap(
  groupToFiles: Map<string, Set<string>>,
  maxFilesPerGroup: number,
  eligibleFiles: Set<string>,
  excludeKeys: Set<string>,
): Map<string, number> {
  const coChange = new Map<string, number>();
  for (const files of groupToFiles.values()) {
    if (files.size > maxFilesPerGroup) continue;
    const sorted = [...files].filter((f) => eligibleFiles.has(f)).sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = pairKey(sorted[i], sorted[j]);
        if (!excludeKeys.has(key)) {
          coChange.set(key, (coChange.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return coChange;
}

export function aggregatePairs(
  rows: ReadonlyArray<GroupedFileRow>,
  options: AggregatePairsOptions,
): PairAggregation {
  const empty: PairAggregation = {
    fileChangeCount: new Map(),
    coChange: new Map(),
  };
  if (rows.length === 0) return empty;

  const { minChangeCount, excludePairs, pathFilter } = options;
  const maxFilesPerGroup =
    options.maxFilesPerGroup ?? options.maxFilesPerCommit ?? Infinity;

  const groupToFiles = buildGroupToFiles(rows, pathFilter);
  const fileChangeCount = buildFileChangeCount(groupToFiles, maxFilesPerGroup);
  const eligibleFiles = buildEligibleFiles(fileChangeCount, minChangeCount);

  if (eligibleFiles.size < 2) {
    return { fileChangeCount, coChange: new Map() };
  }

  const excludeKeys = buildExcludeKeys(excludePairs);
  const coChange = buildCoChangeMap(groupToFiles, maxFilesPerGroup, eligibleFiles, excludeKeys);

  return { fileChangeCount, coChange };
}
