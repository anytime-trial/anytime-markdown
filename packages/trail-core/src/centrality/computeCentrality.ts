import {
  CentralityWeights,
  DEFAULT_CENTRALITY_WEIGHTS,
  FileCentrality,
  FileMeta,
} from './types';

const NOISE_PATTERNS = [
  '.next/',
  '/dist/',
  '/build/',
  '/out/',
  '/coverage/',
  '.d.ts',
  '.test.ts',
  '.spec.ts',
  '/__tests__/',
];

const PKG_RE = /^packages\/([^/]+)\//;

function isNoisePath(p: string): boolean {
  return NOISE_PATTERNS.some((pat) => p.includes(pat));
}

function extractPkg(filePath: string): string {
  const m = PKG_RE.exec(filePath);
  return m ? m[1] : '?';
}

function isBarrel(filePath: string, fileMetadata: Record<string, FileMeta>): boolean {
  if (!/\/index\.tsx?$/.test(filePath)) return false;
  const meta = fileMetadata[filePath];
  if (!meta) return false;
  return meta.functionCount === 0 && meta.cognitiveComplexityMax === 0;
}

export function computeCentrality(
  graphJson: {
    edges?: ReadonlyArray<{ source?: string; target?: string }>;
  } & Record<string, unknown>,
  fileMetadata: Record<string, FileMeta>,
  weights: CentralityWeights = DEFAULT_CENTRALITY_WEIGHTS,
): FileCentrality[] {
  const edges = graphJson.edges ?? [];

  // targetごとに集計
  const crossPkgInMap = new Map<string, number>();
  const externalPkgsMap = new Map<string, Set<string>>();
  const totalInMap = new Map<string, number>();

  for (const edge of edges) {
    const source = edge.source;
    const target = edge.target;
    if (!source || !target) continue;
    if (isNoisePath(target)) continue;

    const srcPkg = extractPkg(source);
    const tgtPkg = extractPkg(target);

    totalInMap.set(target, (totalInMap.get(target) ?? 0) + 1);

    if (srcPkg !== tgtPkg) {
      crossPkgInMap.set(target, (crossPkgInMap.get(target) ?? 0) + 1);
      if (!externalPkgsMap.has(target)) {
        externalPkgsMap.set(target, new Set());
      }
      externalPkgsMap.get(target)!.add(srcPkg);
    }
  }

  // ノイズ除外後の全ターゲットを収集
  const allTargets = new Set<string>(totalInMap.keys());

  if (allTargets.size === 0) return [];

  const { alpha, beta, gamma, barrelPenalty } = weights;

  const rawScores = new Map<string, number>();
  for (const filePath of allTargets) {
    const crossPkgIn = crossPkgInMap.get(filePath) ?? 0;
    const externalConsumerPkgs = externalPkgsMap.get(filePath)?.size ?? 0;
    const totalIn = totalInMap.get(filePath) ?? 0;

    let rawScore =
      alpha * Math.log(1 + crossPkgIn) +
      beta * externalConsumerPkgs +
      gamma * Math.log(1 + totalIn);

    if (isBarrel(filePath, fileMetadata)) {
      rawScore *= barrelPenalty;
    }

    rawScores.set(filePath, rawScore);
  }

  const maxRaw = Math.max(...rawScores.values());

  const result: FileCentrality[] = [];
  for (const filePath of allTargets) {
    const crossPkgIn = crossPkgInMap.get(filePath) ?? 0;
    const externalConsumerPkgs = externalPkgsMap.get(filePath)?.size ?? 0;
    const totalIn = totalInMap.get(filePath) ?? 0;
    const rawScore = rawScores.get(filePath) ?? 0;
    const centralityScore = maxRaw === 0 ? 0 : Math.round((100 * rawScore) / maxRaw);
    const barrel = isBarrel(filePath, fileMetadata);

    result.push({
      filePath,
      crossPkgIn,
      externalConsumerPkgs,
      totalIn,
      isBarrel: barrel,
      centralityScore,
    });
  }

  return result;
}
