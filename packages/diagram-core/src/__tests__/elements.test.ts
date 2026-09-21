/**
 * 単独の要素（`nodes`）・手で引いた接続線（`connectors`）・改名・空いた升目の ＋。
 *
 * 移植元（家族だけの系図）に無かった層なので、家族の検査（`document.test.ts` ほか）とは
 * 別のファイルに置く。どの規則が効いて結果が決まったのかを 1 ファイルの中で追えるようにする。
 */

import {
  createEmptyDiagramDocument,
  diagramPeople,
  nextElementName,
  parseDiagramDocument,
  parseDiagramFile,
  removeDiagramConnectors,
  removeDiagramElement,
  renameDiagramElement,
  serializeDiagramDocument,
  setDiagramAnnotation,
  setDiagramFamilyGroup,
  validateDiagramDocument,
} from '../document';
import { familyLook } from '../connectors';
import { insertGapEdit, visibleCells } from '../grid';
import { diagramChart, layoutDiagram } from '../layout';
import { DEFAULT_DIAGRAM_SPACING } from '../spacing';
import {
  type DiagramConnector,
  type DiagramDocument,
  elementAnchor,
  familyAnchor,
  lineAnchor,
} from '../types';
import { applied, homes, node, SAMPLE } from './fixture';

const CONNECTOR: DiagramConnector = {
  id: 'c1',
  from: elementAnchor('祖父'),
  to: elementAnchor('化生'),
  line: 'dashed',
  color: 'accent',
  route: 'straight',
  start: 'circle',
  end: 'arrow',
};

/**
 * 読み取りへ直に渡すための**ファイルの形**（端は文字列）。
 *
 * 型の付いた `DiagramConnector` をそのまま読み取りへ渡さない。あちらの端はオブジェクトで、
 * ファイルに書かれる形とは別物である（要素の端は文字列で書く）。
 */
const fileAnchor = (anchor: DiagramConnector['from']) => {
  if (anchor.kind === 'element') return anchor.name;
  if (anchor.kind === 'line') return { line: anchor.line };
  return { family: anchor.parents };
};

const asFile = (connector: DiagramConnector) => ({
  ...connector,
  from: fileAnchor(connector.from),
  to: fileAnchor(connector.to),
});

const WITH_ELEMENTS: DiagramDocument = {
  ...SAMPLE,
  nodes: ['単独の要素'],
  connectors: [CONNECTOR],
};

describe('単独の要素', () => {
  it('家族に出ない名前も図に描ける要素として数える', () => {
    expect(diagramPeople(SAMPLE.families, ['単独の要素']).has('単独の要素')).toBe(true);
  });

  it('家族にも出る名前を書いても札は 1 枚に畳まれる', () => {
    const people = diagramPeople(SAMPLE.families, ['祖父']);
    expect([...people].filter((name) => name === '祖父')).toHaveLength(1);
  });

  it('家族が 0 件でも要素があれば読める', () => {
    const document = parseDiagramDocument({
      version: 1, title: '図', lead: '', note: '', legend: '',
      groups: [], families: [], nodes: ['甲', '乙'],
    });
    expect(document?.nodes).toEqual(['甲', '乙']);
  });

  it('家族も要素も無い図は読まない', () => {
    const warnings: string[] = [];
    const document = parseDiagramDocument({
      version: 1, title: '図', lead: '', note: '', legend: '', groups: [], families: [],
    }, (message) => warnings.push(message));
    expect(document).toBeNull();
    expect(warnings.join('')).toContain('描ける要素がありません');
  });

  it('自動配置では家族の図と行を共有しない（重なりで行・列の増減が塞がらない）', () => {
    const chart = layoutDiagram(SAMPLE.families, ['単独の要素']);
    const extra = chart.nodes.find((node) => node.name === '単独の要素')!;
    const familyRows = chart.nodes.filter((node) => node.name !== '単独の要素' && node.column === 0)
      .map((node) => node.row);
    expect(familyRows).not.toContain(extra.row);
    expect(extra.row).toBeGreaterThan(Math.max(...familyRows));
  });

  it('要素を足しても家族側の升目は動かない', () => {
    const before = layoutDiagram(SAMPLE.families).nodes.map((node) => `${node.name}:${node.column},${node.row}`);
    const after = layoutDiagram(SAMPLE.families, ['単独の要素']).nodes
      .filter((node) => node.name !== '単独の要素')
      .map((node) => `${node.name}:${node.column},${node.row}`);
    expect(after).toEqual(before);
  });

  it('要素が 1 つも無くても枠の大きさが負にならない', () => {
    const chart = diagramChart([], null, []);
    expect(chart.width).toBeGreaterThan(0);
    expect(chart.height).toBeGreaterThan(0);
  });
});

