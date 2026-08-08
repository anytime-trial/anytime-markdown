import type {
  CooccurrenceFile,
  CooccurrenceFilterCounts,
  CooccurrenceFilterOptions,
  LinkDirection,
} from '@anytime-markdown/graph-core';

export type ThemeMode = 'dark' | 'light';
/**
 * 見た目のスキン。`ThemeMode`（ダーク/ライト）と直交する（要件書 OZ 風 3D 表示 §2.1）。
 * `oz` は three.js による 3D 表示、`standard` は従来の 2D canvas。
 * `card` はクラスタ＝カラムのカードマップ（要件書「カード表示（card スキン）」§2.1。2D canvas）。
 */
export type CooccurrenceSkin = 'standard' | 'oz' | 'card';
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
  skin?: CooccurrenceSkin;
}

export type CooccurrenceViewerUpdate = Partial<
  Pick<CooccurrenceViewerOptions, 'file' | 'themeMode' | 'locale' | 'filter' | 'capabilities' | 'showPanels' | 'skin'>
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
  /**
   * 観測点。クラスタレーン表示の状態（要件書「クラスタレーン表示」§2.8）。レーン表示でないときは null。
   *
   * 「レーンに分かれて見える図」は、軸がスライス軸と直交していなくても、未分類レーンが落ちていても、
   * レーン幅が絞り込みで動いていても成立する。図が破綻しない壊れ方を検査で捕まえるには、状態を
   * 外から読めなければならない（`getTimelineLayerState` を置いたのと同じ理由）。
   */
  getClusterLaneState(): ClusterLaneState | null;
  /**
   * 観測点。カード表示の状態（要件書「カード表示（card スキン）」§5）。card 表示でないときは null。
   *
   * 「カードが並んで見える図」はカラム割りが壊れても成立してしまう。カラム数・カード総数・
   * 未分類カラムの有無・サブクラスタ見出しの数を外から読めなければ、その退行を検査で
   * 捕まえられない（`getClusterLaneState` と同じ理由）。
   */
  getCardLayoutState(): CardLayoutState | null;
}

/** 観測点。カード表示の状態。 */
export interface CardLayoutState {
  /** 描いたカラムの本数（未分類カラムを含む）。 */
  columnCount: number;
  /** 描いたカードの総数。 */
  cardCount: number;
  /** 未分類カラムがあるか。 */
  hasUnclustered: boolean;
  /** サブクラスタ見出しの総数（残余グループは見出しを持たず数えない）。 */
  subHeaderCount: number;
}

