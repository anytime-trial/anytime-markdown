import * as path from 'node:path';

import { loadAnalyzeExclude } from '@anytime-markdown/trail-core/analyzeExclude';
import { discoverPythonFiles } from '@anytime-markdown/code-analysis-python';

import { GraphDetector } from './GraphDetector';

export interface TsconfigCandidate {
  fsPath: string;
  rel: string;
  depth: number;
}

/**
 * `analysisRoot` 配下から `tsconfig.json` 候補を浅い順に返す。
 * 複数ある場合の選択は呼び出し側の責務（コマンドは QuickPick、HTTP は 1 件目）。
 *
 * `excludeRoot` を渡すと除外パターンを `analysisRoot` 自身ではなく `excludeRoot`
 * （開いているワークスペース）の `.anytime/trail/analyze-exclude` から読む。省略時は
 * 後方互換のため `analysisRoot` から読む。
 */
export function findTsconfigCandidates(
  analysisRoot: string,
  excludeRoot?: string,
): TsconfigCandidate[] {
  return new GraphDetector(analysisRoot, loadAnalyzeExclude(excludeRoot ?? analysisRoot))
    .detectFilesByName('tsconfig.json')
    .map((fsPath) => {
      const rel = path.relative(analysisRoot, fsPath);
      return { fsPath, rel, depth: rel.split(path.sep).length };
    })
    .sort((a, b) => (a.depth === b.depth ? a.rel.localeCompare(b.rel) : a.depth - b.depth));
}

/**
 * `analysisRoot` 配下に解析対象の Python ファイルが存在するか。
 * tsconfig が無い場合に Python-only 解析へフォールバックするかの判定に使う。
 * analyze-exclude を反映する（discoverPythonFiles が exclude を受け取る）。
 *
 * `excludeRoot` を渡すと除外パターンを `analysisRoot` 自身ではなく `excludeRoot`
 * （開いているワークスペース）から読む。省略時は後方互換で `analysisRoot` から読む。
 */
export function hasPythonFiles(analysisRoot: string, excludeRoot?: string): boolean {
  return discoverPythonFiles(analysisRoot, loadAnalyzeExclude(excludeRoot ?? analysisRoot)).length > 0;
}
