import * as vscode from 'vscode';
import { parseMermaidC4, extractBoundaries } from '@anytime-markdown/c4-kernel/src/parser/mermaidC4';
import type { C4Model, BoundaryInfo } from '@anytime-markdown/c4-kernel/src/types';
import { analyze, trailToC4, toMermaid } from '@anytime-markdown/trail-core';
import type { TrailGraph } from '@anytime-markdown/trail-core';

export class C4Panel {
  public static readonly viewType = 'anytimeTrail.c4View';
  private static currentPanel: C4Panel | undefined;
  private lastModel: C4Model | undefined;
  private lastBoundaries: readonly BoundaryInfo[] | undefined;
  private lastTrailGraph: TrailGraph | undefined;
  private lastProjectRoot: string | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.panel.onDidDispose(() => {
      C4Panel.currentPanel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (msg) => {
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

  /** ワークスペースの TypeScript を trail-core で解析して C4 表示 */
  public static async analyzeWorkspace(extensionUri: vscode.Uri): Promise<void> {
    const allTsconfigFiles = await vscode.workspace.findFiles('**/tsconfig.json', '**/node_modules/**', 50);
    const tsconfigFiles = allTsconfigFiles.filter(f =>
      !f.fsPath.includes('/.worktrees/') && !f.fsPath.includes('/.vscode-test/'),
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
    #toolbar {
      position: fixed; top: 0; left: 0; right: 0;
      background: #252526; border-bottom: 1px solid #3c3c3c;
      padding: 4px 8px; z-index: 10;
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: #cccccc;
    }
    #toolbar button {
      background: #3c3c3c; color: #cccccc; border: 1px solid #555;
      padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;
    }
    #toolbar button:hover { background: #4c4c4c; }
    #toolbar button.active { background: #0e639c; border-color: #1177bb; color: #ffffff; }
    #toolbar .sep { color: #555; margin: 0 2px; }
    #info { color: #888; font-size: 11px; margin-left: auto; }
    #c4-canvas {
      width: 100vw; height: calc(100vh - 30px); margin-top: 30px;
      display: block; cursor: grab;
    }
  </style>
</head>
<body>
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
  <canvas id="c4-canvas"></canvas>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
