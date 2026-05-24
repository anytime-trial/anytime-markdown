import type { Node } from 'web-tree-sitter';
import type { TrailEdge } from '@anytime-markdown/code-analysis-core/model';

type ResolveModule = (module: string, fromRel: string) => string | undefined;

/**
 * Python ツリーから import（file→file）と inheritance エッジを抽出する。
 * call/type_use は意味解決が必要なため Phase 2 で追加する。
 * id 規約は SymbolExtractor と同一（file::<rel> / <parentId>::<name>）。
 * inheritance は単純基底（identifier）のみ解決: from-import 束縛 or 同一ファイル class。
 */
export class PythonEdgeExtractor {
  constructor(private readonly resolveModule: ResolveModule) {}

  extract(relPath: string, root: Node): TrailEdge[] {
    const edges: TrailEdge[] = [];
    const fileId = `file::${relPath}`;
    const bindings = new Map<string, string>(); // ローカル名 -> 解決済み相対ファイル
    const localClasses = this.collectLocalClassNames(root);
    this.collectImports(root, relPath, fileId, edges, bindings);
    this.collectInheritance(root, fileId, edges, bindings, localClasses);
    return edges;
  }

  private defOf(node: Node | null): Node | null {
    if (!node) return null;
    return node.type === 'decorated_definition' ? node.childForFieldName('definition') : node;
  }

  private collectLocalClassNames(root: Node): Set<string> {
    const names = new Set<string>();
    for (const child of root.namedChildren) {
      const def = this.defOf(child);
      if (def?.type === 'class_definition') {
        const n = def.childForFieldName('name')?.text;
        if (n) names.add(n);
      }
    }
    return names;
  }

  private moduleOf(nameNode: Node): string | undefined {
    if (nameNode.type === 'aliased_import') return nameNode.childForFieldName('name')?.text;
    if (nameNode.type === 'dotted_name') return nameNode.text;
    return undefined;
  }

  private localNameOf(nameNode: Node): string | undefined {
    if (nameNode.type === 'aliased_import') return nameNode.childForFieldName('alias')?.text;
    if (nameNode.type === 'dotted_name') return nameNode.text;
    return undefined;
  }

  private collectImports(root: Node, relPath: string, fileId: string, edges: TrailEdge[], bindings: Map<string, string>): void {
    for (const child of root.namedChildren) {
      if (!child) continue;
      if (child.type === 'import_statement') {
        for (const nameNode of child.childrenForFieldName('name')) {
          if (!nameNode) continue;
          const mod = this.moduleOf(nameNode);
          const target = mod ? this.resolveModule(mod, relPath) : undefined;
          if (target) edges.push({ source: fileId, target: `file::${target}`, type: 'import', importKind: 'static' });
        }
      } else if (child.type === 'import_from_statement') {
        const mod = child.childForFieldName('module_name')?.text;
        const target = mod ? this.resolveModule(mod, relPath) : undefined;
        if (!target) continue;
        edges.push({ source: fileId, target: `file::${target}`, type: 'import', importKind: 'static' });
        for (const nameNode of child.childrenForFieldName('name')) {
          if (!nameNode) continue;
          const local = this.localNameOf(nameNode);
          if (local) bindings.set(local, target);
        }
      }
    }
  }

  private collectInheritance(root: Node, fileId: string, edges: TrailEdge[], bindings: Map<string, string>, localClasses: ReadonlySet<string>): void {
    for (const child of root.namedChildren) {
      const def = this.defOf(child);
      if (def?.type !== 'class_definition') continue;
      const className = def.childForFieldName('name')?.text;
      if (!className) continue;
      const supers = def.childForFieldName('superclasses');
      if (!supers) continue;
      const subclassId = `${fileId}::${className}`;
      for (const base of supers.namedChildren) {
        if (base?.type !== 'identifier') continue; // qualified 基底（base.Thing）は Phase 2
        const baseName = base.text;
        let target: string | undefined;
        if (bindings.has(baseName)) target = `file::${bindings.get(baseName)}::${baseName}`;
        else if (localClasses.has(baseName)) target = `${fileId}::${baseName}`;
        if (target) edges.push({ source: subclassId, target, type: 'inheritance' });
      }
    }
  }
}
