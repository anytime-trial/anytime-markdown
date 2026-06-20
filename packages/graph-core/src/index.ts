// graph-core — platform-independent graph editor core
export * from './types';
export * as engine from './engine/index';
export * as state from './state/index';
export * from './theme';
export * from './io/index';
export * as presets from './presets/index';
// vanilla canvas ビューア（webview 等の埋め込み用）
export { GraphView } from './viewer/index';
export type { GraphViewOptions } from './viewer/index';
export {
  buildThinkingDiagram,
  THINKING_DIAGRAM_TYPES,
  buildNoteGraph,
  buildNoteNeighborhood,
  RELATION_TYPES,
  DEFAULT_RELATION_TYPE,
  isRelationType,
  coerceRelationType,
  relationEdgeStyle,
  resolveRelationEdgeStyle,
} from './presets/index';
export type {
  ThinkingDiagramSpec,
  ThinkingDiagramType,
  FishboneSpec,
  CausalLoopSpec,
  PyramidSpec,
  MindmapSpec,
  DoubleDiamondSpec,
  LogicTreeSpec,
  WhyChainSpec,
  SwotSpec,
  MorphBoxSpec,
  AffinitySpec,
  TreeNodeSpec,
  NoteGraphDocInput,
  NoteGraphOptions,
  NoteGraphEdgeLayers,
  NoteNeighborhoodOptions,
  NoteRelatedEntry,
  RelationType,
  RelatedRef,
  RelationEdgeStyle,
} from './presets/index';
// React 依存の canvas ラッパー（useCanvasBase / MinimapCanvas）は
// @anytime-markdown/graph-react-islands へ分離。graph-core 本体は React-free。
