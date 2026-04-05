import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseMermaidC4, extractBoundaries } from '@anytime-markdown/c4-kernel/src/parser/mermaidC4';
import type { C4Model, BoundaryInfo } from '@anytime-markdown/c4-kernel/src/types';
import { buildC4Matrix, buildSourceMatrix, diffMatrix, detectCycles, clusterMatrix } from '@anytime-markdown/c4-kernel';
import type { DsmMapping, DsmMatrix } from '@anytime-markdown/c4-kernel';
import { analyze, trailToC4, toMermaid } from '@anytime-markdown/trail-core';
import type { TrailGraph } from '@anytime-markdown/trail-core';
import type { C4ElementsProvider } from '../providers/C4ElementsProvider';
import type { C4DataProvider, C4DataServer } from '../server/C4DataServer';

/**
 * C4モデルのデータ管理を担当するシングルトン。
 * Webview は持たず、C4DataServer 経由でスタンドアロンビューアにデータを配信する。
 */
export class C4Panel implements C4DataProvider {
  private static instance: C4Panel | undefined;
  private static treeProvider: C4ElementsProvider | undefined;
  private static dataServer: C4DataServer | undefined;

  private lastModel: C4Model | undefined;
  private lastBoundaries: readonly BoundaryInfo[] | undefined;
  private lastTrailGraph: TrailGraph | undefined;
  private lastProjectRoot: string | undefined;
  private lastDsmMapping: readonly DsmMapping[] = [];
  private lastC4Matrix: DsmMatrix | undefined;
  private lastSourceMatrix: DsmMatrix | undefined;
  private dsmLevel: 'component' | 'package' = 'component';
  private dsmMode: 'c4' | 'diff' = 'c4';

  private constructor() {}

  // -------------------------------------------------------------------------
  //  Static setup
  // -------------------------------------------------------------------------

  public static setDataServer(server: C4DataServer): void {
    C4Panel.dataServer = server;
  }

  public static setTreeProvider(provider: C4ElementsProvider): void {
    C4Panel.treeProvider = provider;
  }

  public static getDataProvider(): C4DataProvider | undefined {
    return C4Panel.getInstance();
  }

  private static getInstance(): C4Panel {
    C4Panel.instance ??= new C4Panel();
    return C4Panel.instance;
  }

  // -------------------------------------------------------------------------
  //  C4DataProvider interface
  // -------------------------------------------------------------------------

  public get model(): C4Model | undefined { return this.lastModel; }
  public get boundaries(): readonly BoundaryInfo[] | undefined { return this.lastBoundaries; }
  public get c4Matrix(): DsmMatrix | undefined { return this.lastC4Matrix; }
  public get sourceMatrix(): DsmMatrix | undefined { return this.lastSourceMatrix; }
  public get currentDsmLevel(): 'component' | 'package' { return this.dsmLevel; }
  public get currentDsmMode(): 'c4' | 'diff' { return this.dsmMode; }
  public get dsmMappings(): readonly DsmMapping[] { return this.lastDsmMapping; }

  public handleSetDsmLevel(level: 'component' | 'package'): void {
    this.dsmLevel = level;
    this.buildDsm();
  }

  public handleSetDsmMode(mode: 'c4' | 'diff'): void {
    this.dsmMode = mode;
    this.buildDsm();
  }

  public handleCluster(enabled: boolean): void {
    this.buildDsm(enabled);
  }

  public handleRefresh(): void {
    this.inferMapping();
    this.buildDsm();
  }

  // -------------------------------------------------------------------------
  //  Model persistence
  // -------------------------------------------------------------------------

  private static resolveModelPath(): string | null {
    const configured = vscode.workspace.getConfiguration('anytimeTrail.c4').get<string>('modelPath', '.vscode/c4-model.json');
    if (!configured) return null;
    if (path.isAbsolute(configured)) return configured;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return null;
    return path.join(root, configured);
  }