describe('接続線の読み書き', () => {
  it('書いて読み戻すと同じ図になる', () => {
    expect(parseDiagramFile(serializeDiagramDocument(WITH_ELEMENTS))).toEqual(WITH_ELEMENTS);
  });

  it('要素も接続線も無い図には空の入れ物を書かない', () => {
    const json = serializeDiagramDocument(SAMPLE);
    expect(json).not.toContain('"nodes"');
    expect(json).not.toContain('"connectors"');
  });

  it('読めない線が 1 本でもあれば図ごと読まない（1 本ずつ静かに消さない）', () => {
    const warnings: string[] = [];
    const document = parseDiagramDocument({
      ...WITH_ELEMENTS,
      connectors: [{ ...CONNECTOR, line: 'dotted' }],
    }, (message) => warnings.push(message));
    expect(document).toBeNull();
    expect(warnings.join('')).toContain('connectors');
  });

  it('id が重複した線を受けない', () => {
    const document = parseDiagramDocument({
      ...WITH_ELEMENTS,
      connectors: [CONNECTOR, { ...CONNECTOR, to: '妹' }],
    });
    expect(document).toBeNull();
  });
});

describe('改名', () => {
  const renamed = renameDiagramElement(
    { ...WITH_ELEMENTS, annotations: { 祖父: '注記' }, layout: { placements: { 祖父: { column: 1, row: 2 } } } },
    '祖父',
    '始祖',
  );

  it('家族・注記・配置差分・接続線を同時に付け替える', () => {
    expect(renamed.families[0]!.parents).toContain('始祖');
    expect(renamed.annotations).toEqual({ 始祖: '注記' });
    expect(renamed.layout.placements).toEqual({ 始祖: { column: 1, row: 2 } });
    expect(renamed.connectors[0]!.from).toEqual(elementAnchor('始祖'));
  });

  it('付け替え先が既に在るなら何もしない（2 つの要素を畳まない）', () => {
    expect(renameDiagramElement(WITH_ELEMENTS, '祖父', '祖母')).toBe(WITH_ELEMENTS);
  });

  it('図に出ない名前は付け替えない', () => {
    expect(renameDiagramElement(WITH_ELEMENTS, '居ない', '新しい')).toBe(WITH_ELEMENTS);
  });

  it('単独の要素も付け替えられる', () => {
    expect(renameDiagramElement(WITH_ELEMENTS, '単独の要素', '改名後').nodes).toEqual(['改名後']);
  });
});

describe('新しい名前', () => {
  it('空いている番号を選ぶ', () => {
    expect(nextElementName(new Set(['要素 1', '要素 3']))).toBe('要素 2');
  });

  it('図が空なら 1 から始める', () => {
    expect(nextElementName(new Set())).toBe('要素 1');
  });

  it('新規作成の雛形はそのまま読み戻せる', () => {
    const empty = createEmptyDiagramDocument('新しい図');
    expect(parseDiagramFile(serializeDiagramDocument(empty))).toEqual(empty);
  });
});

