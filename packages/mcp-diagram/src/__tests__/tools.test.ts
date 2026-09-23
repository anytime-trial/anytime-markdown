/**
 * 系図ファイルの読み書き。実ファイルで測る（一時ディレクトリを 1 件ずつ作って隔離する）。
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { DEFAULT_DIAGRAM_SPACING, parseDiagramFileStrict } from '@anytime-markdown/diagram-core';

import { readDiagram } from '../tools/readDiagram';
import { setDiagramLayout, writeDiagram } from '../tools/writeDiagram';
import { resolveRootDir } from '../resolveRootDir';

let rootDir: string;
const FILE = 'charts/sample.diagram.json';

const families = [
  { parents: ['祖父', '祖母'], children: ['父'], kind: 'birth' as const, groups: {} },
  { parents: ['父', '母'], children: ['子'], kind: 'birth' as const, groups: {} },
];

beforeEach(() => {
  rootDir = mkdtempSync(path.join(tmpdir(), 'mcp-diagram-'));
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe('系図の書き出しと読み取り', () => {
  it('書いた図をそのまま読み戻せる', async () => {
    await writeDiagram({ path: FILE, title: '検査用', families }, rootDir);
    const document = await readDiagram({ path: FILE }, rootDir);
    expect(document.title).toBe('検査用');
    expect(document.families).toEqual(families);
    expect(document.layout.placements).toEqual({});
  });

  it('親ディレクトリが無くても作る', async () => {
    await writeDiagram({ path: 'a/b/c/deep.diagram.json', title: '深い', families }, rootDir);
    await expect(readDiagram({ path: 'a/b/c/deep.diagram.json' }, rootDir)).resolves.toBeDefined();
  });

  it('`.diagram.json` 以外は扱わない（任意の JSON を書き換えさせない）', async () => {
    await expect(writeDiagram({ path: 'package.json', title: 'x', families }, rootDir))
      .rejects.toThrow(/Only \.diagram\.json/);
    await expect(readDiagram({ path: 'package.json' }, rootDir)).rejects.toThrow(/Only \.diagram\.json/);
  });

  it('基準ディレクトリの外へは出さない', async () => {
    await expect(readDiagram({ path: '../outside.diagram.json' }, rootDir)).rejects.toThrow(/Access denied/);
  });

  it('読み戻せない図は書かせない（次に開いた画面が「読めません」にならない）', async () => {
    await expect(writeDiagram({ path: FILE, title: 'x', families: [] }, rootDir))
      .rejects.toThrow();
  });

  it('壊れた図を読むと例外で知らせる（空へ倒さない）', async () => {
    const filePath = path.join(rootDir, 'broken.diagram.json');
    writeFileSync(filePath, '{ not json', 'utf-8');
    await expect(readDiagram({ path: 'broken.diagram.json' }, rootDir)).rejects.toThrow(/解釈できません/);
  });
});

describe('配置差分の書き換え', () => {
  beforeEach(async () => {
    await writeDiagram({ path: FILE, title: '検査用', families }, rootDir);
  });

  it('升目と刻みを置き換える', async () => {
    const result = await setDiagramLayout({
      path: FILE,
      placements: { 子: { column: 4, row: 3 } },
      spacing: { nodeWidth: 240 },
    }, rootDir);
    expect(result.placements).toBe(1);
    const document = await readDiagram({ path: FILE }, rootDir);
    expect(document.layout.placements).toEqual({ 子: { column: 4, row: 3 } });
    expect(document.layout.spacing).toEqual({ ...DEFAULT_DIAGRAM_SPACING, nodeWidth: 240 });
  });

  it('同じ升目に 2 人を置く要求は断る（黙って寄せない）', async () => {
    await expect(setDiagramLayout({
      path: FILE,
      placements: { 父: { column: 1, row: 1 }, 母: { column: 1, row: 1 } },
    }, rootDir)).rejects.toThrow(/同じ升目/);
  });

  it('範囲の外の刻みは断る', async () => {
    await expect(setDiagramLayout({ path: FILE, placements: {}, spacing: { nodeWidth: 9999 } }, rootDir))
      .rejects.toThrow(/nodeWidth/);
  });

  it('向きを書き、省略した次の呼び出しでも向きを保つ', async () => {
    await setDiagramLayout({ path: FILE, placements: {}, direction: 'TB' }, rootDir);
    expect((await readDiagram({ path: FILE }, rootDir)).layout.direction).toBe('TB');
    // 配置だけを書き換える呼び出しが、渡し忘れた向きを既定へ戻さない。
    await setDiagramLayout({ path: FILE, placements: { 子: { column: 4, row: 3 } } }, rootDir);
    expect((await readDiagram({ path: FILE }, rootDir)).layout.direction).toBe('TB');
    // 既定の向きを渡せば戻る（既定は書かない）。
    await setDiagramLayout({ path: FILE, placements: {}, direction: 'LR' }, rootDir);
    expect((await readDiagram({ path: FILE }, rootDir)).layout.direction).toBeUndefined();
  });

  it('図の中身（人物・家族）には触らない', async () => {
    await setDiagramLayout({ path: FILE, placements: { 子: { column: 4, row: 3 } } }, rootDir);
    const document = await readDiagram({ path: FILE }, rootDir);
    expect(document.families).toEqual(families);
    expect(document.title).toBe('検査用');
  });
});

describe('図の書き換えと配置の引き継ぎ', () => {
  it('家族を書き換えても、保存済みの配置は消さない', async () => {
    await writeDiagram({ path: FILE, title: '検査用', families }, rootDir);
    await setDiagramLayout({ path: FILE, placements: { 子: { column: 4, row: 3 } } }, rootDir);
    // 家族を 1 件足すだけの呼び出しが、渡し忘れた配置を空で上書きしない。
    await writeDiagram({
      path: FILE,
      title: '検査用',
      families: [...families, { parents: ['子'], children: ['孫'], kind: 'birth', groups: {} }],
    }, rootDir);
    const document = await readDiagram({ path: FILE }, rootDir);
    expect(document.layout.placements).toEqual({ 子: { column: 4, row: 3 } });
    expect(document.families).toHaveLength(3);
  });

  it('家族を書き換えても、画面で足した要素と線は消さない', async () => {
    await writeDiagram({
      path: FILE,
      title: '検査用',
      families,
      nodes: ['単独の要素'],
      connectors: [{
        id: 'c1', from: '子', to: '単独の要素',
        line: 'dashed', color: 'accent', route: 'straight', start: 'none', end: 'arrow',
      }],
    }, rootDir);
    // 要素と線を渡さない呼び出しは、既存のものを引き継ぐ（配置差分と同じ扱い）。
    await writeDiagram({ path: FILE, title: '題名を直した', families }, rootDir);
    const document = await readDiagram({ path: FILE }, rootDir);
    expect(document.title).toBe('題名を直した');
    expect(document.nodes).toEqual(['単独の要素']);
    expect(document.connectors).toHaveLength(1);
  });

  /*
    注記・群の軸・読み物（導入文・注記・凡例）も要素や線と同じ扱い。空へ倒していた頃は、
    「家族を 1 件足すだけ」の呼び出しが札の注記と群の軸を丸ごと落としていた（呼び手には
    何も返らないので、画面を開くまで気づけない）。
  */
  it('家族を書き換えても、注記・群の軸・読み物は消さない', async () => {
    await writeDiagram({
      path: FILE,
      title: '検査用',
      lead: '導入文',
      note: '末尾の注記',
      legend: '実線は親子。',
      groups: [{ id: 'volume', label: '巻', values: { one: '上巻' } }],
      families: families.map((family) => ({ ...family, groups: { volume: 'one' } })),
      annotations: { 子: '札の注記' },
    }, rootDir);
    await writeDiagram({
      path: FILE,
      title: '題名を直した',
      families: families.map((family) => ({ ...family, groups: { volume: 'one' } })),
    }, rootDir);
    const document = await readDiagram({ path: FILE }, rootDir);
    expect(document.annotations).toEqual({ 子: '札の注記' });
    expect(document.groups).toEqual([{ id: 'volume', label: '巻', values: { one: '上巻' } }]);
    expect([document.lead, document.note, document.legend]).toEqual(['導入文', '末尾の注記', '実線は親子。']);
  });

  it('書き戻せない図は、検証器が出した理由をそのまま返す', async () => {
    await expect(writeDiagram({
      path: FILE,
      title: '検査用',
      families,
      connectors: [
        { id: 'c1', from: '親', to: '子', line: 'solid', color: 'default', route: 'straight', start: 'none', end: 'none' },
        { id: 'c1', from: '子', to: '親', line: 'solid', color: 'default', route: 'straight', start: 'none', end: 'none' },
      ],
    }, rootDir)).rejects.toThrow('id が重複しています');
  });

  it('家族を書き換えても、要素の形は消さない', async () => {
    await writeDiagram({
      path: FILE,
      title: '検査用',
      families,
      shapes: { 子: 'diamond' },
    }, rootDir);
    await writeDiagram({ path: FILE, title: '題名を直した', families }, rootDir);
    const document = await readDiagram({ path: FILE }, rootDir);
    expect(document.shapes).toEqual({ 子: 'diamond' });
  });

  it('既定（四角）は書き出さない', async () => {
    await writeDiagram({ path: FILE, title: '検査用', families, shapes: { 子: 'rect' } }, rootDir);
    expect(await readFile(path.join(rootDir, FILE), 'utf-8')).not.toContain('"shapes"');
  });

  it('家族が空でも要素があれば書ける', async () => {
    await writeDiagram({ path: FILE, title: '要素だけの図', families: [], nodes: ['甲', '乙'] }, rootDir);
    const document = await readDiagram({ path: FILE }, rootDir);
    expect(document.families).toEqual([]);
    expect(document.nodes).toEqual(['乙', '甲']);
  });

  it('壊れたファイルへの上書きは止める（整えた配置を消さない）', async () => {
    writeFileSync(path.join(rootDir, 'broken.diagram.json'), '{ not json', 'utf-8');
    await expect(writeDiagram({ path: 'broken.diagram.json', title: 'x', families }, rootDir))
      .rejects.toThrow(/解釈できません/);
  });

  it('鍵を並べ替えて書く（差分の差分を読めるようにする）', async () => {
    await writeDiagram({ path: FILE, title: '検査用', families }, rootDir);
    await setDiagramLayout({
      path: FILE,
      placements: { 父: { column: 2, row: 0 }, 子: { column: 4, row: 3 } },
    }, rootDir);
    const text = await readFile(path.join(rootDir, FILE), 'utf-8');
    // 人物名は家族の一覧にも出るので、配置の節だけを取り出して並びを測る。
    const layout = text.slice(text.indexOf('"layout"'));
    expect(layout.indexOf('"子"')).toBeLessThan(layout.indexOf('"父"'));
    expect(parseDiagramFileStrict(text)).toBeDefined();
  });
});

