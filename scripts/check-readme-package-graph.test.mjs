// check-readme-package-graph.mjs のテスト。
// 「合格すること」より「壊したときに落ちること」を主眼に置く。README の図を検査する
// ゲートは、mermaid ブロックの抽出に失敗しても黙って合格しうる(fail-open)ため、
// 抽出失敗・空グラフを明示的に例外にしていることをここで固定する。
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { checkReadmeGraph, collectInternalDeps, parseMermaidGraph } from './check-readme-package-graph.mjs';

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

// MV(markdown-editor) <- MR(markdown-rich-editor)、VEP は依存ゼロ、の最小構成。
const PACKAGES = {
  'markdown-editor': {},
  'markdown-rich-editor': { dependencies: { '@anytime-markdown/markdown-editor': '*' } },
  'vscode-extension-pack': {},
};

function diagram(edges, nodes = ['MV', 'MR', 'VEP']) {
  const nodeLines = nodes.map((id) => '        ' + id + '["' + id + '"]').join('\n');
  const edgeLines = edges.map(([f, t]) => '    ' + f + ' --> ' + t).join('\n');
  return [
    '```mermaid',
    'flowchart TD',
    '    subgraph core ["lib"]',
    nodeLines,
    '    end',
    '',
    edgeLines,
    '```',
    '',
  ].join('\n');
}

/** テスト用リポジトリを作る。ja / en へ別々の図を渡せる。 */
function makeRepo({ ja, en }) {
  const root = mkdtempSync(join(tmpdir(), 'readme-graph-'));
  roots.push(root);
  for (const [name, manifest] of Object.entries(PACKAGES)) {
    const dir = join(root, 'packages', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@anytime-markdown/' + name, ...manifest }));
  }
  writeFileSync(join(root, 'README.ja.md'), '## プロジェクト構成\n\n' + ja);
  writeFileSync(join(root, 'README.md'), '## Project Structure\n\n' + (en ?? ja));
  return root;
}

const VALID = diagram([['MR', 'MV']]);

describe('checkReadmeGraph', () => {
  it('図が実依存と一致していれば合格する', () => {
    assert.deepEqual(checkReadmeGraph(makeRepo({ ja: VALID })), []);
  });

  it('依存の向きが逆のエッジを検出する', () => {
    // markdown-editor -> markdown-rich-editor は実在しない(本ゲートを作った動機そのもの)。
    const errors = checkReadmeGraph(makeRepo({ ja: diagram([['MR', 'MV'], ['MV', 'MR']]) }));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /実依存に裏付けなし: MV->MR/);
  });

  it('ja と en でエッジ集合が食い違うと検出する', () => {
    const errors = checkReadmeGraph(makeRepo({ ja: VALID, en: diagram([['MR', 'MV'], ['MV', 'MR']]) }));
    assert.ok(errors.some((e) => /エッジ集合が .* で不一致/.test(e)), errors.join(' / '));
  });

  it('ja と en でノード集合が食い違うと検出する', () => {
    const en = diagram([['MR', 'MV']], ['MV', 'MR', 'VEP', 'GC']);
    const errors = checkReadmeGraph(makeRepo({ ja: VALID, en }));
    assert.ok(errors.some((e) => /ノード集合が .* で不一致/.test(e)), errors.join(' / '));
  });

  it('未宣言ノードを指すエッジを検出する', () => {
    const errors = checkReadmeGraph(makeRepo({ ja: diagram([['MR', 'MV'], ['MR', 'TC']]) }));
    assert.ok(errors.some((e) => /未宣言ノードを参照: TC/.test(e)), errors.join(' / '));
  });

  it('図に出したのに packages 配下へ実在しないノードを検出する', () => {
    const ja = diagram([['MR', 'MV'], ['MR', 'GC']], ['MV', 'MR', 'VEP', 'GC']);
    const errors = checkReadmeGraph(makeRepo({ ja }));
    assert.ok(
      errors.some((e) => /実在しない: GC \(graph-core\)/.test(e)),
      errors.join(' / '),
    );
  });

  it('孤立ノードを検出する。ただし依存ゼロが正しい VEP は許容する', () => {
    // MV / MR は接続済み、VEP は孤立だが ORPHAN_OK。
    assert.deepEqual(checkReadmeGraph(makeRepo({ ja: VALID })), []);
    // SC を足すと接続が無く孤立として検出される。
    const ja = diagram([['MR', 'MV']], ['MV', 'MR', 'VEP', 'SC']);
    const errors = checkReadmeGraph(makeRepo({ ja }));
    assert.ok(errors.some((e) => /孤立ノード: SC/.test(e)), errors.join(' / '));
  });

  it('BUNDLER_ONLY のエッジは実依存が無くても許容する', () => {
    // VTE->TV は webpack バンドル時依存で package.json に現れない。
    const ja = diagram([['MR', 'MV'], ['VTE', 'TV']], ['MV', 'MR', 'VEP', 'VTE', 'TV']);
    const errors = checkReadmeGraph(makeRepo({ ja }));
    // 実在しない旨は出るが「実依存に裏付けなし」は出ない。
    assert.ok(!errors.some((e) => /実依存に裏付けなし: VTE->TV/.test(e)), errors.join(' / '));
  });
});

describe('parseMermaidGraph の fail-open 防止', () => {
  it('mermaid ブロックが無ければ例外を投げる（空グラフで合格させない）', () => {
    assert.throws(
      () => parseMermaidGraph('# 見出しだけの README\n\n本文。\n', 'README.ja.md'),
      /flowchart ブロックが見つからない/,
    );
  });

  it('ブロックはあるがノードもエッジも抽出できなければ例外を投げる', () => {
    assert.throws(
      () => parseMermaidGraph('```mermaid\nflowchart TD\n    %% 空\n```\n', 'README.ja.md'),
      /1 つも抽出できなかった/,
    );
  });

  it('README が存在しなければ例外を投げる', () => {
    const root = mkdtempSync(join(tmpdir(), 'readme-graph-empty-'));
    roots.push(root);
    assert.throws(() => checkReadmeGraph(root), /README が見つからない/);
  });
});

describe('collectInternalDeps', () => {
  it('@anytime-markdown スコープの依存だけを拾う', () => {
    const root = makeRepo({ ja: VALID });
    writeFileSync(
      join(root, 'packages', 'markdown-rich-editor', 'package.json'),
      JSON.stringify({
        name: '@anytime-markdown/markdown-rich-editor',
        dependencies: { '@anytime-markdown/markdown-editor': '*', mermaid: '11.0.0' },
        devDependencies: { '@anytime-markdown/markdown-editor': '*', jest: '30.0.0' },
      }),
    );
    const deps = collectInternalDeps(root);
    assert.deepEqual([...deps.get('markdown-rich-editor')], ['markdown-editor']);
  });

  it('packages ディレクトリが無ければ空を返す', () => {
    const root = mkdtempSync(join(tmpdir(), 'readme-graph-nopkg-'));
    roots.push(root);
    assert.equal(collectInternalDeps(root).size, 0);
  });
});