describe('図の全体の検証', () => {
  it('読み戻せる図は通る', () => {
    const result = validateDiagramDocument(JSON.parse(serializeDiagramDocument(WITH_ELEMENTS)));
    expect(result.ok).toBe(true);
  });

  it('同じ升目に重なった配置は断る（読み取りのように黙って寄せない）', () => {
    const result = validateDiagramDocument({
      ...JSON.parse(serializeDiagramDocument(WITH_ELEMENTS)),
      layout: { placements: { 祖父: { column: 1, row: 1 }, 祖母: { column: 1, row: 1 } } },
    });
    expect(result.ok).toBe(false);
  });

  it('端が図に出ない線は断らない（名前を直した瞬間に保存できなくならない）', () => {
    const result = validateDiagramDocument({
      ...JSON.parse(serializeDiagramDocument(WITH_ELEMENTS)),
      connectors: [{ ...asFile(CONNECTOR), to: '居ない人' }],
    });
    expect(result.ok).toBe(true);
  });
});

describe('空いた升目の ＋', () => {
  const base = {
    spacing: DEFAULT_DIAGRAM_SPACING,
    extent: { columns: 4, rows: 4 },
    view: { x: 0, y: 0, scale: 1 },
    frame: { width: 2000, height: 2000 },
    occupied: new Set<string>(),
    limit: 200,
  };

  it('人物の載っている升目には出さない', () => {
    const cells = visibleCells({ ...base, occupied: new Set(['0,0']) });
    expect(cells).toHaveLength(15);
    expect(cells).not.toContainEqual({ column: 0, row: 0 });
  });

  it('枠に入らない升目は数えない', () => {
    const cells = visibleCells({ ...base, frame: { width: 300, height: 300 } });
    expect(cells.every((cell) => cell.column <= 1 && cell.row <= 1)).toBe(true);
  });

  it('升目が ＋ の 2 倍より小さくなる倍率では 1 つも出さない', () => {
    expect(visibleCells({ ...base, view: { x: 0, y: 0, scale: 0.14 } })).toEqual([]);
  });

  it('枠が未計測（0）なら出さない', () => {
    expect(visibleCells({ ...base, frame: { width: 0, height: 0 } })).toEqual([]);
  });

  it('上限を超えたら間引かずに空を返す', () => {
    expect(visibleCells({ ...base, limit: 4 })).toEqual([]);
  });
});

describe('上・左への割り込み', () => {
  const LIMIT = { column: 500, row: 500 };
  /** 列 1 に 3 人、行 0 に 3 人。割り込みの止まり方を両方の軸で測れる最小の形。 */
  const NODES = [node('甲', 1, 0), node('乙', 1, 1), node('丙', 1, 3), node('丁', 2, 0), node('戊', 4, 0)];
  const HOMES = homes(NODES);

  it('上へ割り込むと、同じ列の次の空きまでが 1 升下がる', () => {
    // 列 1 は 0・1・3 が埋まり 2 が空く。甲の手前へ割り込むと 甲・乙 が下がり、丙は動かない。
    const next = insertGapEdit(NODES, {}, { column: 1, row: 0 }, 'row', LIMIT, HOMES)!;
    expect(next).toEqual({ 甲: { column: 1, row: 1 }, 乙: { column: 1, row: 2 } });
  });

  it('左へ割り込むと、同じ行の次の空きまでが 1 升右へ動く', () => {
    // 行 0 は 1・2・4 が埋まり 3 が空く。甲の手前へ割り込むと 甲・丁 が動き、戊は動かない。
    const next = insertGapEdit(NODES, {}, { column: 1, row: 0 }, 'column', LIMIT, HOMES)!;
    expect(next).toEqual({ 甲: { column: 2, row: 0 }, 丁: { column: 3, row: 0 } });
  });

  it('別の列・行の人物は巻き込まない（行・列を 1 本入れるのとは違う）', () => {
    const next = insertGapEdit(NODES, {}, { column: 1, row: 0 }, 'row', LIMIT, HOMES)!;
    expect(Object.keys(next).sort()).toEqual(['乙', '甲']);
  });

  it('空いている升目の手前へは割り込まない（押すものが無い）', () => {
    expect(insertGapEdit(NODES, {}, { column: 1, row: 2 }, 'row', LIMIT, HOMES)).toBeNull();
  });

  it('次の空きが枠の中に無ければ断る（押し出した人物を枠の外へ出さない）', () => {
    const packed = [node('甲', 0, 0), node('乙', 0, 1)];
    expect(insertGapEdit(packed, {}, { column: 0, row: 0 }, 'row', { column: 500, row: 1 }, homes(packed)))
      .toBeNull();
  });

  it('図に出ない古い差分も埋まった升目として数える（押し出しをそこで止めない）', () => {
    // 行 2 に、図に出ない名前の差分が残っている。空きと見て止めると 2 人が重なる。
    const stale = { 消えた人: { column: 1, row: 2 } };
    const next = insertGapEdit(NODES, stale, { column: 1, row: 0 }, 'row', LIMIT, HOMES)!;
    expect(next['消えた人']).toEqual({ column: 1, row: 3 });
    expect(next['丙']).toEqual({ column: 1, row: 4 });
  });

  it('動いた先が自動配置と同じ人物は差分を持たない（固定を残さない）', () => {
    // 乙 を 1 つ上へ手で寄せた図。上へ割り込むと乙は自動配置の升目へ戻るので、鍵ごと落ちる。
    const moved = { 乙: { column: 1, row: 0 } };
    const placed = applied(NODES, moved);
    const next = insertGapEdit(placed, moved, { column: 1, row: 0 }, 'row', LIMIT, HOMES)!;
    expect(next).not.toHaveProperty('乙');
  });
});

