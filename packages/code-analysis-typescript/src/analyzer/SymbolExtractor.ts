import ts from 'typescript';
import path from 'node:path';
import type { TrailNode } from '@anytime-markdown/code-analysis-core/model';
import type { ProjectAnalyzer } from './ProjectAnalyzer';

export class SymbolExtractor {
  private readonly analyzer: ProjectAnalyzer;

  constructor(analyzer: ProjectAnalyzer) {
    this.analyzer = analyzer;
  }

  extract(): TrailNode[] {
    const nodes: TrailNode[] = [];
    const root = this.analyzer.getProjectRoot();

    for (const sourceFile of this.analyzer.getSourceFiles()) {
      const relativePath = path.relative(root, sourceFile.fileName);
      const fileId = `file::${relativePath}`;

      nodes.push({
        id: fileId,
        label: path.basename(relativePath),
        type: 'file',
        filePath: relativePath,
        line: 1,
      });

      this.visitNode(sourceFile, fileId, relativePath, nodes);
    }

    return this.dedupeOverloads(nodes);
  }

  private dedupeOverloads(nodes: TrailNode[]): TrailNode[] {
    const lastIndex = new Map<string, number>();
    for (let i = 0; i < nodes.length; i++) {
      lastIndex.set(nodes[i].id, i);
    }
    return nodes.filter((node, i) => lastIndex.get(node.id) === i);
  }

  private visitNode(
    node: ts.Node,
    parentId: string,
    relativePath: string,
    nodes: TrailNode[],
  ): void {
    ts.forEachChild(node, (child) => {
      const extracted = this.extractSymbol(child, parentId, relativePath);
      if (extracted) {
        nodes.push(extracted);
        this.visitNode(child, extracted.id, relativePath, nodes);
      } else {
        this.visitNode(child, parentId, relativePath, nodes);
      }
    });
  }

  private extractSymbol(
    node: ts.Node,
    parentId: string,
    relativePath: string,
  ): TrailNode | null {
    const sourceFile = node.getSourceFile();
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    const declared = namedDeclarationOf(node);
    if (declared) {
      return {
        id: `${parentId}::${declared.name}`,
        label: declared.name,
        type: declared.type,
        filePath: relativePath,
        line,
        parent: parentId,
      };
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      return extractVariableSymbol(
        node as ts.VariableDeclaration & { name: ts.Identifier },
        parentId,
        relativePath,
        line,
      );
    }

    return null;
  }
}

/**
 * 名前付き宣言ノードから label と TrailNode 種別を決める（該当しなければ null）。
 * 判定順は元の if 連鎖と同じ（先に一致した種別が勝つ）。
 */
function namedDeclarationOf(
  node: ts.Node,
): { name: string; type: TrailNode['type'] } | null {
  if (ts.isClassDeclaration(node) && node.name) {
    return { name: node.name.text, type: 'class' };
  }
  if (ts.isFunctionDeclaration(node) && node.name) {
    return { name: node.name.text, type: 'function' };
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return { name: node.name.text, type: 'function' };
  }
  if (ts.isInterfaceDeclaration(node) && node.name) {
    return { name: node.name.text, type: 'interface' };
  }
  if (ts.isTypeAliasDeclaration(node) && node.name) {
    return { name: node.name.text, type: 'type' };
  }
  if (ts.isEnumDeclaration(node) && node.name) {
    return { name: node.name.text, type: 'enum' };
  }
  if (ts.isModuleDeclaration(node) && node.name) {
    return { name: node.name.text, type: 'namespace' };
  }
  return null;
}

function isContainerLikeInit(init: ts.Expression): boolean {
  return (
    ts.isObjectLiteralExpression(init) ||
    ts.isCallExpression(init) ||
    ts.isArrowFunction(init) ||
    ts.isFunctionExpression(init) ||
    ts.isClassExpression(init) ||
    ts.isNewExpression(init)
  );
}

function extractVariableSymbol(
  node: ts.VariableDeclaration & { name: ts.Identifier },
  parentId: string,
  relativePath: string,
  line: number,
): import('@anytime-markdown/code-analysis-core/model').TrailNode | null {
  const statement = node.parent?.parent;
  if (!statement || !ts.isVariableStatement(statement)) return null;

  const hasExport =
    statement.modifiers?.some(
      m => m.kind === ts.SyntaxKind.ExportKeyword,
    ) ?? false;

  const init = node.initializer;
  const isContainerLike = !!init && isContainerLikeInit(init);

  if (!hasExport && !isContainerLike) return null;

  const name = node.name.text;
  return {
    id: `${parentId}::${name}`,
    label: name,
    type: 'variable',
    filePath: relativePath,
    line,
    parent: parentId,
    exported: hasExport,
  };
}
