/**
 * computePythonImportance
 *
 * tsconfig ベースの TS importance 経路（computeAndPersistImportance）とは別に、
 * リポジトリ内の Python ファイル群から PythonAdapter で importance を算出する。
 *
 * Phase 2 の方針 A（混在リポのみ）: tsconfig ありのリポで TS importance 計算後に
 * .py が存在すれば本 helper を呼び、ScoredFunction[]（language='python'）を
 * TS の scored と結合して computeAndPersistFileAnalysis に流す。
 *
 * computeAndPersistFileAnalysis は `path.relative(analysisRoot, fn.filePath)` で
 * 相対化するため、ここで filePath を **絶対パス** に正規化して返す
 * （PythonAdapter は repo 相対 POSIX を返すため）。
 */
import fs from 'node:fs';
import path from 'node:path';

import type { Ignore } from 'ignore';
import type { Node } from 'web-tree-sitter';
import {
  discoverPythonFiles,
  createPythonParser,
  PythonImportResolver,
  PythonAdapter,
} from '@anytime-markdown/code-analysis-python';
// barrel `trail-core/importance` 経由だと TypeScriptAdapter/MutationAnalyzer(typescript) を
// 巻き込むため、typescript 非依存の code-analysis-core/importance から直接 import する。
import { ImportanceAnalyzer } from '@anytime-markdown/code-analysis-core/importance';
import type { ScoredFunction } from '@anytime-markdown/trail-core/importance';

import type { Logger } from '../runtime/Logger';

export interface PythonImportanceResult {
  /** filePath は絶対パス（computeAndPersistFileAnalysis が analysisRoot 基準で相対化するため）。 */
  readonly scored: ScoredFunction[];
  /** relPath(POSIX, 拡張子 .py 付き) -> 行数。 */
  readonly lineCountByFile: Map<string, number>;
}

export interface ComputePythonImportanceOpts {
  readonly repoRoot: string;
  readonly exclude?: Ignore;
  /** bundle 環境で tree-sitter-python.wasm の絶対パス（Node 実行時は省略可）。 */
  readonly pythonWasmPath?: string;
  readonly logger?: Pick<Logger, 'warn'>;
}

const EMPTY: PythonImportanceResult = { scored: [], lineCountByFile: new Map() };

export async function computePythonImportance(
  opts: ComputePythonImportanceOpts,
): Promise<PythonImportanceResult> {
  const { repoRoot, exclude, pythonWasmPath, logger } = opts;
  const files = discoverPythonFiles(repoRoot, exclude);
  if (files.length === 0) return EMPTY;

  const parser = await createPythonParser(pythonWasmPath);
  const trees = new Map<string, Node>();
  const lineCountByFile = new Map<string, number>();
  for (const rel of files) {
    let src: string;
    try {
      src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch (err) {
      logger?.warn(
        `[python-importance] skip unreadable file ${rel}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    const tree = parser.parse(src);
    if (!tree) continue;
    trees.set(rel, tree.rootNode);
    lineCountByFile.set(rel, countLines(src));
  }
  if (trees.size === 0) return EMPTY;

  const resolver = new PythonImportResolver(new Set(files));
  const adapter = new PythonAdapter(trees, (m, from) => resolver.resolve(m, from));
  const scoredRel = new ImportanceAnalyzer(adapter).analyze(files);
  // PythonAdapter は repo 相対 POSIX の filePath を返すため、絶対パスへ正規化する。
  const scored = scoredRel.map((fn) => ({ ...fn, filePath: path.join(repoRoot, fn.filePath) }));
  return { scored, lineCountByFile };
}

function countLines(src: string): number {
  if (src.length === 0) return 0;
  const n = src.split('\n').length;
  return src.endsWith('\n') ? n - 1 : n;
}
