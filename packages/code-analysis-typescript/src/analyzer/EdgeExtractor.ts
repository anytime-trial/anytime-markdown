import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs';
import type { ImportKind, TrailEdge, TrailNode } from '@anytime-markdown/code-analysis-core/model';
import type { ProjectAnalyzer } from './ProjectAnalyzer';
import {
  resolveDeclarationToSource,
  type DeclarationSourceResolverDeps,
} from './declarationSourceResolver';

export interface EdgeExtractorResult {
  readonly edges: TrailEdge[];
  readonly diagnostics: readonly string[];
}

/** Returns the node cast to an override MethodDeclaration with Identifier name, or null. */
function asOverrideMethod(
  node: ts.Node,
): (ts.MethodDeclaration & { name: ts.Identifier }) | null {
  if (
    ts.isMethodDeclaration(node) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.OverrideKeyword) &&
    node.name &&
    ts.isIdentifier(node.name)
  ) {
    return node as ts.MethodDeclaration & { name: ts.Identifier };
  }
  return null;
}

export class EdgeExtractor {
  private readonly analyzer: ProjectAnalyzer;
  private readonly nodes: readonly TrailNode[];
  private readonly symbolToNodeId: Map<ts.Symbol, string>;
  private nodeIndex: Map<string, TrailNode>;
  /** ファイルノードの絶対パス集合（宣言ファイル救済の照合用、初回構築でメモ化）。 */
  private fileNodeAbsPaths?: ReadonlySet<string>;
  /** findPackageDir のディレクトリ単位キャッシュ。 */
  private readonly packageDirCache = new Map<string, string | null>();

  constructor(analyzer: ProjectAnalyzer, nodes: readonly TrailNode[]) {
    this.analyzer = analyzer;
    this.nodes = nodes;
    this.symbolToNodeId = new Map();
    this.nodeIndex = new Map();
  }

  extract(): TrailEdge[] {
    return this.extractWithDiagnostics().edges;
  }

  extractWithDiagnostics(): EdgeExtractorResult {
    const checker = this.analyzer.getTypeChecker();
    const edges: TrailEdge[] = [];
    const diagnostics: string[] = [];
    const sourceFiles = this.analyzer
      .getSourceFiles()
      .filter((sf) => !sf.isDeclarationFile);

    this.nodeIndex = new Map();
    for (const node of this.nodes) {
      this.nodeIndex.set(`${node.filePath}::${node.label}`, node);
    }

    this.buildSymbolMap(checker, sourceFiles);

    for (const sourceFile of sourceFiles) {
      this.extractImportEdges(sourceFile, checker, edges, diagnostics);
      this.extractCallEdges(sourceFile, checker, edges, diagnostics);
      this.extractHeritageEdges(sourceFile, checker, edges, diagnostics);
      this.extractOverrideEdges(sourceFile, checker, edges, diagnostics);
    }

    return { edges: this.deduplicateEdges(edges), diagnostics };
  }

  private buildSymbolMap(
    checker: ts.TypeChecker,
    sourceFiles: readonly ts.SourceFile[],
  ): void {
    for (const sourceFile of sourceFiles) {
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

    return this.nodeIndex.get(`${relativePath}::${name}`);
  }

  /**
   * 宣言ファイル(.d.ts)への解決を、同一 in-repo パッケージの実ソースノードへ
   * 張り直す。救済不可（外部依存・対応ソース無し）の場合は null。
   */
  private recoverDeclarationSource(
    declAbs: string,
    root: string,
    diagnostics: string[],
  ): string | null {
    // preserveSymlinks 環境では node_modules シンボリックリンク経由で返ることが
    // あるため、projectRoot 判定前に実体パスへ正規化する。
    // 初期代入は try で必ず上書きされ catch でも再代入されるため、未読の初期値は持たせない
    // (js/useless-assignment-to-local 回避)。
    let real: string;
    try {
      real = fs.realpathSync(declAbs);
    } catch (err) {
      diagnostics.push(
        `realpath failed for ${declAbs}: ${(err as Error).message}`,
      );
      real = declAbs;
    }
    const deps: DeclarationSourceResolverDeps = {
      readDeclarationMapSources: (p) => this.readDeclarationMapSources(p, diagnostics),
      findPackageDir: (p) => this.findPackageDir(p),
    };
    return resolveDeclarationToSource(real, root, this.getFileNodeAbsPaths(root), deps);
  }

  private getFileNodeAbsPaths(root: string): ReadonlySet<string> {
    if (!this.fileNodeAbsPaths) {
      const set = new Set<string>();
      for (const node of this.nodes) {
        if (node.type === 'file') set.add(path.resolve(root, node.filePath));
      }
      this.fileNodeAbsPaths = set;
    }
    return this.fileNodeAbsPaths;
  }

  /** declarationMap(.d.ts.map) から元ソースの絶対パスを返す。無ければ空配列。 */
  private readDeclarationMapSources(declFilePath: string, diagnostics: string[]): string[] {
    const mapPath = `${declFilePath}.map`;
    let raw: string;
    try {
      raw = fs.readFileSync(mapPath, 'utf8');
    } catch (err) {
      // .d.ts.map が無いのは通常ケース（declarationMap 未出力）なので ENOENT は無視
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        diagnostics.push(
          `Failed to read declaration map ${mapPath}: ${(err as Error).message}`,
        );
      }
      return [];
    }
    try {
      const json = JSON.parse(raw) as { sources?: string[]; sourceRoot?: string };
      const sources = json.sources ?? [];
      const mapDir = path.dirname(mapPath);
      const sourceRoot = json.sourceRoot ?? '';
      return sources.map((s) => path.resolve(mapDir, sourceRoot, s));
    } catch (err) {
      diagnostics.push(
        `Failed to parse declaration map ${mapPath}: ${(err as Error).message}`,
      );
      return [];
    }
  }

