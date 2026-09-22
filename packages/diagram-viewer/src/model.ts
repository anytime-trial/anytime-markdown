/**
 * 図を描くのに要る値の導出。DOM を触らないので、node 環境の検査から直接測れる。
 *
 * 自動配置（人物数ぶんの並べ替え）と、刻み・差分の適用（人物数ぶんの写像）を**分けて**受ける。
 * ドラッグは指を動かすたびに走るので、並べ替えまでやり直すと図が追随しない。
 *
 * 移植元は anytime-travel の `src/screens/Genealogy.tsx` の `useMemo` 群。
 */

import {
  applyDiagramPlacements,
  applyDiagramSpacing,
  type AutomaticChart,
  cellKey,
  cellLimit,
  type ChartNode,
  columnPitch,
  type ConnectorGeometry,
  connectorGeometry,
  type ConnectorEnd,
  type ConnectorPointAt,
  DEFAULT_DIAGRAM_SPACING,
  type DiagramAnchor,
  type DiagramConnector,
  type DiagramDocument,
  type DiagramFamily,
  type DiagramLayout,
  type DiagramLineLook,
  type DiagramSpacing,
  EMPTY_DIAGRAM_LAYOUT,
  familyConnector,
  familyLook,
  freeCellsPath,
  gridBounds,
  type GridCell,
  type GridExtent,
  anchorKey,
  layoutDiagram,
  MAX_PLACEMENTS_PER_DIAGRAM,
  midpointOf,
  paintableExtent,
  type PlacedChart,
  rowPitch,
} from '@anytime-markdown/diagram-core';

export interface FamilyConnector {
  readonly family: DiagramFamily;
  readonly junction: { readonly x: number; readonly y: number };
  readonly marriage: string | null;
  readonly descent: string | null;
  readonly points: readonly { readonly x: number; readonly y: number; readonly kind: string }[];
  /** 端の印を置く場所と向き。親側は結び目 1 つ、子側は子ごとに 1 つ。 */
  readonly caps: {
    readonly start: ConnectorPointAt | null;
    readonly ends: readonly ConnectorPointAt[];
  };
  /** この家族の線の見た目（上書きが無ければ種別から決まる既定）。 */
  readonly look: DiagramLineLook;
}

/**
 * 行・列を丸ごとずらせる図か、と**人物の居る列・行**。図の縁のアイコンを描くのに要る。
 *
 * 挿入・削除の可否は本来 `gridLineEdits` が位置ごとに決めるが、縁のアイコンは列と行の数だけ
 * 並ぶ。位置ごとに人物数ぶんの差分を組み立てると、ドラッグの 1 フレームごとにそれを全部やり直す
 * ことになる。そこで**どの位置でも成り立つ条件**だけをここで 1 度測り、位置ごとの本当の判定は
 * 押した瞬間に `gridLineEdits` が行う。
 */
export interface GridLines {
  readonly columns: ReadonlySet<number>;
  readonly rows: ReadonlySet<number>;
  /** いちばん後ろの人物が居る列・行。これより先に ＋ を出しても 1 升も動かない。 */
  readonly last: GridCell;
  readonly shiftable: boolean;
}

/**
 * 描ける手引きの線 1 本。**端の見つからない線はここに現れない**。
 *
 * 落とすのであって断らない。要素名を直すと線の端が一時的に迷子になるが、保存を止めると
 * 名前を直した瞬間に図が保存できなくなる（配置差分が名前の実在を照合しないのと同じ理由）。
 */
export interface DiagramLink {
  readonly connector: DiagramConnector;
  readonly geometry: ConnectorGeometry;
}

/**
 * 線の中点に出す取っ手 1 つ。**手で引いた線と家族の線を同じ形で渡す。**
 *
 * 画面の側で出どころを場合分けすると、片方へ手を入れた日にもう片方が取り残される（設定の区画を
 * 1 つに揃えたのと同じ理由）。`anchor` はそこから線を引いたときに端として保存する値。
 */
export interface LineMidpoint {
  readonly key: string;
  readonly anchor: DiagramAnchor;
  readonly x: number;
  readonly y: number;
  /** その線に添える字。無ければ空。**中点と同じ場所に出す**ので、位置を 2 か所で導かない。 */
  readonly label: string;
}

