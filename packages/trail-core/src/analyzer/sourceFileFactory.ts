// packages/trail-core/src/analyzer/sourceFileFactory.ts
//
// web-app 側から trail-core の typescript インスタンスを使って SourceFile を
// 生成できるようにするファクトリ関数。
// モノレポ内で typescript が複数インストールされている場合に型の不一致を防ぐ。
import ts from 'typescript';

/**
 * trail-core の typescript インスタンスで SourceFile を生成する。
 * @param fileName ファイルパス（表示用）
 * @param content ファイル内容
 */
export function createSourceFile(fileName: string, content: string): ts.SourceFile {
  return ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
}
