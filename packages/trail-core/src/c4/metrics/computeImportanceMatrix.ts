import type { ImportanceMatrix } from '../../importance/types';
import type { C4Element } from '../../domain/engine/c4Mapper';
import { TypeScriptAdapter } from '../../importance/adapters/TypeScriptAdapter';
import { ImportanceAnalyzer } from '../../importance/ImportanceAnalyzer';
import { mapFilesToC4Elements } from '../../domain/engine/c4Mapper';

/**
 * tsconfig.json のパスと C4 要素リストを受け取り、
 * 要素IDごとの重要度スコア（0〜100）を返す。
 * 集約戦略: 同一要素内の関数スコアは max を採用。
 */
export function computeImportanceMatrix(
  tsconfigPath: string,
  c4Elements: readonly C4Element[],
): ImportanceMatrix {
  if (c4Elements.length === 0) return {};

  const adapter = TypeScriptAdapter.fromTsConfig(tsconfigPath);

  // 全ソースファイルを取得（宣言ファイル・node_modules を除外）
  const allSourceFiles = adapter
    .getProgram()
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile && !sf.fileName.includes('node_modules'))
    .map((sf) => sf.fileName);

  const analyzer = new ImportanceAnalyzer(adapter);
  const scored = analyzer.analyze(allSourceFiles);

  // 関数スコアをファイルパスごとに集約（ファイル単位の max）
  const fileScores = new Map<string, number>();
  for (const fn of scored) {
    const current = fileScores.get(fn.filePath) ?? 0;
    if (fn.importanceScore > current) {
      fileScores.set(fn.filePath, fn.importanceScore);
    }
  }

  // ユニークなファイルパスだけ C4 要素にマッピング（要素単位の max）
  const elementScores = new Map<string, number>();
  for (const [filePath, score] of fileScores) {
    const mappings = mapFilesToC4Elements([filePath], c4Elements);
    for (const mapping of mappings) {
      const current = elementScores.get(mapping.elementId) ?? 0;
      if (score > current) elementScores.set(mapping.elementId, score);
    }
  }

  const matrix: ImportanceMatrix = {};
  for (const [elementId, score] of elementScores) {
    matrix[elementId] = score;
  }
  return matrix;
}
