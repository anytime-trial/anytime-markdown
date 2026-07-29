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
  /**
   * 観測点。レイヤー表示の状態（設計書 §6.4）。レイヤー表示でないときは null。
   *
   * 点線の本数を外から読めるようにするのは、「隣り合うレイヤーの両方に存在する語だけを結ぶ」
   * という条件（§3.6.3）が壊れても図が破綻しないためである。跨いで結ぶ実装も、1 本も引かない
   * 実装も、見た目は「点線のある図」であり続ける。
   */
  getTimelineLayerState(): TimelineLayerState | null;
}

/** 観測点。レイヤー表示の状態。 */
export interface TimelineLayerState {
  axis: LayerAxis;
  /** 描いたレイヤーの枚数。 */
  layerCount: number;
  /** 直近の組み立てで引いたレイヤー間の点線の本数。 */
  timeLinkCount: number;
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

/** レイヤーを並べる向き（設計書 §3.6.2）。表示状態でありファイルへは書かない。 */
export type LayerAxis = 'horizontal' | 'vertical';

/** 時間軸の表示状態。ビューアが保持し、`.cooc.json` へは書かない（設計書 §3.6.2）。 */
export interface TimelineViewState {
  /** レイヤー表示にするか。時間軸を持つファイルの既定は true（設計書 §3.6.4）。 */
  layered: boolean;
  axis: LayerAxis;
  /** レイヤー間の余白（世界座標）。 */
  gap: number;
  /** レイヤー間の点線を描くか。 */
  showTimeLinks: boolean;
  /**
   * 表示するスライス（設計書 §3.6.5）。`undefined` は全て表示。
   *
   * Why not 添字で持つか: 添字はスライスを 1 枚消したり並べ替えたりするたびに別のスライスを
   * 指す。利用者が外したのとは違うスライスが黙って消える形でしか現れない。ラベルは一意で
   * （§2.6 が重複を拒否する）、削除にも並べ替えにも動かない。
   *
   * 空配列（1 枚も表示しない）と `undefined`（全表示）を区別する。同じ扱いにすると、利用者が
   * 全てのチェックを外した状態が黙って全表示へ戻る。
   */
  selectedSliceLabels?: readonly string[];
}

export interface RenderNode {
  index: number;
  /**
   * このレイヤーの並び順（レイヤー表示でないときは 0）。
   *
   * 同じ `index` の語がレイヤーの数だけ現れるため、語を一意に指すには `layer` と組で扱う。
   */
  layer: number;
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
  /** 端点はこのレイヤーの語を指す（レイヤー表示でないときは 0）。 */
  layer: number;
  source: number;
  target: number;
  strength: number;
  width: number;
  /** 共起の向き。矢印の有無と側を決める（設計書 §2.1）。 */
  direction: LinkDirection;
  /** メモを持つか。図に印を描く根拠（設計書 §3.1）。 */
  hasNote: boolean;
}

/**
 * レイヤーをまたいで同じ語を結ぶ点線（設計書 §3.6.3）。
 *
 * 共起（`RenderLink`）と別の型にするのは、示すものが違うためである。共起は語どうしの関係、
 * これは同じ語の同一性を示す。同じ型に混ぜると、向き・強度・メモといった共起の属性が
 * 意味を持たないまま付いて回る。
 */
export interface RenderTimeLink {
  /** 結んでいる語の添字（両端で同じ）。 */
  nodeIndex: number;
  fromLayer: number;
  toLayer: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 描いたレイヤー 1 枚。レイヤー表示でないときは空配列になる。 */
export interface RenderLayer {
  layer: number;
  /** 対応する `spec.timeline.slices` の添字。 */
  slice: number;
  label: string;
  at?: string;
  offsetX: number;
  offsetY: number;
  /** レイヤー名を描く位置（世界座標。レイヤーが占める矩形の左上）。 */
  labelX: number;
  labelY: number;
}

export interface RenderGraph {
  nodes: readonly RenderNode[];
  links: readonly RenderLink[];
  /** レイヤー間の点線。単一表示と、点線を切っているときは空。 */
  timeLinks: readonly RenderTimeLink[];
  /** 描いたレイヤー。単一表示のときは空（レイヤー表示かどうかの判定に使う）。 */
  layers: readonly RenderLayer[];
}