describe('家族に出る人物の取り除き', () => {
  const BASE: DiagramDocument = {
    ...SAMPLE,
    annotations: { 独神: '独りで成った神', 祖父: '注記' },
    layout: { placements: { 化生: { column: 3, row: 3 } } },
  };

  it('その人が親のすべてだった家族は消え、線も消える', () => {
    const result = removeDiagramElement(BASE, '独神');
    expect(result.removed).toBe(true);
    expect(result.droppedFamilies).toBe(1);
    expect(result.document.families).toHaveLength(2);
    expect(diagramPeople(result.document.families, result.document.nodes).has('独神')).toBe(false);
  });

  it('その家族にしか出てこなかった相手は、単独の要素として図に残る', () => {
    const result = removeDiagramElement(BASE, '独神');
    // 化生 は「独神 → 化生」の家族にしか出てこない。拾わないと 1 人消して 2 人消える。
    expect(result.rescued).toEqual(['化生']);
    expect(result.document.nodes).toContain('化生');
    expect(result.document.layout.placements['化生']).toEqual({ column: 3, row: 3 });
  });

  it('別の家族にも出てくる人物は拾い直さない（札は 1 枚のまま）', () => {
    const result = removeDiagramElement(BASE, '祖母');
    // 父 は「祖父・祖母 → 父」と「父・母 → 子」の両方に出るので、家族から消えない。
    expect(result.rescued).toEqual([]);
    expect(result.document.families[0]!.parents).toEqual(['祖父']);
  });

  it('注記・配置差分・接続線を道連れにする', () => {
    const withLine: DiagramDocument = { ...BASE, connectors: [CONNECTOR] };
    const result = removeDiagramElement(withLine, '祖父');
    expect(result.document.annotations).not.toHaveProperty('祖父');
    expect(result.document.connectors).toEqual([]);
  });

  it('図に居ない名前は何も変えない', () => {
    const result = removeDiagramElement(BASE, '居ない人');
    expect(result.removed).toBe(false);
    expect(result.document).toBe(BASE);
  });

  it('取り除いた図はそのまま読み戻せる（家族 0 件でも要素が残る）', () => {
    const only: DiagramDocument = {
      ...SAMPLE,
      families: [{ parents: ['甲'], children: ['乙'], kind: 'birth', groups: {} }],
      annotations: {},
      layout: { placements: {} },
    };
    const result = removeDiagramElement(only, '甲');
    expect(result.document.families).toEqual([]);
    expect(result.document.nodes).toEqual(['乙']);
    expect(parseDiagramFile(serializeDiagramDocument(result.document))).toEqual(result.document);
  });
});

