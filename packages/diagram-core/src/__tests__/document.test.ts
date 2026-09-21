/**
 * `*.diagram.json` の読み取り・書き出しと、保存の入口の検証。
 *
 * 読み取りは寛容（壊れた 1 件で図全体を捨てない）、保存の検証は厳格（送り主の意図しない升目へ
 * 黙って動かさない）。移植元は anytime-travel の `shared/genealogy.ts` に対する検査。
 */

import {
  MAX_PLACEMENTS_PER_DIAGRAM,
  createEmptyDiagramDocument,
  diagramPeople,
  isEmptyLayout,
  parseDiagramDocument,
  parseDiagramFile,
  parseDiagramFileStrict,
  readDiagramLayout,
  serializeDiagramDocument,
  validateDiagramDocument,
  validateDiagramLayout,
} from '../document';
import { DEFAULT_DIAGRAM_SPACING, cellPosition } from '../spacing';
import { SAMPLE } from './fixture';

const json = (document = SAMPLE) => JSON.parse(serializeDiagramDocument(document));

describe('図の読み取り', () => {
  it('書き出した図をそのまま読み戻せる', () => {
    expect(parseDiagramDocument(json())).toEqual(SAMPLE);
  });

  it('version が 1 でなければ読まない', () => {
    const warnings: string[] = [];
    expect(parseDiagramDocument({ ...json(), version: 2 }, (m) => warnings.push(m))).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it('families が空なら読まない（図に描ける人物が 1 人も居ない）', () => {
    expect(parseDiagramDocument({ ...json(), families: [] })).toBeNull();
  });

  it('壊れた JSON でも例外を投げず null を返す（画面を落とさない）', () => {
    const warnings: string[] = [];
    expect(parseDiagramFile('{ not json', (m) => warnings.push(m))).toBeNull();
    expect(warnings[0]).toContain('解釈できません');
  });

  it('厳格版は読めない図を例外で知らせる（空へ倒さない）', () => {
    // 空へ倒すと、それを土台に書き戻したときに保存済みの配置が 1 回の保存で消える。
    expect(() => parseDiagramFileStrict('{ not json')).toThrow(/解釈できません/);
  });

  it('人物は家族の一覧から導く', () => {
    expect([...diagramPeople(SAMPLE.families)].sort())
      .toEqual(['化生', '叔父', '妹', '子', '母', '父', '独神', '祖母', '祖父']);
  });
});

describe('配置差分の読み取り', () => {
  it('px で保存された古い差分を最も近い升目へ寄せる', () => {
    // 読めないものとして落とすと、升目化の前に整えた配置がまるごと消える。
    const point = cellPosition(DEFAULT_DIAGRAM_SPACING, { column: 2, row: 3 });
    expect(readDiagramLayout({ placements: { 子: { x: point.x, y: point.y } } }).placements)
      .toEqual({ 子: { column: 2, row: 3 } });
  });

  it('同じ升目へ落ちた 2 人は空きへ逃がす（重ねると下の人物を掴めない）', () => {
    const point = cellPosition(DEFAULT_DIAGRAM_SPACING, { column: 1, row: 1 });
    const layout = readDiagramLayout({
      placements: {
        あ: { x: point.x, y: point.y },
        い: { x: point.x + 1, y: point.y + 1 },
      },
    });
    const cells = Object.values(layout.placements).map((cell) => `${cell.column},${cell.row}`);
    expect(new Set(cells).size).toBe(2);
  });

  it('読めない 1 件は警告して落とし、残りは保つ', () => {
    const warnings: string[] = [];
    const layout = readDiagramLayout({
      placements: { よい: { column: 1, row: 1 }, だめ: { column: -1, row: 0 } },
    }, (m) => warnings.push(m));
    expect(layout.placements).toEqual({ よい: { column: 1, row: 1 } });
    expect(warnings).toHaveLength(1);
  });

  it('既定と同じ刻みは持たない', () => {
    // 持つと「既定を変えたのに古い既定が焼き付いた図」が残る。
    expect(readDiagramLayout({ placements: {}, spacing: { ...DEFAULT_DIAGRAM_SPACING } }).spacing).toBeUndefined();
  });
});

describe('保存の入口の検証', () => {
  it('升目の番号として読める配置を受ける', () => {
    const result = validateDiagramLayout({ placements: { 子: { column: 2, row: 3 } } });
    expect(result).toEqual({ ok: true, layout: { placements: { 子: { column: 2, row: 3 } } } });
  });

  it('同じ升目の重なりは断る（読み出しのように寄せない）', () => {
    // 保存された配置は開いた全員の画面に出るので、意図しない升目へ黙って動かさない。
    const result = validateDiagramLayout({
      placements: { あ: { column: 1, row: 1 }, い: { column: 1, row: 1 } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('同じ升目');
  });

  it('描けない升目は項目名を添えて断る', () => {
    const result = validateDiagramLayout({ placements: { 子: { column: -1, row: 0 } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('layout.placements.子');
  });

  it('件数の上限を超える差分は断る', () => {
    const placements: Record<string, { column: number; row: number }> = {};
    for (let index = 0; index <= MAX_PLACEMENTS_PER_DIAGRAM; index += 1) {
      placements[`人${index}`] = { column: 0, row: index };
    }
    const result = validateDiagramLayout({ placements });
    expect(result.ok).toBe(false);
  });

  it('範囲の外の刻みは、範囲を文面へ書き出して断る', () => {
    // 範囲は宣言そのものから書き出す。写し忘れると、断られた側はどの項目か分からない。
    const result = validateDiagramLayout({ placements: {}, spacing: { nodeWidth: 9999 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('nodeWidth は 120〜360');
  });
});

describe('図の書き出し', () => {
  it('鍵を並べ替えて書く（差分の差分を読めるようにする）', () => {
    const document = { ...SAMPLE, layout: { placements: { い: { column: 1, row: 0 }, あ: { column: 0, row: 0 } } } };
    const text = serializeDiagramDocument(document);
    expect(text.indexOf('"あ"')).toBeLessThan(text.indexOf('"い"'));
  });

  it('差分が空なら layout そのものを書かない', () => {
    expect(json()).not.toHaveProperty('layout');
    expect(isEmptyLayout(SAMPLE.layout)).toBe(true);
  });

  it('末尾を改行で終える（行単位の差分が読める）', () => {
    expect(serializeDiagramDocument(SAMPLE).endsWith('\n')).toBe(true);
  });

  it('新規作成の雛形はそのまま読み戻せる', () => {
    const empty = createEmptyDiagramDocument('新しい図');
    expect(parseDiagramFile(serializeDiagramDocument(empty))).toEqual(empty);
  });
});

describe('輪を作る家族', () => {
  /*
    世代を決める並べ替え（`layoutDiagram`）は輪に出会うと例外を投げる。投げるのは**描く時点**で、
    そこには受け止める場所が無い — 図が出ないだけでなく宿主へ例外が抜けていた。読み取りの側で
    断れば、他の壊れた項目と同じく理由が出る。保存の入口も読み取りを通すので、次に開けない図を
    書けないことが同時に決まる。
  */
  const CYCLIC = {
    version: 1,
    title: '輪のある図',
    lead: '',
    note: '',
    legend: '',
    groups: [],
    families: [
      { parents: ['甲'], children: ['乙'], kind: 'birth', groups: {} },
      { parents: ['乙'], children: ['甲'], kind: 'birth', groups: {} },
    ],
    annotations: {},
  };

  it('読み取りで断り、どこが輪なのかを理由に出す', () => {
    const warnings: string[] = [];
    expect(parseDiagramDocument(CYCLIC, (message) => warnings.push(message))).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('輪を作っています');
    expect(warnings[0]).toMatch(/甲|乙/);
  });

  it('保存の入口も通さない（次に開けない図を書かせない）', () => {
    const result = validateDiagramDocument(CYCLIC);
    expect(result.ok).toBe(false);
  });

  it('輪でない図はそのまま通る（親を 2 世代たどる形を輪と誤らない）', () => {
    expect(parseDiagramDocument(json())).not.toBeNull();
  });
});