export interface DiagramModel {
  /** いま描いている図。編集中は下書き、そうでなければ保存済みの図。 */
  readonly source: DiagramDocument;
  readonly chart: PlacedChart;
  readonly byName: ReadonlyMap<string, ChartNode>;
  readonly spacing: DiagramSpacing;
  readonly placements: Readonly<Record<string, { readonly column: number; readonly row: number }>>;
  readonly connectors: readonly FamilyConnector[];
  /** 手で引いた線のうち、両端が図に出ているもの。 */
  readonly links: readonly DiagramLink[];
  readonly extent: GridExtent;
  /** 図の枠の大きさ。編集中は升目の広がりを下回らない。 */
  readonly surface: { readonly width: number; readonly height: number };
  /** いま人物が載っている升目 → その人物。空いている升目だけを塗るための母集合。 */
  readonly occupants: ReadonlyMap<string, string>;
  readonly occupied: ReadonlySet<string>;
  /** 空いた升目の塗り。編集中だけ組み立てる。 */
  readonly freeCells: string;
  /** 箱の大きさを掴める人物（左上の 1 人）。 */
  readonly resizeAnchor: string;
  readonly lines: GridLines;
  /** 線の中点の取っ手。描けている線のぶんだけ並ぶ。 */
  readonly midpoints: readonly LineMidpoint[];
  /** 保存済みと下書きが違うか。 */
  readonly changed: boolean;
}

/**
 * 自動配置の記憶。**並べ替えの入力（家族と単独の要素）が同じなら**やり直さない。
 *
 * 図そのものを鍵にしない。下書きは図の全体を持つので、升目を 1 つ動かすたびに別の図になり、
 * 記憶が毎フレーム外れる（指を動かすたびに人物数ぶんの並べ替えが走る）。並べ替えに効くのは
 * 家族と要素の一覧だけなので、その 2 つの同一性で見る。
 */
export function createAutomaticCache(): (document: DiagramDocument) => AutomaticChart {
  let families: readonly DiagramFamily[] | null = null;
  let nodes: readonly string[] | null = null;
  let value: AutomaticChart | null = null;
  return (document) => {
    if (families === document.families && nodes === document.nodes && value !== null) return value;
    families = document.families;
    nodes = document.nodes;
    value = layoutDiagram(document.families, document.nodes);
    return value;
  };
}

export interface DeriveOptions {
  /** 保存済みの図。 */
  readonly document: DiagramDocument;
  /** 編集中の下書き（図の全体）。`null` は編集していない状態。 */
  readonly draft: DiagramDocument | null;
  readonly automatic: AutomaticChart;
}

