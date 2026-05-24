import type { Node } from 'web-tree-sitter';

type ResolveModule = (module: string, fromRel: string) => string | undefined;

interface Binding {
  /** 解決済みの参照先ファイル（repo 相対 POSIX） */
  file: string;
  /** import 元での元の名前（alias を剥がした実シンボル名） */
  name: string;
}

/**
 * 1 ファイルの tree-sitter ツリーに対し、call ノードの
 * - 囲い関数 id（呼び出し元シンボル）
 * - callee シンボル id（呼び出し先）
 * を自前名前解決で近似する。
 *
 * id 規約は PythonSymbolExtractor / PythonEdgeExtractor と同一
 * （file=`file::<rel>`、symbol=`<parentId>::<name>`、class/function ネストは `::` 連結）。
 *
 * 解決方針:
 * - callee は `call` の `function` フィールドが `identifier`（単純名）の場合のみ。
 *   `attribute`（`obj.method`）や添字・呼び出し結果への呼び出し等は動的のため未解決（undefined）。
 * - 単純名は (1) from-import 束縛 → `file::<boundFile>::<origName>`、
 *   (2) 同一ファイルのトップレベル関数 → `file::<rel>::<name>` の順で解決。
 * - 囲い関数は call から親チェーンを辿り最近傍 `function_definition` の id。
 *   トップレベル（関数外）呼び出しはファイル id を source とする。
 */
export class PythonNameResolver {
  /** from-import のローカル名 -> 束縛 */
  private readonly bindings = new Map<string, Binding>();
  /** 同一ファイルのトップレベル関数名 */
  private readonly localFunctions = new Set<string>();

  constructor(
    private readonly relPath: string,
    root: Node,
    private readonly resolveModule: ResolveModule,
  ) {
    this.collectBindings(root);
    this.collectLocalFunctions(root);
  }

  /**
   * call ノードを囲う最近傍 `function_definition` の id を返す。
   * 関数外（モジュール直下・class 本体直下）の呼び出しはファイル id。
   */
  enclosingFunctionId(callNode: Node): string {
    let n: Node | null = callNode.parent;
    while (n && n.type !== 'module') {
      if (n.type === 'function_definition') return this.symbolIdOf(n);
      n = n.parent;
    }
    return `file::${this.relPath}`;
  }

  /**
   * call の callee シンボル id を解決する。解決できない場合は undefined。
   */
  resolveCallee(callNode: Node): string | undefined {
    const fn = callNode.childForFieldName('function');
    if (!fn || fn.type !== 'identifier') return undefined; // attribute / 動的は未解決
    const name = fn.text;
    const bound = this.bindings.get(name);
    if (bound) return `file::${bound.file}::${bound.name}`;
    if (this.localFunctions.has(name)) return `file::${this.relPath}::${name}`;
    return undefined;
  }

  /** class/function 定義ノードから SymbolExtractor 互換の id を組み立てる。 */
  private symbolIdOf(defNode: Node): string {
    const names: string[] = [];
    let n: Node | null = defNode;
    while (n && n.type !== 'module') {
      if (n.type === 'function_definition' || n.type === 'class_definition') {
        const nm = n.childForFieldName('name')?.text;
        if (nm) names.unshift(nm);
      }
      n = n.parent;
    }
    return [`file::${this.relPath}`, ...names].join('::');
  }

  private collectBindings(root: Node): void {
    for (const child of root.namedChildren) {
      if (child?.type !== 'import_from_statement') continue;
      const mod = child.childForFieldName('module_name')?.text;
      const target = mod ? this.resolveModule(mod, this.relPath) : undefined;
      if (!target) continue;
      for (const nameNode of child.childrenForFieldName('name')) {
        if (!nameNode) continue;
        if (nameNode.type === 'aliased_import') {
          const orig = nameNode.childForFieldName('name')?.text;
          const alias = nameNode.childForFieldName('alias')?.text;
          if (orig && alias) this.bindings.set(alias, { file: target, name: orig });
        } else if (nameNode.type === 'dotted_name') {
          const nm = nameNode.text;
          this.bindings.set(nm, { file: target, name: nm });
        }
      }
    }
  }

  private collectLocalFunctions(root: Node): void {
    for (const child of root.namedChildren) {
      if (!child) continue;
      const def =
        child.type === 'decorated_definition' ? child.childForFieldName('definition') : child;
      if (def?.type === 'function_definition') {
        const nm = def.childForFieldName('name')?.text;
        if (nm) this.localFunctions.add(nm);
      }
    }
  }
}