describe('線の色', () => {
  it('色を持たない古いファイルも読める（既定で埋める）', () => {
    const { color: _dropped, ...withoutColor } = asFile(CONNECTOR);
    const document = parseDiagramDocument({ ...WITH_ELEMENTS, connectors: [withoutColor] });
    expect(document?.connectors[0]!.color).toBe('default');
  });

  it('知らない色名は断る（読めない値を既定へ倒さない）', () => {
    const document = parseDiagramDocument({
      ...WITH_ELEMENTS,
      connectors: [{ ...asFile(CONNECTOR), color: '#ff0000' }],
    });
    expect(document).toBeNull();
  });
});

describe('家族の線の見た目', () => {
  const FAMILY = SAMPLE.families[0]!;

  it('上書きが無ければ種別から決まる（親子は実線、生成は破線）', () => {
    expect(familyLook(FAMILY))
      .toEqual({ line: 'solid', color: 'default', route: 'orthogonal', start: 'none', end: 'none' });
    expect(familyLook({ ...FAMILY, kind: 'creation' }).line).toBe('dashed');
  });

  it('上書きがあればそれを返す', () => {
    const look = { line: 'dashed', color: 'danger', route: 'curved', start: 'circle', end: 'arrow' } as const;
    expect(familyLook({ ...FAMILY, look })).toEqual(look);
  });

  it('書いて読み戻すと同じ図になる', () => {
    const styled: DiagramDocument = {
      ...SAMPLE,
      families: [{ ...FAMILY, look: { line: 'dashed', color: 'accent', route: 'orthogonal', start: 'none', end: 'arrow' } },
        ...SAMPLE.families.slice(1)],
    };
    expect(parseDiagramFile(serializeDiagramDocument(styled))).toEqual(styled);
  });

  it('項目の足りない上書きは断る（書き忘れを既定で埋めない）', () => {
    const broken = {
      ...SAMPLE,
      families: [{ ...FAMILY, look: { line: 'dashed' } }, ...SAMPLE.families.slice(1)],
    };
    expect(parseDiagramDocument(JSON.parse(JSON.stringify(broken)))).toBeNull();
  });

  it('上書きの無い家族はファイルに look を書かない', () => {
    expect(serializeDiagramDocument(SAMPLE)).not.toContain('"look"');
  });
});

describe('要素の形', () => {
  const SHAPED: DiagramDocument = { ...SAMPLE, shapes: { 祖父: 'diamond', 化生: 'cylinder' } };

  it('書いた形は読み書きを往復しても変わらない', () => {
    expect(parseDiagramFile(serializeDiagramDocument(SHAPED))).toEqual(SHAPED);
  });

  it('形を持たない図は shapes を書かない（触っていない図に項目を増やさない）', () => {
    expect(serializeDiagramDocument(SAMPLE)).not.toContain('"shapes"');
  });

  it('既定（四角）は読み捨てる', () => {
    const parsed = parseDiagramDocument({ ...JSON.parse(serializeDiagramDocument(SAMPLE)), shapes: { 祖父: 'rect' } });
    expect(parsed?.shapes).toEqual({});
  });

  it('列挙にない形は図ごと読まない（1 件ずつ四角へ戻さない）', () => {
    const warnings: string[] = [];
    const parsed = parseDiagramDocument(
      { ...JSON.parse(serializeDiagramDocument(SAMPLE)), shapes: { 祖父: 'cloud' } },
      (message) => warnings.push(message),
    );
    expect(parsed).toBeNull();
    expect(warnings[0]).toContain('shapes.祖父');
  });

  it('改名すると形の鍵も付いてくる', () => {
    expect(renameDiagramElement(SHAPED, '祖父', '始祖').shapes).toEqual({ 始祖: 'diamond', 化生: 'cylinder' });
  });

  it('取り除くと形の鍵も落ちる', () => {
    expect(removeDiagramElement(SHAPED, '化生').document.shapes).toEqual({ 祖父: 'diamond' });
  });

  it('形は要素名の順に書き出す（差分を読めるようにする）', () => {
    const json = serializeDiagramDocument({ ...SAMPLE, shapes: { 化生: 'circle', 祖父: 'diamond' } });
    expect(Object.keys(JSON.parse(json).shapes)).toEqual(['化生', '祖父'].sort());
  });
});

