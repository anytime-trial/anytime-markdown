import path from 'node:path';
import type { Node } from 'web-tree-sitter';
import type { TrailNode, TrailNodeType } from '@anytime-markdown/code-analysis-core/model';

/**
 * tree-sitter の Python ツリーから TrailNode[] を抽出する。
 * id 規約は code-analysis-typescript の SymbolExtractor と同一:
 * - file ノード: `file::<relPath>`（filePath = repo 相対 POSIX、label = basename）
 * - symbol ノード: `<parentId>::<name>`（parent = 親ノード id）
 * 下流 trailGraphToCodeGraphInputs は filePath を使って CodeGraphNode を作る。
 */
export class PythonSymbolExtractor {
  extract(relPath: string, root: Node): TrailNode[] {
    const nodes: TrailNode[] = [];
    const fileId = `file::${relPath}`;
    nodes.push({ id: fileId, label: path.posix.basename(relPath), type: 'file', filePath: relPath, line: 1 });
    this.walk(root, relPath, fileId, fileId, nodes, true);
    return this.dedupeById(nodes);
  }

  /** 同一 id（同名トップレベル関数など）は最後の出現を残す（TS 実装と同挙動）。 */
  private dedupeById(nodes: TrailNode[]): TrailNode[] {
    const lastIndex = new Map<string, number>();
    nodes.forEach((n, i) => lastIndex.set(n.id, i));
    return nodes.filter((n, i) => lastIndex.get(n.id) === i);
  }

  private unwrap(node: Node): Node {
    return node.type === 'decorated_definition' ? (node.childForFieldName('definition') ?? node) : node;
  }

  private walk(node: Node, relPath: string, fileId: string, parentId: string, out: TrailNode[], moduleLevel: boolean): void {
    for (const child of node.namedChildren) {
      if (!child) continue;
      const def = this.unwrap(child);
      if (def.type === 'class_definition' || def.type === 'function_definition') {
        const name = def.childForFieldName('name')?.text ?? '<anonymous>';
        const line = def.startPosition.row + 1;
        const type: TrailNodeType = def.type === 'class_definition' ? 'class' : 'function';
        const id = `${parentId}::${name}`;
        out.push({ id, label: name, type, filePath: relPath, line, parent: parentId, exported: !name.startsWith('_') });
        const body = def.childForFieldName('body');
        if (body) this.walk(body, relPath, fileId, id, out, false);
      } else if (moduleLevel && child.type === 'expression_statement') {
        const assign = child.namedChildren.find((c) => c?.type === 'assignment');
        const lhs = assign?.childForFieldName('left');
        if (lhs?.type === 'identifier') {
          const name = lhs.text;
          const line = child.startPosition.row + 1;
          out.push({ id: `${fileId}::${name}`, label: name, type: 'variable', filePath: relPath, line, parent: fileId, exported: !name.startsWith('_') });
        }
      }
    }
  }
}
