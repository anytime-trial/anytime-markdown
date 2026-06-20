/** TrailDataServer /api/c4/file-analysis の entries[i] のうち本ツールが使う列。 */
export interface FileAnalysisEntry {
  filePath: string;
  importanceScore: number;
  centralityScore: number;
  crossPkgInCount: number;
  fanInTotal: number;
  cognitiveComplexityMax: number;
  deadCodeScore: number;
  isBarrel: boolean;
  isIgnored: boolean;
  signals: string;
  category: string;
}

export type ImportantFilesFilter = 'central' | 'dead' | 'barrel' | 'risky';

export interface SelectImportantFilesOptions {
  limit: number;
  filter?: ImportantFilesFilter;
}

export interface ImportantFileRow {
  rank: number;
  filePath: string;
  importanceScore: number;
  centralityScore: number;
  signals: string;
  reason: string;
}

function sortKey(filter: ImportantFilesFilter | undefined): (e: FileAnalysisEntry) => number {
  switch (filter) {
    case 'central':
      return (e) => e.centralityScore;
    case 'dead':
      return (e) => e.deadCodeScore;
    case 'risky':
      return (e) => e.cognitiveComplexityMax;
    case 'barrel':
      return (e) => e.importanceScore; // barrel フィルタ後は overall importance で順位付け
    default:
      return (e) => e.importanceScore;
  }
}

function reasonFor(e: FileAnalysisEntry): string {
  const parts: string[] = [];
  if (e.fanInTotal > 0) parts.push(`fanIn=${e.fanInTotal}`);
  if (e.crossPkgInCount > 0) parts.push(`crossPkgIn=${e.crossPkgInCount}`);
  if (e.cognitiveComplexityMax > 0) parts.push(`complexity=${e.cognitiveComplexityMax}`);
  if (e.deadCodeScore > 0) parts.push(`dead=${e.deadCodeScore}`);
  if (e.isBarrel) parts.push('barrel');
  return parts.join(', ');
}

/**
 * file-analysis entries を filter/並べ替え/top-N し、Claude へ返す compact 行へ射影する純粋関数。
 * isIgnored（lock/生成物等）は常に除外。filter='barrel' は isBarrel のみを対象にする。
 */
export function selectImportantFiles(
  entries: readonly FileAnalysisEntry[],
  opts: SelectImportantFilesOptions,
): ImportantFileRow[] {
  const key = sortKey(opts.filter);
  const pool = entries
    .filter((e) => !e.isIgnored)
    .filter((e) => (opts.filter === 'barrel' ? e.isBarrel : true));
  const sorted = [...pool].sort((a, b) => key(b) - key(a));
  return sorted.slice(0, opts.limit).map((e, i) => ({
    rank: i + 1,
    filePath: e.filePath,
    importanceScore: e.importanceScore,
    centralityScore: e.centralityScore,
    signals: e.signals,
    reason: reasonFor(e),
  }));
}
