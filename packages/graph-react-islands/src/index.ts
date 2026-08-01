/**
 * graph-core の意図的 React island。
 *
 * graph-core 本体（engine / state / viewer / GraphView WC）は React-free に保ち、
 * React に依存する canvas ラッパー（`useCanvasBase` フック）は本パッケージへ分離する。
 * 現在の consumer は trace-viewer のみ（trail-viewer は vanilla へ自前移植済み）。
 */

export { useCanvasBase } from './useCanvasBase';
export type {
  UseCanvasBaseOptions,
  UseCanvasBaseReturn,
  DragMode,
  SelectRect,
} from './useCanvasBase';