export function deriveModel({ document, draft, automatic }: DeriveOptions): DiagramModel {
  const editing = draft !== null;
  const source = draft ?? document;
  const layout = source.layout ?? EMPTY_DIAGRAM_LAYOUT;
  const placements = layout.placements;
  const spacing = layout.spacing ?? DEFAULT_DIAGRAM_SPACING;
  const chart = applyDiagramPlacements(applyDiagramSpacing(automatic, spacing), { placements, spacing });
  const byName = new Map(chart.nodes.map((node) => [node.name, node]));

  let anchor: ChartNode | undefined;
  for (const node of chart.nodes) {
    if (anchor === undefined || node.column < anchor.column
      || (node.column === anchor.column && node.row < anchor.row)) anchor = node;
  }

  const laneByColumn = new Map<number, number>();
  const connectors: FamilyConnector[] = source.families.map((family) => {
    const parentColumn = Math.min(...family.parents.map((parent) => byName.get(parent)!.x));
    const lane = laneByColumn.get(parentColumn) ?? 0;
    laneByColumn.set(parentColumn, lane + 1);
    const look = familyLook(family);
    return {
      ...familyConnector(family, byName, { lane, spacing, route: look.route }),
      family,
      look,
    };
  });

  const extent = paintableExtent(chart.nodes, [...chart.automatic.values()]);
  const surface = editing
    ? (() => {
      const bounds = gridBounds(spacing, extent);
      return { width: Math.max(chart.width, bounds.width), height: Math.max(chart.height, bounds.height) };
    })()
    : { width: chart.width, height: chart.height };

  // 集合でなく対応にするのは、**同じ升目に 2 人来たとき**に 1 件へ畳まないため。畳むと、掴んだ
  // 人物の升目を除くだけでもう 1 人の居る升目が空きに見え、そこへ重ねられてしまう。
  const occupants = new Map<string, string>();
  for (const node of chart.nodes) {
    const key = cellKey({ column: node.column, row: node.row });
    if (!occupants.has(key)) occupants.set(key, node.name);
  }
  const occupied = new Set(occupants.keys());

  /*
    手で引いた線を解く。**端が別の線の中点を指すことがある**ので、解けた線を覚えながら何周か回す。

    1 周で済ませない。ファイルの並び順は端の依存順とは限らず、1 周だと「後ろに書いてある線の
    中点」を指した線がその回だけ解けず、保存し直すたびに見えたり消えたりする。

    解けない線（端の要素が図に出ない・輪を作っている・重なって向きが決まらない）は**描かない**。
    断らずに落とすのは、要素名を直した瞬間に図が保存できなくなるのを避けるため。
  */
  const links: DiagramLink[] = [];
  const solved = new Map<string, ConnectorGeometry>();
  const familyByParents = new Map<string, (typeof connectors)[number]>();
  for (const connector of connectors) {
    // 子の居ない家族には降りる線が無いので、結び目も無い（端として指せない）。
    if (connector.family.children.length === 0) continue;
    const key = anchorKey({ kind: 'family', parents: connector.family.parents });
    // 同じ親の組が 2 件あれば**先に書いてあるほうを指す**（画面もこの 2 件を見分けていない）。
    if (!familyByParents.has(key)) familyByParents.set(key, connector);
  }
  const endOf = (anchor: DiagramAnchor): ConnectorEnd | undefined => {
    if (anchor.kind === 'element') return byName.get(anchor.name);
    if (anchor.kind === 'family') return familyByParents.get(anchorKey(anchor))?.junction;
    const target = solved.get(anchor.line);
    return target === undefined ? undefined : midpointOf(target);
  };
  for (let pending = [...source.connectors]; pending.length > 0;) {
    const rest: DiagramConnector[] = [];
    for (const connector of pending) {
      const from = endOf(connector.from);
      const to = endOf(connector.to);
      if (from === undefined || to === undefined) { rest.push(connector); continue; }
      const geometry = connectorGeometry(from, to, spacing, connector);
      if (geometry === null) continue;
      solved.set(connector.id, geometry);
      links.push({ connector, geometry });
    }
    // 1 周回して 1 本も解けなければ、残りは端が見つからないか輪になっている。そこで止める。
    if (rest.length === pending.length) break;
    pending = rest;
  }

  /*
    中点の取っ手。家族の線は**結び目**を使う（経路の中点ではない）。

    家族の線は親の横棒と子への縦棒でできており、経路全体の中点は「どの子が居るか」で動く。
    結び目なら家族の形が変わっても同じ意味の点を指し続ける。子の居ない家族には降りる線が無いので
    取っ手も出さない。
  */
  const midpoints: LineMidpoint[] = [];
  for (const [key, connector] of familyByParents) {
    midpoints.push({
      key,
      anchor: { kind: 'family', parents: connector.family.parents },
      label: connector.family.label ?? '',
      ...connector.junction,
    });
  }
  for (const link of links) {
    const at = midpointOf(link.geometry);
    const anchor: DiagramAnchor = { kind: 'line', line: link.connector.id };
    midpoints.push({ key: anchorKey(anchor), anchor, label: link.connector.label ?? '', ...at });
  }

  return {
    source,
    chart,
    byName,
    spacing,
    placements,
    connectors,
    links,
    extent,
    surface,
    occupants,
    occupied,
    freeCells: editing ? freeCellsPath(spacing, extent, occupied) : '',
    resizeAnchor: anchor?.name ?? '',
    lines: deriveGridLines(chart, placements, byName, spacing),
    midpoints,
    changed: draft !== null && documentChanged(draft, document),
  };
}

/**
 * 下書きが保存済みと違うか。
 *
 * 升目は毎フレーム変わるので鍵を組んで比べ、図の中身（家族・要素・線・注記）は**まず同一性で**
 * 見る。中身は押下のたびにしか変わらず、変わらない間は同じ配列を持ち回るので、同一性で済む
 * 限り人物数ぶんの文字列化を毎フレーム走らせずに済む。同一性が割れたときだけ中身で決める
 * （同じ値で作り直した直後に「変更あり」と言わないため）。
 */
