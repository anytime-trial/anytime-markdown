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
export { filterModelForDrill } from './view/filterModelForDrill';
export { buildElementTree, filterTreeByLevel } from './view/buildElementTree';
export { filterTreeBySearch } from './view/filterTreeBySearch';
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
export { aggregateDsmToPackageLevel, aggregateDsmToC4SystemLevel, aggregateDsmToC4ContainerLevel, aggregateDsmToC4ComponentLevel, sortDsmMatrixByName, filterDsmMatrix } from './dsm/aggregateDsm';
export { detectCycles } from './dsm/detectCycles';
export { clusterMatrix } from './dsm/cluster';

export { parseCoverage } from './coverage/parseCoverage';
export type { FileCoverage } from './coverage/parseCoverage';
export { aggregateCoverage } from './coverage/aggregateCoverage';
export { computeCoverageDiff } from './coverage/computeCoverageDiff';

export { fetchC4Model, fetchC4ModelEntries } from './c4ModelService';
export type { C4ModelPayload } from './c4ModelService';

export type { MetricOverlay, ComplexityClass, ComplexityEntry, ComplexityMatrix } from './types';
export { computeColorMap } from './metrics/computeColorMap';
export type { MessageInput } from './metrics/computeComplexityMatrix';
export { computeComplexityMatrix } from './metrics/computeComplexityMatrix';
export { computeImportanceMatrix } from './metrics/computeImportanceMatrix';
export type { ImportanceMatrix } from '../importance/types';

export { mergeManualIntoC4Model } from './mergeManual';

export type {
  ManualElement,
  ManualRelationship,
  ManualGroup,
  IManualElementProvider,
} from './manualTypes';

export type { ServiceEntry } from './services/catalog';
export { SERVICE_CATALOG, findService, filterServices } from './services/catalog';