/** 観測点。クラスタレーン表示の状態。 */
export interface ClusterLaneState {
  /** レーンを並べる軸。スライスのレイヤー軸と直交する。 */
  axis: LayerAxis;
  /** 描いたレーンの本数（未分類レーンを含む）。 */
  laneCount: number;
  /** 未分類レーンがあるか。 */
  hasUnclustered: boolean;
  /**
   * サブレーンの総本数（名前なしの残余サブレーンを含む。要件書「サブクラスタ」§2.8）。
   * 細分していないクラスタは 0 本として数える。
   */
  subLaneCount: number;
  /** サブクラスタに入らない語の残余サブレーンがあるか。 */
  hasResidualSubLane: boolean;
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

/**
 * クラスタレーン表示の状態（要件書「クラスタレーン表示」§2.1）。ビューアが保持し、
 * `.cooc.json` へは書かない（時間軸の表示状態と同じ扱い）。
 *
 * 軸を持たないのは、レーンの軸をスライスのレイヤー軸から**導出する**ためである。両方を独立に
 * 選べると、レイヤーとレーンが同一方向へ重なり、どちらの区切りなのか図から判別できない状態を
 * 利用者が作れてしまう。
 */
export interface ClusterLaneViewState {
  enabled: boolean;
  /** レーン間の余白（世界座標）。時間軸の `gap` とは別に持つ（スライスなしでも使うため）。 */
  gap: number;
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

/**
 * 描いたクラスタレーン 1 本（要件書「クラスタレーン表示」§2.4）。
 *
 * 座標はすでに `RenderNode` の x, y へ織り込まれている。この型が持つのはレーン名を描くために
 * 要る情報だけである。
 */
export interface RenderClusterLane {
  /** `spec.clusters` の添字。未分類レーンでは undefined。 */
  cluster?: number;
  /**
   * レーンを並べた軸。レーン名をどちら側へ置くかを決める。
   *
   * Why not 描画側でレーンの座標から推定するか: レーンが 1 本しか無いとき（クラスタが 1 つだけ・
   * 未分類だけ）、座標からは縦と横を区別できない。推定は「レーン名が反対側へ出る」形でしか
   * 現れず、図としては成立してしまう。
   */
  axis: LayerAxis;
  /** レーン名（クラスタ名。無題クラスタと未分類は呼び出し側が文言を決める）。 */
  label: string;
  /** レーン名の色（クラスタ色。色とレーンの対応を図の中で結び直せるようにする）。 */
  color: string;
  labelX: number;
  labelY: number;
  /**
   * クラスタの中の細分（要件書「サブクラスタ」§2.3）。細分していないクラスタでは空。
   *
   * サブクラスタは色を持たない。濃淡はすでにカテゴリ内の 2 クラスタを分ける符号として使われて
   * おり、3 段目の濃淡を足すと色から階層を読めなくなる。入れ子は位置と名前で表す。
   */
  subLanes: readonly RenderClusterSubLane[];
}

/** 描いたサブレーン 1 本。残余（どのサブクラスタにも入らない語）は名前を持たない。 */
export interface RenderClusterSubLane {
  /** サブクラスタ名。残余サブレーンでは undefined（名前を描かない）。 */
  label?: string;
  labelX: number;
  labelY: number;
}

/** 描いたカラム見出し 1 つ。残余サブレーンと同じく、名前の無いサブ見出しは作らない。 */
export interface RenderCardSubHeader {
  label: string;
  /** テキストの左下（世界座標）。 */
  x: number;
  y: number;
}

/** 描いたカードカラム 1 本（要件書「カード表示（card スキン）」§2.2）。 */
export interface RenderCardColumn {
  /** `spec.clusters` の添字。未分類カラムでは undefined。 */
  cluster?: number;
  /** カラム名（クラスタ名。無題・未分類の文言は呼び出し側が決める）。 */
  label: string;
  /** カラム名の色（クラスタ色）。 */
  color: string;
  /** カラム左端（世界座標）。 */
  x: number;
  /** カラム上端（世界座標）。 */
  y: number;
  width: number;
  subHeaders: readonly RenderCardSubHeader[];
}

/**
 * カード表示の描画情報。これを持つ RenderGraph は語を円ではなくカードとして描く。
 *
 * Why not RenderNode へ寸法を持たせるか: カードの寸法は全語で一定（要件書 §2.2）であり、
 * 語ごとに持たせると「語によって寸法が違う」状態が型の上で表現できてしまう。
 */
export interface RenderCardView {
  cardWidth: number;
  cardHeight: number;
  columns: readonly RenderCardColumn[];
}

export interface RenderGraph {
  nodes: readonly RenderNode[];
  links: readonly RenderLink[];
  /** レイヤー間の点線。単一表示と、点線を切っているときは空。 */
  timeLinks: readonly RenderTimeLink[];
  /** 描いたレイヤー。単一表示のときは空（レイヤー表示かどうかの判定に使う）。 */
  layers: readonly RenderLayer[];
  /** 描いたクラスタレーン。レーン表示でないときは空。 */
  clusterLanes: readonly RenderClusterLane[];
  /** カード表示の描画情報。card スキンでないときは持たない。 */
  cardView?: RenderCardView;
}
