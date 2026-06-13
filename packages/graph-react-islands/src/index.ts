/**
 * graph-core の意図的 React island。
 *
 * graph-core 本体（engine / state / viewer / GraphView WC）は React-free に保ち、
 * React に依存する canvas ラッパー（`useCanvasBase` フック・`MinimapCanvas` コンポーネント）は
 * 本パッケージへ分離する。consumer は trail-viewer / trace-viewer 等の React アプリ。
 */

export { useCanvasBase } from './useCanvasBase';
export type {
  UseCanvasBaseOptions,
  UseCanvasBaseReturn,
  DragMode,
  SelectRect,
} from './useCanvasBase';
export { MinimapCanvas } from './MinimapCanvas';
export type { MinimapCanvasProps } from './MinimapCanvas';