describe('基準ディレクトリの解決', () => {
  it('環境変数があればそれを、無ければ cwd を使う', () => {
    expect(resolveRootDir({ ANYTIME_DIAGRAM_ROOT: '/tmp/x' }, '/cwd', { pathExists: () => true })).toBe('/tmp/x');
    expect(resolveRootDir({}, '/cwd', { pathExists: () => true })).toBe('/cwd');
    // 空白だけの指定は未指定として扱う。
    expect(resolveRootDir({ ANYTIME_DIAGRAM_ROOT: '  ' }, '/cwd', { pathExists: () => true })).toBe('/cwd');
  });

  it('実在しないルートは警告する（接続は成功して見えるため、唯一の観測経路になる）', () => {
    const warnings: string[] = [];
    resolveRootDir({}, '/missing', { pathExists: () => false, warn: (m) => warnings.push(m) });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('/missing');
  });
});

describe('MCP サーバーの組み立て', () => {
  it('3 つの道具を登録して起動できる', async () => {
    // zod スキーマの組み立てはここで初めて走る。壊れていれば registerTool が throw するので、
    // 「接続はできるが道具が 1 つも出ない」状態を実行前に捕まえられる。
    const { createMcpServer } = await import('../server');
    expect(() => createMcpServer({ rootDir })).not.toThrow();
  });
});