export function documentChanged(draft: DiagramDocument, saved: DiagramDocument): boolean {
  if (layoutKey(draft.layout ?? EMPTY_DIAGRAM_LAYOUT) !== layoutKey(saved.layout ?? EMPTY_DIAGRAM_LAYOUT)) return true;
  const sameReferences = draft.families === saved.families
    && draft.nodes === saved.nodes
    && draft.shapes === saved.shapes
    && draft.connectors === saved.connectors
    && draft.groups === saved.groups
    && draft.annotations === saved.annotations;
  if (sameReferences) return false;
  return JSON.stringify(contentKey(draft)) !== JSON.stringify(contentKey(saved));
}

/** 中身の比較に使う形。鍵の順に依らないよう、対応は並べ替えてから組む。 */
function contentKey(document: DiagramDocument) {
  return {
    families: document.families,
    // 群の語彙も中身。落とすと、軸や選択肢だけを直した図が「変更なし」になって保存が押せず、
    // 編集を終うときに黙って捨てられる（形を落としていた頃と同じ破れ）。
    groups: document.groups,
    nodes: [...document.nodes].sort(),
    // 形も中身。落とすと、形だけ変えた図が「変更なし」になって保存が押せず、編集を終うときに
    // 黙って捨てられる（実機で観測）。名前を鍵にする項目は並べ替えてから比べる。
    shapes: Object.keys(document.shapes).sort().map((name) => [name, document.shapes[name]]),
    connectors: [...document.connectors].sort((left, right) => (left.id < right.id ? -1 : 1)),
    annotations: Object.keys(document.annotations).sort().map((name) => [name, document.annotations[name]]),
  };
}

function deriveGridLines(
  chart: PlacedChart,
  placements: Readonly<Record<string, { readonly column: number; readonly row: number }>>,
  byName: ReadonlyMap<string, ChartNode>,
  spacing: DiagramSpacing,
): GridLines {
  const columns = new Set<number>();
  const rows = new Set<number>();
  const cells: GridCell[] = chart.nodes.map((node) => ({ column: node.column, row: node.row }));
  // 図に出ない古い差分（人物名を直した後に残ったもの）も数える。保存はされるので、
  // 「空に見える行」を詰めると升目が重なる。
  for (const [name, cell] of Object.entries(placements)) if (!byName.has(name)) cells.push(cell);
  const taken = new Set<string>();
  let overlapping = false;
  let last: GridCell = { column: 0, row: 0 };
  for (const cell of cells) {
    columns.add(cell.column);
    rows.add(cell.row);
    if (taken.has(cellKey(cell))) overlapping = true;
    taken.add(cellKey(cell));
    last = { column: Math.max(last.column, cell.column), row: Math.max(last.row, cell.row) };
  }
  const shiftable = !overlapping
    && cells.length <= MAX_PLACEMENTS_PER_DIAGRAM
    && last.column + 1 <= cellLimit(columnPitch(spacing))
    && last.row + 1 <= cellLimit(rowPitch(spacing));
  return { columns, rows, last, shiftable };
}

/**
 * 比較のための文字列。鍵を並べ替えるのは、オブジェクトの鍵の順だけで「変わった」と言わないため。
 *
 * 刻みも同じ鍵に含める。含め忘れると、間隔だけを変えた下書きが「変更なし」と判定され、保存が
 * 押せないまま編集を終うと確認もなく捨てられる。
 */
export function layoutKey(layout: DiagramLayout): string {
  const placements = layout.placements;
  const sorted = Object.keys(placements).sort()
    .map((name) => [name, placements[name]!.column, placements[name]!.row] as const);
  return JSON.stringify([sorted, layout.spacing ?? null]);
}

/**
 * 人物の札に添える群の名前。宣言順で最初の軸から順に並べる。
 *
 * 同じ組み合わせは 1 つに畳む（同じ巻・章段に何度も出る人物の札が同じ語で埋まらないように）。
 */
/**
 * 札に出す群の札と、**その札を生んだ家族**。
 *
 * 札だけを返していた頃は、押した行がどの家族の値なのかを画面が知らず、選び直す先を決められ
 * なかった。同じ札を複数の家族が生む場合は**先に書いてある家族**を指す（札は 1 行に畳まれて
 * おり、画面上でも見分けが付かない）。
 */
/**
 * 選んだ要素につながる部分。**1 つ隣まで**（選んだ要素・その要素に付く線・線の相手）。
 *
 * 何歩でも辿らない。図はたいてい 1 つの連結成分なので、辿り続けると「関連」が図の全体に戻り、
 * 絞った意味が無くなる。
 */
