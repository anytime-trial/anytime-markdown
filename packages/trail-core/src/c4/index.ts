export type {
  C4ElementType,
  C4Level,
  C4Element,
  C4Relationship,
  C4Model,
  BoundaryInfo,
  C4TreeNode,
  FeatureCategory,
  Feature,
  FeatureRole,
  FeatureMapping,
  FeatureMatrix,
  DocLink,
  CoverageMetric,
  CoverageEntry,
  CoverageMatrix,
  CoverageDelta,
  CoverageDiffEntry,
  CoverageDiffMatrix,
  C4ReleaseEntry,
} from './types';

export { parseMermaidC4, extractBoundaries } from './parser/mermaidC4';
export { c4ToGraphDocument } from './transform/toGraphDocument';
export { c4ToMermaid } from './serializer/c4ToMermaid';
export { buildLevelView, getFrameDepth } from './view/buildLevelView';
export { buildElementTree, filterTreeByLevel } from './view/buildElementTree';
export { collectDescendantIds } from './view/collectDescendants';
export { enrichFeatureMatrixWithComponents } from './featureMatrix';

export type {
  DsmMatrix,
  DsmNode,
  DsmEdge,
  ImportDetail,
  CyclicPair,
} from './dsm/types';

export { buildSourceMatrix } from './dsm/buildSourceMatrix';
export { detectCycles } from './dsm/detectCycles';
export { clusterMatrix } from './dsm/cluster';

export { parseCoverage } from './coverage/parseCoverage';
export type { FileCoverage } from './coverage/parseCoverage';
export { aggregateCoverage } from './coverage/aggregateCoverage';
export { computeCoverageDiff } from './coverage/computeCoverageDiff';

export { fetchC4Model, fetchC4ModelEntries } from './c4ModelService';
export type { C4ModelPayload } from './c4ModelService';