describe('線の端と経路', () => {
  it('線の中点・家族の結び目に取り付いた線を書いて読み戻せる', async () => {
    await writeDiagram({
      path: FILE,
      title: '検査用',
      families,
      nodes: ['単独の要素'],
      connectors: [
        { id: 'c1', from: '子', to: '単独の要素', line: 'solid', color: 'default', route: 'curved', start: 'none', end: 'arrow' },
        { id: 'c2', from: { line: 'c1' }, to: '単独の要素', line: 'solid', color: 'default', route: 'orthogonal', start: 'none', end: 'arrow' },
        { id: 'c3', from: { family: families[0]!.parents }, to: '単独の要素', line: 'solid', color: 'default', route: 'straight', start: 'none', end: 'none' },
      ],
    }, rootDir);
    const document = parseDiagramFileStrict(await readFile(path.join(rootDir, FILE), 'utf-8'));
    expect(document.connectors.map((item) => item.from)).toEqual([
      { kind: 'element', name: '子' },
      { kind: 'line', line: 'c1' },
      { kind: 'family', parents: families[0]!.parents },
    ]);
    expect(document.connectors.map((item) => item.route)).toEqual(['curved', 'orthogonal', 'straight']);
  });

  it('読めない端は書かせない（次に開けない図を作らない）', async () => {
    await expect(writeDiagram({
      path: FILE,
      title: '検査用',
      families,
      connectors: [{ id: 'c1', from: { node: '子' }, to: '子', line: 'solid', color: 'default', route: 'straight', start: 'none', end: 'none' }],
    }, rootDir)).rejects.toThrow('connectors.from');
  });
});
