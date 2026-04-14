// packages/trail-core/src/analyzer/ExportExtractor.ts
import ts from 'typescript';
import type { ExportedSymbol } from './flowTypes';

export class ExportExtractor {
  /**
   * SourceFile 配列から export 宣言を抽出する。
   * @param sourceFiles 解析対象ファイル
   * @param _componentId 将来のフィルタ用（現在未使用）
   */
  static extract(
    sourceFiles: readonly ts.SourceFile[],
    _componentId: string,
  ): ExportedSymbol[] {
    const symbols: ExportedSymbol[] = [];

    for (const sf of sourceFiles) {
      ts.forEachChild(sf, node => {
        ExportExtractor.visitTopLevel(node, sf, symbols);
      });
    }

    return symbols;
  }

  private static visitTopLevel(
    node: ts.Node,
    sf: ts.SourceFile,
    out: ExportedSymbol[],
  ): void {
    const mods = (node as ts.HasModifiers).modifiers;
    const isExported = mods?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) return;

    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const filePath = sf.fileName;

    if (ts.isFunctionDeclaration(node) && node.name) {
      out.push({ id: `${filePath}::${node.name.text}`, name: node.name.text, kind: 'function', filePath, line });
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const isFunc = decl.initializer !== undefined && (
          ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)
        );
        if (isFunc) {
          // アロー関数・関数式は function として扱う
          out.push({ id: `${filePath}::${decl.name.text}`, name: decl.name.text, kind: 'function', filePath, line });
        }
        // 純粋な定数（値のみ）はフローがないためスキップ
      }
    } else if (ts.isClassDeclaration(node) && node.name) {
      out.push({ id: `${filePath}::${node.name.text}`, name: node.name.text, kind: 'class', filePath, line });
      // public メソッドを収集
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const memberMods = (member as ts.HasModifiers).modifiers;
        const isPrivate = memberMods?.some(m =>
          m.kind === ts.SyntaxKind.PrivateKeyword ||
          m.kind === ts.SyntaxKind.ProtectedKeyword,
        );
        if (isPrivate) continue;
        if (!ts.isIdentifier(member.name)) continue;
        const mLine = sf.getLineAndCharacterOfPosition(member.getStart()).line + 1;
        out.push({
          id: `${filePath}::${node.name.text}::${member.name.text}`,
          name: member.name.text,
          kind: 'method',
          filePath,
          line: mLine,
        });
      }
    }
  }
}