export interface RelatedParts {
  readonly names: ReadonlySet<string>;
  /** 関わる家族の番号（`document.families` の添字）。 */
  readonly families: ReadonlySet<number>;
  /** 関わる手引きの線の id。 */
  readonly links: ReadonlySet<string>;
  /** 関わる線の端の鍵（`anchorKey`）。線に添える字を絞るのに使う。 */
  readonly lineKeys: ReadonlySet<string>;
}

/**
 * 選んだ要素の**関連箇所**。閲覧中に選んだとき、ここに入らないものを薄くする。
 *
 * 判定の元は**選んだ名前だけ**（辿りながら増えた名前を混ぜない）。混ぜると、家族を 1 件通る
 * ごとに関連が広がり、2 歩 3 歩先まで明るいままになる。
 */
export function relatedTo(document: DiagramDocument, chosen: readonly string[]): RelatedParts {
  const picked = new Set(chosen);
  const names = new Set(chosen);
  const families = new Set<number>();
  const links = new Set<string>();
  const lineKeys = new Set<string>();
  if (picked.size === 0) return { names, families, links, lineKeys };

  const familyIndexOf = (parents: readonly string[]): number =>
    document.families.findIndex((family) => anchorKey({ kind: 'family', parents: family.parents })
      === anchorKey({ kind: 'family', parents }));
  const takeFamily = (index: number): void => {
    const family = document.families[index];
    if (family === undefined || families.has(index)) return;
    families.add(index);
    lineKeys.add(anchorKey({ kind: 'family', parents: family.parents }));
    for (const member of [...family.parents, ...family.children]) names.add(member);
  };
  const takeLink = (id: string): void => {
    if (links.has(id)) return;
    links.add(id);
    lineKeys.add(anchorKey({ kind: 'line', line: id }));
  };
  /** 線の相手側。要素なら名前を、線・家族の線ならその線そのものを関連に入れる。 */
  const takeOther = (anchor: DiagramAnchor): void => {
    if (anchor.kind === 'element') names.add(anchor.name);
    else if (anchor.kind === 'line') takeLink(anchor.line);
    else takeFamily(familyIndexOf(anchor.parents));
  };

  for (const [index, family] of document.families.entries()) {
    if ([...family.parents, ...family.children].some((member) => picked.has(member))) takeFamily(index);
  }
  for (const connector of document.connectors) {
    const touches = (anchor: DiagramAnchor): boolean => anchor.kind === 'element' && picked.has(anchor.name);
    if (!touches(connector.from) && !touches(connector.to)) continue;
    takeLink(connector.id);
    takeOther(connector.from);
    takeOther(connector.to);
  }
  return { names, families, links, lineKeys };
}

export function groupBadgesOf(
  document: DiagramDocument,
  name: string,
): readonly { readonly label: string; readonly family: number }[] {
  const badges: { label: string; family: number }[] = [];
  const seen = new Set<string>();
  for (const [index, family] of document.families.entries()) {
    if (!family.parents.includes(name) && !family.children.includes(name)) continue;
    const label = document.groups
      .map((axis) => axis.values[family.groups[axis.id] ?? ''] ?? '')
      .filter((text) => text !== '')
      .join(' · ');
    /*
      値を持たない家族も**行として返す**（字は空）。画面は編集中だけ薄い誘い文にして出す。

      落としていた頃は、群をまだ付けていない家族に押す場所そのものが無く、軸を 1 本も持たない
      図では群の編集へ入る道が画面から消えていた（注記の枠を空でも残すことにしたのと同じ破れ）。
      同じ字の行は 1 つに畳むが、空の行は**家族ごとに 1 つ**残す — 行き先の家族が違うため。
    */
    if (label !== '' && seen.has(label)) continue;
    if (label !== '') seen.add(label);
    badges.push({ label, family: index });
  }
  return badges;
}

export function groupLabelsOf(document: DiagramDocument, name: string): readonly string[] {
  const appearances = document.families.filter((f) => f.parents.includes(name) || f.children.includes(name));
  return [...new Set(appearances
    .map((family) => document.groups
      .map((axis) => axis.values[family.groups[axis.id] ?? ''] ?? '')
      .filter((label) => label !== '')
      .join(' · '))
    .filter((label) => label !== ''))];
}

/** その人物の親（生成元）。読み上げ用の補足に使う。 */
export function parentsOf(document: DiagramDocument, name: string): readonly string[] {
  return [...new Set(document.families.filter((f) => f.children.includes(name)).flatMap((f) => f.parents))];
}
