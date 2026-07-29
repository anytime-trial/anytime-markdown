import type {
  CooccurrenceFile,
  CooccurrenceFilterCounts,
  CooccurrenceFilterOptions,
  LinkDirection,
} from '@anytime-markdown/graph-core';

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
  /**
   * 観測点。ミニマップを描いた回数。
   *
   * ミニマップも要求時にだけ描くため、要求の書き忘れは「図だけ動いて枠が取り残される」
   * 形でしか現れない。回数を外から見られないと、その退行をテストで捕まえられない。
   */
  getMinimapDrawCount(): number;
  getFilterCounts(): CooccurrenceFilterCounts;
  /**
   * 観測点。ホバーのポップアップが今どの要素に対して出ているか（設計書 §6.4）。
   *
   * 「何か出た」ことをもって合格と判定しないために、対象の種別と添字を外から読めるようにする。
   * 出ていないときは null。
   */
  getNotePopupState(): NotePopupState | null;
}

/** ポップアップの対象。クラスタは図に図形を持たないためパネルの一覧行から出る（設計書 §3.1）。 */
export type NotePopupTargetKind = 'node' | 'link' | 'cluster';

export interface NotePopupState {
  kind: NotePopupTargetKind;
  /** 対象の添字（`spec.nodes` / `spec.links` / `spec.clusters` に対する）。 */
  index: number;
  /** 見出し行（語名・両端の語名と向き・クラスタ名）。 */
  title: string;
  /** 見出しに続く付帯情報の行。 */
  details: readonly string[];
  /** メモの本文。メモが無ければ undefined。 */
  note?: string;
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
  /** メモを持つか。図に印を描く根拠（設計書 §3.1）。 */
  hasNote: boolean;
}

export interface RenderLink {
  index: number;
  source: number;
  target: number;
  strength: number;
  width: number;
  /** 共起の向き。矢印の有無と側を決める（設計書 §2.1）。 */
  direction: LinkDirection;
  /** メモを持つか。図に印を描く根拠（設計書 §3.1）。 */
  hasNote: boolean;
}

export interface RenderGraph {
  nodes: readonly RenderNode[];
  links: readonly RenderLink[];
}
