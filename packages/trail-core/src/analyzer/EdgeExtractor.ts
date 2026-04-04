import ts from 'typescript';
import path from 'node:path';
import type { TrailEdge, TrailNode } from '../model/types';
import type { ProjectAnalyzer } from './ProjectAnalyzer';

export class EdgeExtractor {
  private readonly analyzer: ProjectAnalyzer;
  private readonly nodes: readonly TrailNode[];
  private readonly symbolToNodeId: Map<ts.Symbol, string>;

  constructor(analyzer: ProjectAnalyzer, nodes: readonly TrailNode[]) {
    this.analyzer = analyzer;
    this.nodes = nodes;
    this.symbolToNodeId = new Map();
  }

  extract(): TrailEdge[] {
    const checker = this.analyzer.getTypeChecker();
    const edges: TrailEdge[] = [];

    this.buildSymbolMap(checker);

    for (const sourceFile of this.analyzer.getSourceFiles()) {
      this.extractImportEdges(sourceFile, checker, edges);
      this.extractCallEdges(sourceFile, checker, edges);
      this.extractHeritageEdges(sourceFile, checker, edges);
      this.extractOverrideEdges(sourceFile, checker, edges);
    }

    return this.deduplicateEdges(edges);
  }

  private buildSymbolMap(checker: ts.TypeChecker): void {
    for (const sourceFile of this.analyzer.getSourceFiles()) {
      this.visitForSymbolMap(sourceFile, checker);
    }
  }

