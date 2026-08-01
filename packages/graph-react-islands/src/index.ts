/**
 * graph-core の意図的 React island。
 *
 * graph-core 本体（engine / state / viewer / GraphView WC）は React-free に保ち、
 * React に依存する canvas ラッパー（`useCanvasBase` フック）は本パッケージへ分離する。
 * 目的は再利用でなく隔離。consumer は増減するのでここに列挙しない
 * （`grep -rn '@anytime-markdown/graph-react-islands' packages` で調べる）。
 */

export { useCanvasBase } from './useCanvasBase';
export type {
  UseCanvasBaseOptions,
  UseCanvasBaseReturn,
  DragMode,
  SelectRect,
} from './useCanvasBase';
