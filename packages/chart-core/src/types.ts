/**
 * chart-core 共有型。全フェーズ（chart-core / markdown-rich / spreadsheet-viewer / ホスト）が
 * この定義を `import type` で参照する単一ソース。手書き再定義は禁止（ドリフト防止）。
 */

export type ChartKind = "line" | "bar" | "scatter" | "area" | "pie" | "combo";

/** デジタル庁チャートパレットの系統キー。 */
export type PaletteKey =
  | "blue"
  | "lightBlue"
  | "cyan"
  | "green"
  | "orange"
  | "red"
  | "solidGray";

/** 1 系列。line/bar は values（カテゴリ整列）、scatter は points を使う。 */
export interface Series {
  readonly name: string;
  /** line / bar 用。欠損は null。 */
  readonly values?: ReadonlyArray<number | null>;
  /** scatter 用。 */
  readonly points?: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  /** パレットからの自動色割当を上書きする場合のみ指定。 */
  readonly color?: string;
  /** 目標値などを破線で描く場合 true。 */
  readonly dashed?: boolean;
  /** line で欠損(null)を跨いで線を連結する（既定 false=欠損で線を切る）。 */
  readonly connectNulls?: boolean;
  /** 強調しない（減色）系列は false。既定 true。 */
  readonly emphasized?: boolean;
  /** combo グラフでの系列描画種別（既定 "bar"）。 */
  readonly type?: "bar" | "line" | "area";
  /** 数量軸の左右割当（既定 "left"）。"right" 系列があれば第2Y軸を描く。 */
  readonly axis?: "left" | "right";
}

/** 参照値帯（shaded band）。 */
export interface ReferenceBand {
  readonly from: number;
  readonly to: number;
  readonly label?: string;
}

/** 特定カテゴリ位置に重ねるイベント印（コミット・エラー等）。 */
export interface ChartMarker {
  /** categories のインデックス。 */
  readonly xIndex: number;
  readonly label?: string;
  /** 既定 "line"（縦線）。"point" は上端の小ドット。 */
  readonly style?: "point" | "line";
  readonly color?: string;
}

export interface AxisOptions {
  /** 単位を含めた軸ラベル。 */
  readonly label?: string;
  /** 既定 true。原点を 0 に固定する（恣意的な軸範囲を禁止）。 */
  readonly zeroBaseline?: boolean;
  /** zeroBaseline=false のときのみ有効。 */
  readonly min?: number;
  readonly max?: number;
}

export interface ChartOptions {
  readonly stacked?: boolean;
  readonly grouped?: boolean;
  /** bar のとき横棒にする（数量軸＝横/x、分類軸＝縦/y）。 */
  readonly horizontal?: boolean;
  /** pie のとき中心をくり抜きドーナツにする（中央に全体総量を表示）。 */
  readonly donut?: boolean;
  /** 既定 "near-line"。 */
  readonly legend?: "near-line" | "adjacent" | "none";
  /** 既定 "auto"（コントラスト判定で併記/ホバーを決める）。 */
  readonly valueLabels?: "auto" | "always" | "hover";
  readonly referenceBand?: ReferenceBand;
  readonly xAxis?: AxisOptions;
  readonly yAxis?: AxisOptions;
  /** 第2Y軸（右軸）の軸設定。ラベル描画に使う。 */
  readonly yAxisRight?: AxisOptions;
  readonly meta?: {
    readonly source?: string;
    readonly updatedAt?: string;
    readonly note?: string;
  };
}

export interface ChartSpec {
  readonly kind: ChartKind;
  /** 内容 + データ種別（例「国産自動車の出荷台数（月次推移）」）。 */
  readonly title?: string;
  /** line/bar の x 軸ラベル。 */
  readonly categories?: ReadonlyArray<string>;
  readonly series: ReadonlyArray<Series>;
  readonly options?: ChartOptions;
  /** カテゴリ位置に重ねるイベント印（pie/横棒では無視）。 */
  readonly markers?: ReadonlyArray<ChartMarker>;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ChartThemePalette {
  /** 系列割当色（強調順）。 */
  readonly series: ReadonlyArray<string>;
  /** 非強調系列色。 */
  readonly muted: string;
  readonly axis: string;
  readonly grid: string;
  readonly label: string;
  readonly text: string;
  readonly background: string;
}

export interface ChartTheme {
  readonly mode: "light" | "dark";
  readonly palette: ChartThemePalette;
}

/** hit-test 対象の描画済みデータ点。 */
export interface PlottedPoint {
  readonly seriesIndex: number;
  readonly dataIndex: number;
  readonly cx: number;
  readonly cy: number;
  readonly value: number;
}

export interface ChartLayout {
  readonly spec: ChartSpec;
  readonly plotRect: Rect;
  readonly points: ReadonlyArray<PlottedPoint>;
}

export interface ChartHit {
  readonly seriesIndex: number;
  readonly dataIndex: number;
  readonly value: number;
  readonly label: string;
}

/** spreadsheet 範囲（fromTable 入力）。 */
export interface TableRange {
  readonly startRow: number;
  readonly startCol: number;
  readonly endRow: number;
  readonly endCol: number;
}

export interface TableMapping {
  readonly kind: ChartKind;
  /** 先頭行をヘッダ（系列名）とみなす。既定 true。 */
  readonly headerRow?: boolean;
  /** カテゴリに使う列インデックス（orientation=columns 時）。既定 0。 */
  readonly categoryCol?: number;
  /** 系列を列方向に取るか行方向に取るか。既定 "columns"。 */
  readonly orientation?: "columns" | "rows";
}