  private static saveModel(model: C4Model, boundaries: readonly BoundaryInfo[]): void {
    const filePath = C4Panel.resolveModelPath();
    if (!filePath) return;
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = { model, boundaries };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // 保存失敗は無視（権限エラー等）
    }
  }

  public static loadSavedModel(): { model: C4Model; boundaries: BoundaryInfo[] } | null {
    const filePath = C4Panel.resolveModelPath();
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data?.model?.elements && Array.isArray(data.model.elements)) {
        return { model: data.model, boundaries: data.boundaries ?? [] };
      }
    } catch {
      // パースエラーは無視
    }
    return null;
  }

  // -------------------------------------------------------------------------
  //  Commands
  // -------------------------------------------------------------------------

  /** Mermaid C4 ファイルをインポート */
  public static async importMermaid(): Promise<void> {
    const files = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: { 'Mermaid C4': ['mmd', 'mermaid', 'txt'] },
      title: 'Import Mermaid C4 Diagram',
    });
    if (!files?.[0]) return;

    const content = await vscode.workspace.fs.readFile(files[0]);
    const text = Buffer.from(content).toString('utf-8');

    try {
      const boundaries = extractBoundaries(text);
      const model = parseMermaidC4(text);

      const panel = C4Panel.getInstance();
      panel.lastTrailGraph = undefined;
      panel.setModel(model, boundaries);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Failed to parse Mermaid C4: ${msg}`);
    }
  }

  /** ワークスペースの TypeScript を trail-core で解析 */
  public static async analyzeWorkspace(): Promise<void> {
    const excludePatterns: readonly string[] = vscode.workspace.getConfiguration('anytimeTrail.c4').get<string[]>('analyzeExcludePatterns', ['.worktrees', '.vscode-test', '__tests__']);
    const allTsconfigFiles = await vscode.workspace.findFiles('**/tsconfig.json', '**/node_modules/**', 50);
    const tsconfigFiles = allTsconfigFiles.filter(f =>
      !excludePatterns.some(p => f.fsPath.includes(`/${p}/`)),
    );
    if (tsconfigFiles.length === 0) {
      vscode.window.showWarningMessage('No tsconfig.json found in workspace.');
      return;
    }

    let tsconfigPath: string;
    if (tsconfigFiles.length === 1) {
      tsconfigPath = tsconfigFiles[0].fsPath;
    } else {
      const picked = await vscode.window.showQuickPick(
        tsconfigFiles.map(f => ({ label: vscode.workspace.asRelativePath(f), uri: f })),
        { placeHolder: 'Select tsconfig.json to analyze' },
      );
      if (!picked) return;
      tsconfigPath = picked.uri.fsPath;
    }

    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Analyzing TypeScript for C4...' },
        async () => {
          const graph = analyze({ tsconfigPath });
          const model = trailToC4(graph);

          const panel = C4Panel.getInstance();
          panel.lastTrailGraph = graph;
          panel.lastProjectRoot = graph.metadata.projectRoot;
          panel.setModel(model);
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
      const channel = vscode.window.createOutputChannel('C4 Model');
      channel.appendLine(msg);
      channel.show();
      vscode.window.showErrorMessage(`C4 analysis failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** 解析データをエクスポート（形式選択） */
  public static async exportData(): Promise<void> {
    const panel = C4Panel.instance;
    if (!panel?.lastModel) {
      vscode.window.showWarningMessage('No C4 model to export. Run Import or Analyze first.');
      return;
    }

    const formats = [
      { label: 'JSON (C4 Model)', format: 'json' },
      { label: 'Mermaid (Module Dependencies)', format: 'mermaid' },
    ];
    const available = panel.lastTrailGraph ? formats : [formats[0]];

    const picked = available.length === 1
      ? available[0]
      : await vscode.window.showQuickPick(available, { placeHolder: 'Select export format' });
    if (!picked) return;

    if (picked.format === 'mermaid') {
      await C4Panel.exportMermaid(panel);
    } else {
      await C4Panel.exportJson(panel);
    }
  }

  private static async exportJson(panel: C4Panel): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      filters: { 'JSON': ['json'] },
      defaultUri: vscode.Uri.file('c4-model.json'),
      title: 'Export C4 Model',
    });
    if (!uri) return;

    const data = {
      model: panel.lastModel,
      boundaries: panel.lastBoundaries ?? [],
    };
    const content = Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
    await vscode.workspace.fs.writeFile(uri, content);
    vscode.window.showInformationMessage(`Exported to ${vscode.workspace.asRelativePath(uri)}`);
  }

  private static async exportMermaid(panel: C4Panel): Promise<void> {
    if (!panel.lastTrailGraph) return;

    const uri = await vscode.window.showSaveDialog({
      filters: { 'Mermaid': ['mmd'] },
      defaultUri: vscode.Uri.file('deps.mmd'),
      title: 'Export Mermaid Dependencies',
    });
    if (!uri) return;

    const mermaid = toMermaid(panel.lastTrailGraph);
    const content = Buffer.from(mermaid, 'utf-8');
    await vscode.workspace.fs.writeFile(uri, content);
    vscode.window.showInformationMessage(`Exported to ${vscode.workspace.asRelativePath(uri)}`);
  }

  // -------------------------------------------------------------------------
  //  Internal data management
  // -------------------------------------------------------------------------

  /** モデルを設定し、ツリー・保存・DSM・通知を更新 */
  private setModel(model: C4Model, boundaries?: readonly BoundaryInfo[]): void {
    this.lastModel = model;
    this.lastBoundaries = boundaries;
    C4Panel.treeProvider?.setModel(model, boundaries ?? []);
    C4Panel.saveModel(model, boundaries ?? []);
    this.inferMapping();
    this.buildDsm();
    C4Panel.dataServer?.notify('model-updated');
  }

  /** C4要素名とソースファイル名のマッチングで自動マッピングを推定 */
  private inferMapping(): void {
    if (!this.lastModel || !this.lastTrailGraph) {
      this.lastDsmMapping = [];
      return;
    }

    const fileNodes = this.lastTrailGraph.nodes.filter((n: { type: string }) => n.type === 'file');
    const mapping: DsmMapping[] = [];

    for (const element of this.lastModel.elements) {
      const elementName = element.name.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
      let bestMatch: { id: string; score: number } | null = null;

      for (const file of fileNodes) {
        const fileName = path.basename(file.filePath, path.extname(file.filePath))
          .toLowerCase().replaceAll(/[^a-z0-9]/g, '');
        if (fileName === elementName) {
          bestMatch = { id: file.id, score: 2 };
          break;
        }
        if (fileName.includes(elementName) || elementName.includes(fileName)) {
          if (!bestMatch || bestMatch.score < 1) {
            bestMatch = { id: file.id, score: 1 };
          }
        }
      }

      if (bestMatch) {
        mapping.push({ c4ElementId: element.id, sourcePath: bestMatch.id });
      }
    }

    this.lastDsmMapping = mapping;
  }

  /** DSM データをビルドしてデータサーバーに通知 */
  private buildDsm(cluster = false): void {
    if (!this.lastModel) return;

    try {
      let c4Matrix = buildC4Matrix(this.lastModel, this.dsmLevel, this.lastBoundaries ?? undefined);
      if (cluster) {
        c4Matrix = clusterMatrix(c4Matrix);
      }
      this.lastC4Matrix = c4Matrix;

      if (this.dsmMode === 'diff' && this.lastTrailGraph) {
        const sourceMatrix = buildSourceMatrix(this.lastTrailGraph, this.dsmLevel);
        this.lastSourceMatrix = sourceMatrix;
        diffMatrix(c4Matrix, sourceMatrix, this.lastDsmMapping);
      }
      C4Panel.dataServer?.notify('dsm-updated');
    } catch {
      // DSM build failure is non-critical
    }
  }
}
