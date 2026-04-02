import ts from 'typescript';
import path from 'node:path';
import type { TrailNode } from '../model/types';
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

    return nodes;
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

    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      return {
        id: `${parentId}::${name}`,
        label: name,
        type: 'class',
        filePath: relativePath,
        line,
        parent: parentId,
      };
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      return {
        id: `${parentId}::${name}`,
        label: name,
        type: 'function',
        filePath: relativePath,
        line,
        parent: parentId,
      };
    }

    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      return {
        id: `${parentId}::${name}`,
        label: name,
        type: 'function',
        filePath: relativePath,
        line,
        parent: parentId,
      };
    }

    return null;
  }
}
