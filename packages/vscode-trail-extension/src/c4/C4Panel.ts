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

export class C4Panel {
  public static readonly viewType = 'anytimeTrail.c4View';
  private static currentPanel: C4Panel | undefined;
  private static treeProvider: C4ElementsProvider | undefined;
  private lastModel: C4Model | undefined;
  private lastBoundaries: readonly BoundaryInfo[] | undefined;
  private lastTrailGraph: TrailGraph | undefined;
  private lastProjectRoot: string | undefined;
  private lastDsmMapping: readonly DsmMapping[] = [];
  private lastC4Matrix: DsmMatrix | undefined;
  private lastSourceMatrix: DsmMatrix | undefined;
  private dsmLevel: 'component' | 'package' = 'component';
  private dsmMode: 'c4' | 'diff' = 'c4';

  /** ツリービュープロバイダーを設定 */
  public static setTreeProvider(provider: C4ElementsProvider): void {
    C4Panel.treeProvider = provider;
  }

  /** 設定パスを絶対パスに解決する。ワークスペースなし or 空なら null */
  private static resolveModelPath(): string | null {
    const configured = vscode.workspace.getConfiguration('anytimeTrail.c4').get<string>('modelPath', '.vscode/c4-model.json');
    if (!configured) return null;
    if (path.isAbsolute(configured)) return configured;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return null;
    return path.join(root, configured);
  }

  /** 解析結果を設定パスに自動保存 */
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

