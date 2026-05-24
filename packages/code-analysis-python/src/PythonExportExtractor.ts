import type { Node } from 'web-tree-sitter';

/**
 * `/api/c4/functions` 用の export シンボル。trail-core の ExportedSymbol と構造互換
 * （id = `<relPath>::<name>`、method は `<relPath>::<Class>::<method>`、`file::` 前置なし）。
 */
export interface PythonExportedSymbol {
  readonly id: string;
  readonly name: string;
  readonly kind: 'function' | 'class' | 'method' | 'variable';
  readonly filePath: string;
  readonly line: number;
}

/**
 * tree-sitter の Python ツリーから「公開」シンボル一覧を抽出する。
 * Python に export 構文は無いため、`_` 始まりでない名前を公開とみなす
 * （PythonSymbolExtractor の `exported` 判定と同一）。dunder（`__init__` 等）も
 * `_` 始まりのため除外される。
 *
 * TS の ExportExtractor（ts.SourceFile 専用）の Python 版。
 */
export class PythonExportExtractor {
  static extract(relPath: string, root: Node): PythonExportedSymbol[] {
    const out: PythonExportedSymbol[] = [];
    for (const child of root.namedChildren) {
      if (!child) continue;
      const def =
        child.type === 'decorated_definition' ? child.childForFieldName('definition') : child;
      if (def?.type === 'function_definition') {
        PythonExportExtractor.pushDef(def, relPath, `${relPath}`, 'function', out);
      } else if (def?.type === 'class_definition') {
        const className = def.childForFieldName('name')?.text;
        if (!className || isPrivate(className)) continue;
        out.push({
          id: `${relPath}::${className}`,
          name: className,
          kind: 'class',
          filePath: relPath,
          line: def.startPosition.row + 1,
        });
        PythonExportExtractor.collectMethods(def, relPath, className, out);
      } else if (child.type === 'expression_statement') {
        PythonExportExtractor.collectModuleVariable(child, relPath, out);
      }
    }
    return out;
  }

  private static pushDef(
    def: Node,
    relPath: string,
    parentScope: string,
    kind: 'function' | 'method',
    out: PythonExportedSymbol[],
  ): void {
    const name = def.childForFieldName('name')?.text;
    if (!name || isPrivate(name)) return;
    out.push({
      id: `${parentScope}::${name}`,
      name,
      kind,
      filePath: relPath,
      line: def.startPosition.row + 1,
    });
  }

  private static collectMethods(
    classDef: Node,
    relPath: string,
    className: string,
    out: PythonExportedSymbol[],
  ): void {
    const body = classDef.childForFieldName('body');
    if (!body) return;
    for (const member of body.namedChildren) {
      if (!member) continue;
      const def =
        member.type === 'decorated_definition'
          ? member.childForFieldName('definition')
          : member;
      if (def?.type === 'function_definition') {
        PythonExportExtractor.pushDef(def, relPath, `${relPath}::${className}`, 'method', out);
      }
    }
  }

  private static collectModuleVariable(
    stmt: Node,
    relPath: string,
    out: PythonExportedSymbol[],
  ): void {
    const assign = stmt.namedChildren.find((c) => c?.type === 'assignment');
    const lhs = assign?.childForFieldName('left');
    if (lhs?.type !== 'identifier') return;
    const name = lhs.text;
    if (isPrivate(name)) return;
    out.push({
      id: `${relPath}::${name}`,
      name,
      kind: 'variable',
      filePath: relPath,
      line: stmt.startPosition.row + 1,
    });
  }
}

function isPrivate(name: string): boolean {
  return name.startsWith('_');
}
