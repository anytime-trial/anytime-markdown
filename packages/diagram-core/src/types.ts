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

/** 手で引いた線の引き方。 */
export const DIAGRAM_LINE_STYLES = ['solid', 'dashed'] as const;
export type DiagramLineStyle = (typeof DIAGRAM_LINE_STYLES)[number];

/**
 * 線の端の印。
 *
 * 綴りは兄弟パッケージ `@anytime-markdown/graph-core` の `EndpointShape` に合わせる
 * （あちらは `'none' | 'arrow' | 'circle' | 'diamond' | 'bar'`）。同じ概念を別の綴りで 2 か所に
 * 持つと、片方へ形を足した日にもう片方が取り残される。
 */
export const DIAGRAM_ENDPOINTS = ['none', 'circle', 'arrow'] as const;
export type DiagramEndpoint = (typeof DIAGRAM_ENDPOINTS)[number];

/**
 * 線の色。**色そのものではなく役割の名前**を持つ。
 *
 * `#c0392b` のような値を保存しない。図は宿主（VS Code / web-app）の配色をそのまま引いており、
 * 値を焼き込むと**ダークとライトの片方でだけ背景に溶ける線**が作れてしまう。名前で持てば、
 * 実際の色は描くときに宿主のトークンから引き直せる。
 *
 * 増やすときは、その名前に当たるトークンが**両方のモードで読める**ことを確かめてから足す。
 */
export const DIAGRAM_LINE_COLORS = ['default', 'accent', 'danger', 'muted'] as const;
export type DiagramLineColor = (typeof DIAGRAM_LINE_COLORS)[number];

/**
 * 手で引いた接続線 1 本。家族から導く関係線とは別に持つ。
 *
 * 家族（`DiagramFamily`）へ寄せない。家族は「親から子へ」という向きと世代の意味を持ち、自動配置の
 * 列を決める入力でもある。手で引いた線に同じ意味を負わせると、装飾のつもりで引いた 1 本が図の
 * 並びを組み替える。
 */
export interface DiagramConnector {
  /**
   * 図の中で一意の id。
   *
   * 端の名前（`from` / `to`）を鍵にしない。同じ 2 つを別の線種で 2 本結べるようにするためと、
   * 要素を改名したときに線の同一性（選択中の線・設定した端の印）を保つため。
   */
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly line: DiagramLineStyle;
  /** 線の色の役割名。古いファイルには無いので、読み取りは `'default'` で埋める。 */
  readonly color: DiagramLineColor;
  /** `from` 側の端の印。 */
  readonly start: DiagramEndpoint;
  /** `to` 側の端の印。 */
  readonly end: DiagramEndpoint;
}

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
  /**
   * 家族に現れない要素の名前。図に置けるのは「家族に出る人物」と「ここに在る要素」の和。
   *
   * 家族に出る人物をここへ写さない（和で取る）のは、写しを持つと家族を直したときに 2 か所を
   * 揃える仕事が生まれ、揃え損ねた側が「図に出ない要素」「消したのに残る要素」になるため。
   */
  readonly nodes: readonly string[];
  /** 手で引いた接続線。家族から導く関係線とは別の層。 */
  readonly connectors: readonly DiagramConnector[];
  /** 特定の人物に添える短い注記。 */
  readonly annotations: Readonly<Record<string, string>>;
  /** 自動配置に対する上書き。動かした人物と、既定と違う刻みだけが載る。 */
  readonly layout: DiagramLayout;
}

/** 差分を持たない図の既定値。毎回新しい `{}` を作らないよう凍結して配る。 */
export const EMPTY_DIAGRAM_LAYOUT: DiagramLayout = Object.freeze({ placements: Object.freeze({}) });