  /** 指定ファイルの最近接 package.json ディレクトリ（絶対パス）。無ければ null。 */
  private findPackageDir(filePath: string): string | null {
    const startDir = path.dirname(filePath);
    const cached = this.packageDirCache.get(startDir);
    if (cached !== undefined) return cached;

    const fsRoot = path.parse(startDir).root;
    let cursor = startDir;
    while (true) {
      if (fs.existsSync(path.join(cursor, 'package.json'))) {
        this.packageDirCache.set(startDir, cursor);
        return cursor;
      }
      if (cursor === fsRoot) break;
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    this.packageDirCache.set(startDir, null);
    return null;
  }

  private extractImportEdges(
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
    diagnostics: string[],
  ): void {
    const root = this.analyzer.getProjectRoot();
    const sourceRelative = path.relative(root, sourceFile.fileName);
    const sourceFileNodeId = `file::${sourceRelative}`;

    const pushEdge = (
      moduleSpecifier: ts.Expression | undefined,
      kind: ImportKind,
    ): void => {
      if (!moduleSpecifier || !ts.isStringLiteralLike(moduleSpecifier)) return;
      const moduleSpecifierText = moduleSpecifier.text;
      const moduleSymbol = checker.getSymbolAtLocation(moduleSpecifier);
      if (!moduleSymbol) {
        diagnostics.push(
          `Import source file not found: ${moduleSpecifierText} (in ${sourceRelative})`,
        );
        return;
      }
      const declarations = moduleSymbol.getDeclarations();
      if (!declarations || declarations.length === 0) {
        diagnostics.push(
          `Import has no declarations: ${moduleSpecifierText} (in ${sourceRelative})`,
        );
        return;
      }
      const targetFile = declarations[0].getSourceFile();
      // 宣言ファイル(.d.ts)はノード除外されるため、in-repo パッケージの
      // ビルド成果物経由で参照された場合はエッジが消える。同一パッケージの
      // 実ソースノードへ張り直してエッジを救済する（外部依存・救済不可は元のまま）。
      const targetFileName = targetFile.isDeclarationFile
        ? this.recoverDeclarationSource(targetFile.fileName, root, diagnostics) ?? targetFile.fileName
        : targetFile.fileName;
      const targetRelative = path.relative(root, targetFileName);
      const targetFileNodeId = `file::${targetRelative}`;
      if (sourceFileNodeId === targetFileNodeId) return;
      edges.push({
        source: sourceFileNodeId,
        target: targetFileNodeId,
        type: 'import',
        importKind: kind,
      });
    };

    // Pattern 2 (dynamic import) と Pattern 6 (ImportTypeNode) は式・型の任意位置に現れるため再帰的に探索する
    const visit = (node: ts.Node): void => {
      // Pattern 2: import('pkg') の動的 import
      if (
        ts.isCallExpression(node)
        && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments.length >= 1
      ) {
        pushEdge(node.arguments[0], 'dynamic');
      }
      // Pattern 6: 型位置の import('pkg').X
      if (ts.isImportTypeNode(node)) {
        const arg = node.argument;
        if (ts.isLiteralTypeNode(arg) && ts.isStringLiteralLike(arg.literal)) {
          pushEdge(arg.literal, 'type');
        }
      }
      ts.forEachChild(node, visit);
    };

    // Pattern 1 (static / type-only import) と Pattern 3 (re-export) はトップレベル宣言のみ
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        const isTypeOnly = statement.importClause?.isTypeOnly === true;
        pushEdge(statement.moduleSpecifier, isTypeOnly ? 'type' : 'static');
      } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
        const isTypeOnly = statement.isTypeOnly === true;
        pushEdge(statement.moduleSpecifier, isTypeOnly ? 'type' : 'reexport');
      }
    }

    visit(sourceFile);
  }

  private extractCallEdges(
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
    diagnostics: string[],
  ): void {
    this.visitForCallEdges(sourceFile, checker, edges, diagnostics);
  }

  private visitForCallEdges(
    node: ts.Node,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
    diagnostics: string[],
  ): void {
    if (ts.isCallExpression(node)) {
      this.processCallExpression(node, checker, edges, diagnostics);
    }

    ts.forEachChild(node, (child) => {
      this.visitForCallEdges(child, checker, edges, diagnostics);
    });
  }

  private processCallExpression(
    node: ts.CallExpression,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
    diagnostics: string[],
  ): void {
    const expressionText = node.expression.getText();
    let callSymbol = checker.getSymbolAtLocation(node.expression);
    if (!callSymbol) {
      diagnostics.push(
        `Call target symbol not resolved for: ${expressionText}()`,
      );
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
    diagnostics: string[],
  ): void {
    this.visitForHeritageEdges(sourceFile, checker, edges, diagnostics);
  }

  private visitForHeritageEdges(
    node: ts.Node,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
    diagnostics: string[],
  ): void {
    if (ts.isClassDeclaration(node) && node.heritageClauses) {
      const sourceTrailNode = node.name
        ? this.findTrailNodeForDeclaration(node)
        : undefined;
      if (sourceTrailNode) {
        this.processHeritageClausesForNode(node.heritageClauses, sourceTrailNode, checker, edges, diagnostics);
      }
    }

    ts.forEachChild(node, (child) => {
      this.visitForHeritageEdges(child, checker, edges, diagnostics);
    });
  }

  private processHeritageClausesForNode(
    heritageClauses: ts.NodeArray<ts.HeritageClause>,
    sourceTrailNode: TrailNode,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
    diagnostics: string[],
  ): void {
    for (const clause of heritageClauses) {
      const edgeType: TrailEdge['type'] =
        clause.token === ts.SyntaxKind.ExtendsKeyword ? 'inheritance' : 'implementation';

      for (const heritageType of clause.types) {
        this.processHeritageType(heritageType, sourceTrailNode, edgeType, checker, edges, diagnostics);
      }
    }
  }

  private processHeritageType(
    heritageType: ts.ExpressionWithTypeArguments,
    sourceTrailNode: TrailNode,
    edgeType: TrailEdge['type'],
    checker: ts.TypeChecker,
    edges: TrailEdge[],
    diagnostics: string[],
  ): void {
    let symbol = checker.getSymbolAtLocation(heritageType.expression);
    if (!symbol) {
      diagnostics.push(
        `Heritage symbol not resolved for: ${heritageType.expression.getText()} (in class ${sourceTrailNode.label})`,
      );
      return;
    }
    if (symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    const targetNodeId = this.symbolToNodeId.get(symbol);
    if (targetNodeId) {
      edges.push({ source: sourceTrailNode.id, target: targetNodeId, type: edgeType });
    }
  }

  private extractOverrideEdges(
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
    diagnostics: string[],
  ): void {
    this.visitForOverrideEdges(sourceFile, checker, edges, diagnostics);
  }

  private visitForOverrideEdges(
    node: ts.Node,
    checker: ts.TypeChecker,
    edges: TrailEdge[],
    diagnostics: string[],
  ): void {
    const overrideMethod = asOverrideMethod(node);
    if (overrideMethod) {
      this.processOverrideMethod(overrideMethod, checker, edges);
    }
    ts.forEachChild(node, (child) => {
      this.visitForOverrideEdges(child, checker, edges, diagnostics);
    });
  }

  private processOverrideMethod(
    node: ts.MethodDeclaration & { name: ts.Identifier },
    checker: ts.TypeChecker,
    edges: TrailEdge[],
  ): void {
    const sourceTrailNode = this.findTrailNodeForDeclaration(node);
    if (!sourceTrailNode) return;

    const parent = node.parent;
    if (!ts.isClassDeclaration(parent) || !parent.heritageClauses) return;

    const extendsClause = parent.heritageClauses.find(
      (c) => c.token === ts.SyntaxKind.ExtendsKeyword,
    );
    if (!extendsClause || extendsClause.types.length === 0) return;

    let baseSymbol = checker.getSymbolAtLocation(extendsClause.types[0].expression);
    if (!baseSymbol) return;
    if (baseSymbol.flags & ts.SymbolFlags.Alias) {
      baseSymbol = checker.getAliasedSymbol(baseSymbol);
    }

    const methodName = node.name.text;
    const baseDecls = baseSymbol.getDeclarations();
    if (!baseDecls) return;

    for (const decl of baseDecls) {
      if (!ts.isClassDeclaration(decl)) continue;
      this.findAndPushOverrideEdge(decl.members, methodName, sourceTrailNode, edges);
    }
  }

  private findAndPushOverrideEdge(
    members: ts.NodeArray<ts.ClassElement>,
    methodName: string,
    sourceTrailNode: TrailNode,
    edges: TrailEdge[],
  ): void {
    for (const member of members) {
      if (
        ts.isMethodDeclaration(member) &&
        member.name &&
        ts.isIdentifier(member.name) &&
        member.name.text === methodName
      ) {
        const targetTrailNode = this.findTrailNodeForDeclaration(member);
        if (targetTrailNode) {
          edges.push({ source: sourceTrailNode.id, target: targetTrailNode.id, type: 'override' });
        }
      }
    }
  }

  private deduplicateEdges(edges: TrailEdge[]): TrailEdge[] {
    const seen = new Set<string>();
    const result: TrailEdge[] = [];

    for (const edge of edges) {
      const key = `${edge.source}|${edge.target}|${edge.type}|${edge.importKind ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(edge);
      }
    }

    return result;
  }
}
