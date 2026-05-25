import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { findTsconfigCandidates, hasPythonFiles } from '../AnalyzePipeline';

/**
 * findTsconfigCandidates / hasPythonFiles の `excludeRoot` 引数の挙動を検証する。
 *
 * `excludeRoot` を渡すと、解析対象ルート (analysisRoot) 自身の
 * `.anytime/analyze-exclude` ではなく、`excludeRoot` の `.anytime/analyze-exclude`
 * が除外パターンとして適用される（開いているワークスペース基準への切り替え）。
 */

/** `excludeRoot/.anytime/analyze-exclude` を指定内容で作成する。 */
function writeExclude(root: string, content: string): void {
  const dir = path.join(root, '.anytime');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'analyze-exclude'), content, 'utf-8');
}

describe('hasPythonFiles — excludeRoot', () => {
  it('excludeRoot の analyze-exclude で examples/ 配下の .py を除外する', () => {
    const analysisRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'er-ar-'));
    const wsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'er-ws-'));
    try {
      // 解析対象には examples/ 配下にのみ .py がある
      fs.mkdirSync(path.join(analysisRoot, 'examples'), { recursive: true });
      fs.writeFileSync(path.join(analysisRoot, 'examples', 'mod.py'), 'def f():\n    return 1\n');
      // analysisRoot 自身には exclude を置かない（置いても無視されることを示す）
      writeExclude(analysisRoot, '');
      // 開いているワークスペース側の exclude に examples/ を記載
      writeExclude(wsRoot, 'examples/\n');

      // excludeRoot=wsRoot を渡すと examples/ が除外され、.py 0 件 → false
      expect(hasPythonFiles(analysisRoot, wsRoot)).toBe(false);
      // excludeRoot 省略時は従来どおり analysisRoot 基準（空 exclude）→ true
      expect(hasPythonFiles(analysisRoot)).toBe(true);
    } finally {
      fs.rmSync(analysisRoot, { recursive: true, force: true });
      fs.rmSync(wsRoot, { recursive: true, force: true });
    }
  });
});

describe('findTsconfigCandidates — excludeRoot', () => {
  it('excludeRoot の analyze-exclude で examples/ 配下の tsconfig.json を除外する', () => {
    const analysisRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'er-ts-ar-'));
    const wsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'er-ts-ws-'));
    try {
      fs.writeFileSync(path.join(analysisRoot, 'tsconfig.json'), '{}');
      fs.mkdirSync(path.join(analysisRoot, 'examples'), { recursive: true });
      fs.writeFileSync(path.join(analysisRoot, 'examples', 'tsconfig.json'), '{}');
      writeExclude(wsRoot, 'examples/\n');

      const withExclude = findTsconfigCandidates(analysisRoot, wsRoot);
      expect(withExclude.map((c) => c.rel)).toEqual(['tsconfig.json']);
      expect(withExclude.some((c) => c.rel.includes('examples'))).toBe(false);

      // excludeRoot 省略時は examples 配下も候補に含む（従来挙動）
      const withoutExclude = findTsconfigCandidates(analysisRoot);
      expect(withoutExclude.some((c) => c.rel.includes('examples'))).toBe(true);
    } finally {
      fs.rmSync(analysisRoot, { recursive: true, force: true });
      fs.rmSync(wsRoot, { recursive: true, force: true });
    }
  });
});
