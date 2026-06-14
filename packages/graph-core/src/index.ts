// graph-core — platform-independent graph editor core
export * from './types';
export * as engine from './engine/index';
export * as state from './state/index';
export * from './theme';
export * from './io/index';
export * as presets from './presets/index';
export {
  buildThinkingDiagram,
  THINKING_DIAGRAM_TYPES,
  buildNoteGraph,
} from './presets/index';
export type {
  ThinkingDiagramSpec,
  ThinkingDiagramType,
  NoteGraphDocInput,
  NoteGraphOptions,
  NoteGraphEdgeLayers,
} from './presets/index';
// React 依存の canvas ラッパー（useCanvasBase / MinimapCanvas）は
// @anytime-markdown/graph-react-islands へ分離。graph-core 本体は React-free。