  /** 保存済みモデルを読み込む（ファイルなし or パースエラーなら null） */
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

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.panel.onDidDispose(() => {
      C4Panel.currentPanel = undefined;
      C4Panel.treeProvider?.clear();
    });

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'setLevel' && typeof msg.level === 'number') {
        C4Panel.treeProvider?.setLevel(msg.level);
        return;
      }
      if (msg.type === 'openFile' && typeof msg.relativePath === 'string' && this.lastProjectRoot) {
        const path = await import('node:path');
        const absolutePath = path.join(this.lastProjectRoot, msg.relativePath);
        const uri = vscode.Uri.file(absolutePath);
        try {
          await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.One });
        } catch {
          vscode.window.showWarningMessage(`File not found: ${msg.relativePath}`);
        }
      }
      if (msg.type === 'dsmSetLevel') {
        this.dsmLevel = msg.level as 'component' | 'package';
        this.sendDsm();
      }
      if (msg.type === 'dsmSetMode') {
        this.dsmMode = msg.mode as 'c4' | 'diff';
        this.sendDsm();
      }
      if (msg.type === 'dsmCluster') {
        this.sendDsm(true);
      }
      if (msg.type === 'dsmRefresh') {
        this.inferMapping();
        this.sendDsm();
      }
    });
  }

  /** 変更ファイルのハイライトを Webview に送信 */
  public static highlightFiles(relativePaths: readonly string[]): void {
    const panel = C4Panel.currentPanel;
    if (!panel) return;
    panel.panel.webview.postMessage({
      type: 'highlightFiles',
      relativePaths,
    });
  }

  /** 解析データをエクスポート（形式選択） */
  public static async exportData(): Promise<void> {
    const panel = C4Panel.currentPanel;
    if (!panel?.lastModel) {
      vscode.window.showWarningMessage('No C4 model to export. Run Import or Analyze first.');
      return;
    }

    const formats = [
      { label: 'JSON (C4 Model)', format: 'json' },
      { label: 'Mermaid (Module Dependencies)', format: 'mermaid' },
    ];
    // Mermaid は trail-core 解析結果がある場合のみ
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

  /** Mermaid C4 ファイルをインポートして表示 */
  public static async importMermaid(extensionUri: vscode.Uri): Promise<void> {
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

      const panel = C4Panel.getOrCreatePanel(extensionUri, `C4: ${model.title ?? 'Diagram'}`);
      panel.lastTrailGraph = undefined;
      panel.postModel(model, boundaries);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Failed to parse Mermaid C4: ${msg}`);
    }
  }

  /** DSMタブを直接開く */
  public static showDsm(extensionUri: vscode.Uri): void {
    const panel = C4Panel.getOrCreatePanel(extensionUri, 'DSM');
    panel.panel.webview.postMessage({ type: 'switchTab', tab: 'dsm' });
  }

  /** ワークスペースの TypeScript を trail-core で解析して C4 表示 */
  public static async analyzeWorkspace(extensionUri: vscode.Uri): Promise<void> {
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

          const panel = C4Panel.getOrCreatePanel(extensionUri, 'C4: Project Analysis');
          panel.lastTrailGraph = graph;
          panel.lastProjectRoot = graph.metadata.projectRoot;
          panel.postModel(model);
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

  private static getOrCreatePanel(extensionUri: vscode.Uri, title: string): C4Panel {
    if (C4Panel.currentPanel) {
      C4Panel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      C4Panel.currentPanel.panel.title = title;
      return C4Panel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      C4Panel.viewType,
      title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );

    C4Panel.currentPanel = new C4Panel(panel, extensionUri);
    panel.webview.html = C4Panel.currentPanel.getHtml();
    return C4Panel.currentPanel;
  }

  /** C4Model と境界情報を webview に送信（webview 側で GraphDocument に変換） */
  private postModel(model: C4Model, boundaries?: readonly BoundaryInfo[]): void {
    this.lastModel = model;
    this.lastBoundaries = boundaries;
    this.panel.webview.postMessage({
      type: 'loadModel',
      model,
      boundaries: boundaries ?? [],
    });
    C4Panel.treeProvider?.setModel(model, boundaries ?? []);
    C4Panel.saveModel(model, boundaries ?? []);
    this.inferMapping();
    this.sendDsm();
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

  /** DSM データをビルドして webview に送信 */
  private sendDsm(cluster = false): void {
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

        const diff = diffMatrix(c4Matrix, sourceMatrix, this.lastDsmMapping);
        const nodeIds = c4Matrix.nodes.map(n => n.id);
        const sccs = detectCycles(c4Matrix.adjacency, nodeIds);
        const cyclicPairs = sccs.flatMap(scc => {
          const pairs: { nodeA: string; nodeB: string }[] = [];
          for (let i = 0; i < scc.length; i++) {
            for (let j = i + 1; j < scc.length; j++) {
              pairs.push({ nodeA: scc[i], nodeB: scc[j] });
            }
          }
          return pairs;
        });

        this.panel.webview.postMessage({
          type: 'loadDsmDiff',
          diff,
          cyclicPairs,
        });
      } else {
        this.panel.webview.postMessage({
          type: 'loadDsmMatrix',
          matrix: c4Matrix,
        });
      }
    } catch {
      // DSM build failure is non-critical
    }
  }

  private getHtml(): string {
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'c4webview.js'),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>C4 Model</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { background: #1e1e1e; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, sans-serif; height: 100%; }
    #tab-bar {
      position: fixed; top: 0; left: 0; right: 0;
      background: #252526; border-bottom: 1px solid #3c3c3c;
      padding: 0 8px; z-index: 20;
      display: flex; align-items: stretch; height: 30px;
      font-size: 12px; color: #cccccc;
    }
    .tab-btn {
      background: transparent; color: #888; border: none; border-bottom: 2px solid transparent;
      padding: 0 12px; cursor: pointer; font-size: 12px;
    }
    .tab-btn:hover { color: #cccccc; }
    .tab-btn.active { color: #ffffff; border-bottom-color: #0e639c; }
    #toolbar, #dsm-toolbar {
      position: fixed; left: 0; right: 0;
      background: #252526; border-bottom: 1px solid #3c3c3c;
      padding: 4px 8px; z-index: 10;
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: #cccccc;
      top: 30px;
    }
    #toolbar button, #dsm-toolbar button {
      background: #3c3c3c; color: #cccccc; border: 1px solid #555;
      padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;
    }
    #toolbar button:hover, #dsm-toolbar button:hover { background: #4c4c4c; }
    #toolbar button.active, #dsm-toolbar button.active { background: #0e639c; border-color: #1177bb; color: #ffffff; }
    #toolbar .sep, #dsm-toolbar .sep { color: #555; margin: 0 2px; }
    #info { color: #888; font-size: 11px; margin-left: auto; }
    #dsm-info { color: #888; font-size: 11px; margin-left: auto; }
    #dsm-toolbar { display: none; }
    #c4-view { margin-top: 60px; }
    #c4-canvas {
      width: 100vw; height: calc(100vh - 60px);
      display: block; cursor: grab;
    }
    #dsm-view { margin-top: 60px; display: none; }
    #dsm-canvas {
      width: 100vw; height: calc(100vh - 60px);
      display: block; cursor: grab;
    }
  </style>
</head>
<body>
  <div id="tab-bar">
    <button class="tab-btn active" data-tab="c4">C4 Model</button>
    <button class="tab-btn" data-tab="dsm">DSM</button>
  </div>
  <div id="toolbar">
    <span style="font-weight:600;">C4 Model</span>
    <span class="sep">|</span>
    <button class="level-btn active" data-level="1">L1</button>
    <button class="level-btn" data-level="2">L2</button>
    <button class="level-btn" data-level="3">L3</button>
    <button class="level-btn active" data-level="4">L4</button>
    <span class="sep">|</span>
    <button id="btn-fit">Fit</button>
    <span id="info">Loading...</span>
  </div>
  <div id="dsm-toolbar">
    <span style="font-weight:600;">DSM</span>
    <span class="sep">|</span>
    <button class="dsm-level-btn active" data-dsm-level="component">Component</button>
    <button class="dsm-level-btn" data-dsm-level="package">Package</button>
    <span class="sep">|</span>
    <button class="dsm-mode-btn active" data-dsm-mode="c4">C4 Only</button>
    <button class="dsm-mode-btn" data-dsm-mode="diff">Diff</button>
    <span class="sep">|</span>
    <button id="btn-dsm-cluster">Cluster</button>
    <button id="btn-dsm-refresh">Refresh</button>
    <span id="dsm-info">No data</span>
  </div>
  <div id="c4-view">
    <canvas id="c4-canvas"></canvas>
  </div>
  <div id="dsm-view">
    <canvas id="dsm-canvas"></canvas>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