describe('線の中点に取り付く線', () => {
  const MID: DiagramConnector = {
    ...CONNECTOR, id: 'c2', from: lineAnchor('c1'), to: elementAnchor('父'),
  };
  const WITH_MID: DiagramDocument = { ...WITH_ELEMENTS, connectors: [CONNECTOR, MID] };

  it('書いて読み戻すと同じ図になる（要素は文字列、線は { line: id }）', () => {
    const json = JSON.parse(serializeDiagramDocument(WITH_MID));
    expect(json.connectors[0].from).toBe('祖父');
    expect(json.connectors[1].from).toEqual({ line: 'c1' });
    expect(parseDiagramFile(serializeDiagramDocument(WITH_MID))).toEqual(WITH_MID);
  });

  it('端の無い線は図ごと読まない（from・to が要素名でも { line } でもない）', () => {
    const warnings: string[] = [];
    const broken = {
      ...JSON.parse(serializeDiagramDocument(WITH_ELEMENTS)),
      connectors: [{ ...asFile(CONNECTOR), from: { node: '祖父' } }],
    };
    expect(parseDiagramDocument(broken, (message) => warnings.push(message))).toBeNull();
    expect(warnings.join()).toContain('from・to');
  });

  it('元の線を消すと、その中点にぶら下がっていた線も消える', () => {
    expect(removeDiagramConnectors(WITH_MID.connectors, ['c1'])).toEqual([]);
  });

  it('ぶら下がっている線だけを消しても元の線は残る', () => {
    expect(removeDiagramConnectors(WITH_MID.connectors, ['c2'])).toEqual([CONNECTOR]);
  });

  it('要素を取り除くと、その要素の線にぶら下がる線まで落ちる', () => {
    const removal = removeDiagramElement(WITH_MID, '化生');
    expect(removal.document.connectors).toEqual([]);
  });

  it('線どうしが輪を作っていても止まる（消える側にしか動かない）', () => {
    const loopA: DiagramConnector = { ...CONNECTOR, id: 'a', from: lineAnchor('b'), to: elementAnchor('父') };
    const loopB: DiagramConnector = { ...CONNECTOR, id: 'b', from: lineAnchor('a'), to: elementAnchor('父') };
    expect(removeDiagramConnectors([loopA, loopB], ['a'])).toEqual([]);
  });

  it('要素の改名は線を指す端を動かさない（線の id は要素名ではない）', () => {
    const renamed = renameDiagramElement(WITH_MID, '父', '親');
    expect(renamed.connectors[1]!.from).toEqual(lineAnchor('c1'));
    expect(renamed.connectors[1]!.to).toEqual(elementAnchor('親'));
  });
});

describe('線の経路', () => {
  it('経路を持たない古いファイルも読める（手で引いた線は直線、家族の線は折れ線）', () => {
    const { route: _dropped, ...withoutRoute } = asFile(CONNECTOR);
    const document = parseDiagramDocument({ ...WITH_ELEMENTS, connectors: [withoutRoute] });
    expect(document?.connectors[0]!.route).toBe('straight');
    const family = parseDiagramDocument({
      ...JSON.parse(serializeDiagramDocument(SAMPLE)),
      families: [{ ...SAMPLE.families[0]!, look: { line: 'solid', color: 'default', start: 'none', end: 'none' } },
        ...SAMPLE.families.slice(1)],
    });
    expect(family?.families[0]!.look?.route).toBe('orthogonal');
  });

  it('知らない経路名は断る（読めない値を既定へ倒さない）', () => {
    expect(parseDiagramDocument({
      ...WITH_ELEMENTS,
      connectors: [{ ...asFile(CONNECTOR), route: 'zigzag' }],
    })).toBeNull();
  });
});

