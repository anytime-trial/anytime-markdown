import type { CooccurrenceFile, CooccurrenceFilterCounts, CooccurrenceFilterOptions } from '@anytime-markdown/graph-core';

export type ThemeMode = 'dark' | 'light';
/**
 * `aborted` は利用者の明示的な中断、`failed` は Worker のクラッシュ等の異常終了。
 * 同じ状態にまとめると、原因不明の失敗を「中断しました」と表示してしまう。
 */
export type LayoutStatus = 'idle' | 'running' | 'done' | 'aborted' | 'failed';
export type CacheDecision = 'hit' | 'miss-spec' | 'miss-algorithm' | 'miss-absent';

export interface CooccurrenceViewerCapabilities {
  save?: boolean;
  exportPng?: boolean;
}

export interface CooccurrenceViewerOptions {
  file: CooccurrenceFile;
  themeMode: ThemeMode;
  locale?: string;
  createLayoutWorker?: () => Worker | null | undefined;
  onRequestSave?: (file: CooccurrenceFile) => void;
  onFileChange?: (file: CooccurrenceFile) => void;
  onExportPng?: (blob: Blob) => void;
  capabilities?: CooccurrenceViewerCapabilities;
  filter?: CooccurrenceFilterOptions;
  showPanels?: boolean;
}

export type CooccurrenceViewerUpdate = Partial<
  Pick<CooccurrenceViewerOptions, 'file' | 'themeMode' | 'locale' | 'filter' | 'capabilities' | 'showPanels'>
>;

export interface CooccurrenceViewerHandle {
  update(partial: CooccurrenceViewerUpdate): void;
  destroy(): void;
  getLayoutStatus(): LayoutStatus;
  getCacheDecision(): CacheDecision;
  getLayoutRunCount(): number;
  /** 観測点。描画した回数。無操作で増えないことを外から検査できる。 */
  getRenderFrameCount(): number;
  getFilterCounts(): CooccurrenceFilterCounts;
}

export interface ViewportState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface RenderNode {
  index: number;
  label: string;
  frequency: number;
  clusterIndex: number | undefined;
  x: number;
  y: number;
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  labelFontSize: number;
  cooccurrenceCount: number;
  isSubject: boolean;
}

export interface RenderLink {
  index: number;
  source: number;
  target: number;
  strength: number;
  width: number;
}

export interface RenderGraph {
  nodes: readonly RenderNode[];
  links: readonly RenderLink[];
}
