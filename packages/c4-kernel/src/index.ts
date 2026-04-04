export type {
  C4ElementType,
  C4Level,
  C4Element,
  C4Relationship,
  C4Model,
  BoundaryInfo,
  C4TreeNode,
} from './types';

export { parseMermaidC4, extractBoundaries } from './parser/mermaidC4';
export { c4ToGraphDocument } from './transform/toGraphDocument';
export { c4ToMermaid } from './serializer/c4ToMermaid';
export { buildLevelView, getFrameDepth } from './view/buildLevelView';
export { buildElementTree, filterTreeByLevel } from './view/buildElementTree';

export type {
  DsmMatrix,
  DsmNode,
  DsmEdge,
  ImportDetail,
  DsmDiff,
  DsmDiffCell,
  DsmCellState,
  CyclicPair,
  DsmMapping,
} from './dsm/types';

export { buildC4Matrix } from './dsm/buildC4Matrix';
