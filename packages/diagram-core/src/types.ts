/**
 * 系図（ダイアグラム）のデータ形式（`*.diagram.json`）。
 *
 * 人物は家族の一覧から導き、別表を持たない — 人物の別表を置くと「表には在るが家族に出ない人物」
 * が生まれ、図に描けない行が静かに増える。
 *
 * 配置差分は自動配置（`layoutDiagram`）への人物単位の上書きで、動かした人物だけが載る。
 * 全人物の座標を固定しないのは、人物を足すたびに全体を並べ直すことになるため。
 *
 * 移植元は anytime-travel の `shared/genealogy.ts`。あちらは系図データ（静的資産）と配置差分
 * （サーバのオブジェクト）を 2 系統に分けていたが、VS Code はファイル単位で編集するため
 * 1 ファイルへ統合した（`layout` を文書の一部として持つ）。
 */

/** 関係の種別。線の見た目は共通で、呼び名だけを図ごとに差し替える。 */
export const DIAGRAM_RELATIONS = ['birth', 'creation', 'oath'] as const;
export type DiagramRelation = (typeof DIAGRAM_RELATIONS)[number];

export interface DiagramFamily {
  readonly parents: readonly string[];
  readonly children: readonly string[];
  readonly kind: DiagramRelation;
  /** 群の値。`groups` が宣言した軸の id を鍵にする。 */
  readonly groups: Readonly<Record<string, string>>;
}

/** 分類の軸 1 本。人物の札には宣言順で最初の軸から順に添える。 */
export interface DiagramGroupAxis {
  readonly id: string;
  readonly label: string;
  readonly values: Readonly<Record<string, string>>;
}

/**
 * 人物 1 人の配置。**升目の番号**で持ち、px では持たない。
 *
 * px で持つと、刻み（`DiagramSpacing`）を変えたときに手で置いた人物だけが升目から外れる
 * — 自動配置は新しい刻みで引き直されるのに、保存済みの px は取り残されるため。升目の番号なら
 * 「どの升目に置いたか」が刻みと独立に残り、座標は描くときに引き直せる。
 */
export interface DiagramPlacement {
  readonly column: number;
  readonly row: number;
}

/**
 * 図の刻み。**全列で共通の 1 組**で、列ごとには持たない。
 *
 * `columnGap` は列と列のすき間、`nodeWidth` は人物の箱の幅。列の間隔そのものを持たないのは、
 * 箱の幅を変えたときに「すき間が変わらない」ことを保てなくなるため（列の間隔＝箱の幅＋すき間）。
 */
export interface DiagramSpacing {
  /** 列と列のすき間（px）。 */
  readonly columnGap: number;
  /** 人物の箱の幅（px）。 */
  readonly nodeWidth: number;
  /** 同じ列に積む箱どうしの縦のすき間（px）。 */
  readonly rowGap: number;
  /** 人物の箱の高さ（px）。 */
  readonly nodeHeight: number;
}

export interface DiagramLayout {
  /** 人物名 → 配置。動かした人物だけが載る。 */
  readonly placements: Readonly<Record<string, DiagramPlacement>>;
  /** 図の刻み。既定と同じなら持たない。 */
  readonly spacing?: DiagramSpacing;
}

/**
 * `*.diagram.json` 1 ファイルの中身。
 *
 * 題名・導入文・注記・凡例・群の語彙・家族の一覧・人物の注記・配置差分をまとめて持つ。
 * 画面はこの形だけを読み、図の主題（古事記・家系・組織図など）をコードに書かない。
 */
export interface DiagramDocument {
  readonly version: 1;
  readonly title: string;
  readonly lead: string;
  readonly note: string;
  /** 凡例の一文。線の意味をその図の言葉で説明する。 */
  readonly legend: string;
  readonly groups: readonly DiagramGroupAxis[];
  readonly families: readonly DiagramFamily[];
  /** 特定の人物に添える短い注記。 */
  readonly annotations: Readonly<Record<string, string>>;
  /** 自動配置に対する上書き。動かした人物と、既定と違う刻みだけが載る。 */
  readonly layout: DiagramLayout;
}

/** 差分を持たない図の既定値。毎回新しい `{}` を作らないよう凍結して配る。 */
export const EMPTY_DIAGRAM_LAYOUT: DiagramLayout = Object.freeze({ placements: Object.freeze({}) });
