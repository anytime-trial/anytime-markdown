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
      connectors: [{ id: 'c1', from: '子', to: '単独の要素', line: 'dashed', color: 'accent', start: 'none', end: 'arrow' }],
    }, rootDir);
    // 要素と線を渡さない呼び出しは、既存のものを引き継ぐ（配置差分と同じ扱い）。
    await writeDiagram({ path: FILE, title: '題名を直した', families }, rootDir);
    const document = await readDiagram({ path: FILE }, rootDir);
    expect(document.title).toBe('題名を直した');
    expect(document.nodes).toEqual(['単独の要素']);
    expect(document.connectors).toHaveLength(1);
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