  private visitForSymbolMap(node: ts.Node, checker: ts.TypeChecker): void {
    if (
      (ts.isClassDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isInterfaceDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      const symbol = checker.getSymbolAtLocation(node.name);
      if (symbol) {
        const trailNode = this.findTrailNodeForDeclaration(node);
        if (trailNode) {
          this.symbolToNodeId.set(symbol, trailNode.id);
        }
      }
    }

    ts.forEachChild(node, (child) => {
      this.visitForSymbolMap(child, checker);
    });
  }

  private findTrailNodeForDeclaration(
    node:
      | ts.ClassDeclaration
      | ts.FunctionDeclaration
      | ts.MethodDeclaration
      | ts.InterfaceDeclaration,
  ): TrailNode | undefined {
    if (!node.name || !ts.isIdentifier(node.name)) {
      return undefined;
    }

    const name = node.name.text;
    const sourceFile = node.getSourceFile();
    const relativePath = path.relative(
      this.analyzer.getProjectRoot(),
      sourceFile.fileName,
    );

    return this.nodes.find(
      (n) => n.label === name && n.filePath === relativePath,
    );
  }

  private extractImportEdges(
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
  ): void {
    const root = this.analyzer.getProjectRoot();
    const sourceRelative = path.relative(root, sourceFile.fileName);
    const sourceFileNodeId = `file::${sourceRelative}`;

    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isImportDeclaration(node)) {
        return;
      }

      const moduleSymbol = checker.getSymbolAtLocation(node.moduleSpecifier);
      if (!moduleSymbol) {
        return;
      }

      const declarations = moduleSymbol.getDeclarations();
      if (!declarations || declarations.length === 0) {
        return;
      }

      const targetFile = declarations[0].getSourceFile();
      const targetRelative = path.relative(root, targetFile.fileName);
      const targetFileNodeId = `file::${targetRelative}`;

      if (sourceFileNodeId !== targetFileNodeId) {
        edges.push({
          source: sourceFileNodeId,
          target: targetFileNodeId,
          type: 'import',
        });
      }
    });
  }

  private extractCallEdges(
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
  ): void {
    this.visitForCallEdges(sourceFile, checker, edges);
  }

  private visitForCallEdges(
    node: ts.Node,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
  ): void {
    if (ts.isCallExpression(node)) {
      this.processCallExpression(node, checker, edges);
    }

    ts.forEachChild(node, (child) => {
      this.visitForCallEdges(child, checker, edges);
    });
  }

  private processCallExpression(
    node: ts.CallExpression,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
  ): void {
    let callSymbol = checker.getSymbolAtLocation(node.expression);
    if (!callSymbol) {
      return;
    }

    if (callSymbol.flags & ts.SymbolFlags.Alias) {
      callSymbol = checker.getAliasedSymbol(callSymbol);
    }

    const targetNodeId = this.symbolToNodeId.get(callSymbol);
    if (!targetNodeId) {
      return;
    }

    const enclosing = this.findEnclosingFunction(node);
    if (!enclosing) {
      return;
    }

    const sourceNodeId = this.findTrailNodeForDeclaration(enclosing)?.id;
    if (!sourceNodeId) {
      return;
    }

    edges.push({
      source: sourceNodeId,
      target: targetNodeId,
      type: 'call',
    });
  }

  private findEnclosingFunction(
    node: ts.Node,
  ): ts.FunctionDeclaration | ts.MethodDeclaration | ts.ClassDeclaration | undefined {
    let current = node.parent;
    while (current) {
      if (
        ts.isFunctionDeclaration(current) ||
        ts.isMethodDeclaration(current)
      ) {
        return current;
      }
      current = current.parent;
    }
    return undefined;
  }

  private extractHeritageEdges(
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
  ): void {
    this.visitForHeritageEdges(sourceFile, checker, edges);
  }

  private visitForHeritageEdges(
    node: ts.Node,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
  ): void {
    if (ts.isClassDeclaration(node) && node.heritageClauses) {
      const sourceTrailNode = node.name
        ? this.findTrailNodeForDeclaration(node)
        : undefined;
      if (sourceTrailNode) {
        for (const clause of node.heritageClauses) {
          const edgeType: TrailEdge['type'] =
            clause.token === ts.SyntaxKind.ExtendsKeyword
              ? 'inheritance'
              : 'implementation';

          for (const heritageType of clause.types) {
            let symbol = checker.getSymbolAtLocation(heritageType.expression);
            if (!symbol) {
              continue;
            }
            if (symbol.flags & ts.SymbolFlags.Alias) {
              symbol = checker.getAliasedSymbol(symbol);
            }
            const targetNodeId = this.symbolToNodeId.get(symbol);
            if (targetNodeId) {
              edges.push({
                source: sourceTrailNode.id,
                target: targetNodeId,
                type: edgeType,
              });
            }
          }
        }
      }
    }

    ts.forEachChild(node, (child) => {
      this.visitForHeritageEdges(child, checker, edges);
    });
  }

  private extractOverrideEdges(
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
  ): void {
    this.visitForOverrideEdges(sourceFile, checker, edges);
  }

  private visitForOverrideEdges(
    node: ts.Node,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
  ): void {
    if (
      ts.isMethodDeclaration(node) &&
      node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.OverrideKeyword,
      ) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      const sourceTrailNode = this.findTrailNodeForDeclaration(node);
      if (sourceTrailNode) {
        const parent = node.parent;
        if (ts.isClassDeclaration(parent) && parent.heritageClauses) {
          const extendsClause = parent.heritageClauses.find(
            (c) => c.token === ts.SyntaxKind.ExtendsKeyword,
          );
          if (extendsClause && extendsClause.types.length > 0) {
            const baseType = extendsClause.types[0];
            let baseSymbol = checker.getSymbolAtLocation(
              baseType.expression,
            );
            if (baseSymbol) {
              if (baseSymbol.flags & ts.SymbolFlags.Alias) {
                baseSymbol = checker.getAliasedSymbol(baseSymbol);
              }
              const methodName = node.name.text;
              const baseDecls = baseSymbol.getDeclarations();
              if (baseDecls) {
                for (const decl of baseDecls) {
                  if (ts.isClassDeclaration(decl)) {
                    for (const member of decl.members) {
                      if (
                        ts.isMethodDeclaration(member) &&
                        member.name &&
                        ts.isIdentifier(member.name) &&
                        member.name.text === methodName
                      ) {
                        const targetTrailNode =
                          this.findTrailNodeForDeclaration(member);
                        if (targetTrailNode) {
                          edges.push({
                            source: sourceTrailNode.id,
                            target: targetTrailNode.id,
                            type: 'override',
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, (child) => {
      this.visitForOverrideEdges(child, checker, edges);
    });
  }

  private deduplicateEdges(edges: TrailEdge[]): TrailEdge[] {
    const seen = new Set<string>();
    const result: TrailEdge[] = [];

    for (const edge of edges) {
      const key = `${edge.source}|${edge.target}|${edge.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(edge);
      }
    }

    return result;
  }
}
