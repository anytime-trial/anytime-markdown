import path from 'node:path';
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

  const tsconfigDir = path.resolve(path.dirname(tsconfigPath));
  const adapter = TypeScriptAdapter.fromTsConfig(tsconfigPath);

  // 全ソースファイルを取得（宣言ファイル・node_modules を除外）
  const allSourceFiles = adapter
    .getProgram()
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile && !sf.fileName.includes('node_modules'))
    .map((sf) => sf.fileName);

  // 絶対パス → tsconfig ディレクトリ基準の相対パス のマッピングを事前構築
  const absToRel = new Map<string, string>();
  for (const absPath of allSourceFiles) {
    absToRel.set(path.resolve(absPath), path.relative(tsconfigDir, absPath));
  }

  const analyzer = new ImportanceAnalyzer(adapter);
  const scored = analyzer.analyze(allSourceFiles);

  // 関数スコアをファイルパスごとに集約（ファイル単位の max）
  // fn.filePath は process.cwd() 基準の相対パスなので絶対パスに変換してから正規化する
  const fileScores = new Map<string, number>();
  for (const fn of scored) {
    const absPath = path.resolve(fn.filePath);
    const relPath = absToRel.get(absPath) ?? path.relative(tsconfigDir, absPath);
    const current = fileScores.get(relPath) ?? 0;
    if (fn.importanceScore > current) {
      fileScores.set(relPath, fn.importanceScore);
    }
  }

  // system タイプを除外: boundary フレームに色が伝播しないようにする
  const mappableElements = c4Elements.filter((el) => el.type !== 'system');

  // ユニークなファイルパスだけ C4 要素にマッピング（要素単位の max）
  const elementScores = new Map<string, number>();
  for (const [filePath, score] of fileScores) {
    const mappings = mapFilesToC4Elements([filePath], mappableElements);
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