describe('家族の結び目に取り付いた線', () => {
  const FAMILY = SAMPLE.families[0]!;
  const HANGING: DiagramConnector = {
    ...CONNECTOR, id: 'x', from: familyAnchor(FAMILY.parents), to: elementAnchor('独神'),
  };
  const WITH_HANGING: DiagramDocument = { ...SAMPLE, connectors: [HANGING] };

  it('書いて読み戻すと同じ図になる（ファイルには { family: [親…] } と書く）', () => {
    expect(JSON.parse(serializeDiagramDocument(WITH_HANGING)).connectors[0].from)
      .toEqual({ family: FAMILY.parents });
    expect(parseDiagramFile(serializeDiagramDocument(WITH_HANGING))).toEqual(WITH_HANGING);
  });

  it('子を全員消して結び目が無くなると、その線も落ちる（後で子を足した日に復活させない）', () => {
    let after = WITH_HANGING;
    for (const child of FAMILY.children) after = removeDiagramElement(after, child).document;
    expect(after.families[0]!.children).toEqual([]);
    expect(after.connectors).toEqual([]);
  });

  it('関わりの無い要素を消しても、結び目の線は残る', () => {
    expect(removeDiagramElement(WITH_HANGING, '化生').document.connectors).toEqual([HANGING]);
  });

  it('親の改名に付いてくる', () => {
    const renamed = renameDiagramElement(WITH_HANGING, FAMILY.parents[0]!, '始祖');
    expect(renamed.connectors[0]!.from).toEqual(familyAnchor(['始祖', ...FAMILY.parents.slice(1)]));
  });
});

describe('注記の書き換え', () => {
  it('書いた注記が載る', () => {
    expect(setDiagramAnnotation(SAMPLE, '祖父', '初代').annotations).toEqual({ ...SAMPLE.annotations, 祖父: '初代' });
  });

  it('空にすると項目ごと落ちる（触っていない図に空の入れ物を残さない）', () => {
    const withNote = setDiagramAnnotation(SAMPLE, '祖父', '初代');
    expect(Object.keys(setDiagramAnnotation(withNote, '祖父', '').annotations)).not.toContain('祖父');
  });

  it('前後の空白は落とす（見えない字だけの注記を残さない）', () => {
    expect(setDiagramAnnotation(SAMPLE, '祖父', '  初代  ').annotations.祖父).toBe('初代');
    expect(Object.keys(setDiagramAnnotation(SAMPLE, '祖父', '   ').annotations)).not.toContain('祖父');
  });

  it('図に居ない名前には付けない（図に出ない注記を増やさない）', () => {
    expect(setDiagramAnnotation(SAMPLE, '居ない人', 'x')).toBe(SAMPLE);
  });

  it('他の要素の注記には触らない', () => {
    const before = { ...SAMPLE, annotations: { 祖父: 'A', 父: 'B' } };
    expect(setDiagramAnnotation(before, '祖父', 'C').annotations).toEqual({ 祖父: 'C', 父: 'B' });
  });
});

describe('家族の群の値', () => {
  it('その家族の 1 軸だけを書き換える', () => {
    const next = setDiagramFamilyGroup(SAMPLE, 0, 'volume', 'two');
    expect(next.families[0]!.groups).toEqual({ volume: 'two' });
    expect(next.families[1]).toBe(SAMPLE.families[1]);
  });

  it('空にすると軸ごと落ちる（読めない値を残さない）', () => {
    expect(setDiagramFamilyGroup(SAMPLE, 0, 'volume', '').families[0]!.groups).toEqual({});
  });

  it('宣言に無い軸・無い値は受けない（札に出ない値をファイルへ書かない）', () => {
    expect(setDiagramFamilyGroup(SAMPLE, 0, 'unknown', 'one')).toBe(SAMPLE);
    expect(setDiagramFamilyGroup(SAMPLE, 0, 'volume', 'three')).toBe(SAMPLE);
  });

  it('無い家族は触らない', () => {
    expect(setDiagramFamilyGroup(SAMPLE, 99, 'volume', 'one')).toBe(SAMPLE);
  });
});
