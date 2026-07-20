import type { CooccurrenceFile, CooccurrenceFilterCounts, CooccurrenceFilterOptions } from '@anytime-markdown/graph-core';

export type ThemeMode = 'dark' | 'light';
export type LayoutStatus = 'idle' | 'running' | 'done' | 'aborted';
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
