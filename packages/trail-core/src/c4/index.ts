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
export { buildFeatureMatrixFromCommunities, type CommunityRow } from './buildFeatureMatrixFromCommunities';

export type {
  DsmMatrix,
  DsmNode,
  DsmEdge,
  ImportDetail,
  CyclicPair,
} from './dsm/types';

export { buildSourceMatrix } from './dsm/buildSourceMatrix';
export { aggregateDsmToPackageLevel, aggregateDsmToC4SystemLevel, aggregateDsmToC4ContainerLevel, aggregateDsmToC4ComponentLevel, aggregateDsmToC4CodeLevel, sortDsmMatrixByName, filterDsmMatrix } from './dsm/aggregateDsm';
export { detectCycles } from './dsm/detectCycles';
export { clusterMatrix } from './dsm/cluster';

export { parseCoverage } from './coverage/parseCoverage';
export type { FileCoverage } from './coverage/parseCoverage';
export { aggregateCoverage } from './coverage/aggregateCoverage';
export { aggregateCoverageFromDb } from './coverage/aggregateCoverageFromDb';
export { computeCoverageDiff } from './coverage/computeCoverageDiff';

export { fetchC4Model, fetchC4ModelEntries } from './c4ModelService';
export type { C4ModelPayload } from './c4ModelService';

export type { MetricOverlay, ComplexityClass, ComplexityEntry, ComplexityMatrix } from './types';
export { computeColorMap, interpolateDsmColor } from './metrics/computeColorMap';
export { buildSizeMatrix } from './metrics/buildSizeMatrix';
export type { SizeMatrix, SizeMetricsEntry } from './metrics/buildSizeMatrix';
export { mapFilesToC4Elements, mapFileToC4Elements, buildC4ElementById } from '../domain/engine/c4Mapper';
export type { C4MappingResult } from '../domain/engine/c4Mapper';
export type { MessageInput } from './metrics/computeComplexityMatrix';
export { computeComplexityMatrix } from './metrics/computeComplexityMatrix';
export type { ImportanceMatrix } from '../importance/types';

export { mergeManualIntoC4Model } from './mergeManual';

export { computeCommunityOverlay } from './computeCommunityOverlay';
export type { CommunityOverlayEntry } from './computeCommunityOverlay';
export { resolveSelectedElementCommunity } from './resolveSelectedElementCommunity';
export type { ResolveSelectedElementCommunityInput } from './resolveSelectedElementCommunity';
export { buildCommunityTree } from './view/buildCommunityTree';
export type { CommunityTreeInput } from './view/buildCommunityTree';
export { aggregateGhostEdgesToC4 } from './aggregateGhostEdgesToC4';
export type { C4GhostEdge } from './aggregateGhostEdgesToC4';

export {
  computeFileHotspot,
  aggregateHotspotToC4,
  computeActivityHeatmap,
  aggregateHeatmapColumnsToC4,
  computeActivityTrend,
} from '../hotspot';
export type {
  FileHotspotRow,
  HotspotEntry,
  HotspotGranularity,
  HotspotMap,
  ActivityHeatmapRow,
  HeatmapAxis,
  HeatmapCell,
  HeatmapMatrix,
  ActivityTrendRow,
  TrendBucketSize,
  TrendBucket,
  TrendPeriod,
  TrendGranularity,
  ActivityTrend,
  ComputeHeatmapInput,
  ComputeTrendInput,
  HeatmapIntermediate,
} from '../hotspot';

export type {
  ManualElement,
  ManualRelationship,
  ManualGroup,
  IManualElementProvider,
} from './manualTypes';

export type { ServiceEntry } from './services/catalog';
// SERVICE_CATALOG / findService / filterServices は simple-icons (5.2 MB) を取り込む。
// '@anytime-markdown/trail-core/c4/services' からのみ import 可能とする。
