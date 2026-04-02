import * as vscode from 'vscode';
import { analyze } from '@anytime-markdown/trail-core';
import { toCytoscape } from '@anytime-markdown/trail-core';
import { getTrailStylesheet } from '@anytime-markdown/trail-core';

export class TrailPanel {
  public static readonly viewType = 'anytimeGraph.trailView';
  private static currentPanel: TrailPanel | undefined;
  private static lastResult: { elements: unknown[]; stylesheet: unknown[]; metadata: unknown } | undefined;

  public static getLastResult() {
    return TrailPanel.lastResult;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
  ) {
    const editorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) return;
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      this.panel.webview.postMessage({ type: 'highlightFile', filePath });
    });

    this.panel.onDidDispose(() => {
      editorListener.dispose();
      TrailPanel.currentPanel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'openFile') {
        const uri = vscode.Uri.file(message.filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const line = Math.max(0, (message.line ?? 1) - 1);
        const range = new vscode.Range(line, 0, line, 0);
        await vscode.window.showTextDocument(doc, {
          selection: range,
          preserveFocus: false,
        });
      }
    });
  }

  public static async create(
    extensionUri: vscode.Uri,
    tsconfigPath: string,
  ): Promise<void> {
    const column = vscode.ViewColumn.Beside;

    if (TrailPanel.currentPanel) {
      TrailPanel.currentPanel.panel.reveal(column);
      TrailPanel.currentPanel.runAnalysis(tsconfigPath);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      TrailPanel.viewType,
      'Trail: TypeScript Analysis',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    TrailPanel.currentPanel = new TrailPanel(panel, extensionUri);
    panel.webview.html = TrailPanel.getHtml();
    TrailPanel.currentPanel.runAnalysis(tsconfigPath);
  }

  private runAnalysis(tsconfigPath: string): void {
    try {
      const graph = analyze({ tsconfigPath });
      const elements = toCytoscape(graph, { bundleEdges: true });
      const stylesheet = getTrailStylesheet();

      TrailPanel.lastResult = { elements, stylesheet, metadata: graph.metadata };

      this.panel.webview.postMessage({
        type: 'load',
        elements,
        stylesheet,
        metadata: graph.metadata,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Trail analysis failed: ${msg}`);
    }
  }

  private static getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trail View</title>
  <script src="https://unpkg.com/cytoscape@3.30.4/dist/cytoscape.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #282a36; overflow: hidden; }
    #toolbar {
      position: fixed; top: 0; left: 0; right: 0;
      background: #282a36; border-bottom: 1px solid #44475a;
      padding: 6px 8px; z-index: 10;
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      font-family: monospace; font-size: 12px; color: #f8f8f2;
    }
    #toolbar select { background: #44475a; color: #f8f8f2; border: 1px solid #6272a4; padding: 2px 4px; border-radius: 3px; }
    #toolbar label { cursor: pointer; white-space: nowrap; }
    #toolbar .sep { color: #6272a4; }
    #cy { width: 100vw; height: calc(100vh - 36px); margin-top: 36px; }
    #info {
      position: fixed; top: 44px; left: 8px;
      color: #f8f8f2; font-family: monospace; font-size: 12px;
      background: rgba(40,42,54,0.9); padding: 4px 8px; border-radius: 4px;
      pointer-events: none; z-index: 10;
    }
    #tooltip {
      position: fixed; display: none;
      color: #f8f8f2; font-family: monospace; font-size: 11px;
      background: rgba(68,71,90,0.95); padding: 4px 8px; border-radius: 3px;
      pointer-events: none; z-index: 20;
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <select id="layout-select">
      <option value="cose">CoSE</option>
      <option value="breadthfirst">Breadthfirst</option>
      <option value="circle">Circle</option>
      <option value="concentric">Concentric</option>
      <option value="grid">Grid</option>
    </select>
    <span class="sep">|</span>
    <label><input type="checkbox" class="node-filter" data-type="file" checked> file</label>
    <label><input type="checkbox" class="node-filter" data-type="class" checked> class</label>
    <label><input type="checkbox" class="node-filter" data-type="interface" checked> interface</label>
    <label><input type="checkbox" class="node-filter" data-type="function" checked> function</label>
    <label><input type="checkbox" class="node-filter" data-type="variable" checked> variable</label>
    <label><input type="checkbox" class="node-filter" data-type="type" checked> type</label>
    <label><input type="checkbox" class="node-filter" data-type="enum" checked> enum</label>
  </div>
  <div id="info">Analyzing...</div>
  <div id="tooltip"></div>
  <div id="cy"></div>
  <script>
    const vscode = acquireVsCodeApi();
    let cy = null;

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'load') {
        initGraph(msg.elements, msg.stylesheet, msg.metadata);
      }
      if (msg.type === 'highlightFile') {
        highlightFileNodes(msg.filePath);
      }
    });

    function highlightFileNodes(filePath) {
      if (!cy) return;
      cy.elements().removeClass('editor-active');
      cy.nodes().forEach(function(node) {
        var fp = node.data('filePath');
        if (fp && filePath.endsWith(fp)) {
          node.addClass('editor-active');
        }
      });
    }

    function initGraph(elements, stylesheet, metadata) {
      if (cy) { cy.destroy(); }

      const cyStylesheet = stylesheet.map(s => ({
        selector: s.selector,
        style: s.style,
      }));

      cyStylesheet.push({
        selector: '.editor-active',
        style: { 'border-width': 4, 'border-color': '#50fa7b' },
      });

      cy = cytoscape({
        container: document.getElementById('cy'),
        elements: elements,
        style: cyStylesheet,
        layout: { name: 'cose', animate: false, nodeRepulsion: 8000, idealEdgeLength: 80 },
      });

      // Layout switch
      document.getElementById('layout-select').addEventListener('change', function(e) {
        if (!cy) return;
        cy.layout({ name: e.target.value, animate: true, animationDuration: 500 }).run();
      });

      // Node type filter
      document.querySelectorAll('.node-filter').forEach(function(cb) {
        cb.addEventListener('change', function() {
          if (!cy) return;
          var type = cb.dataset.type;
          if (cb.checked) {
            cy.nodes('[type="' + type + '"]').show();
          } else {
            cy.nodes('[type="' + type + '"]').hide();
          }
        });
      });

      document.getElementById('info').textContent =
        metadata.fileCount + ' files | ' +
        elements.filter(e => !e.data.source).length + ' nodes | ' +
        elements.filter(e => e.data.source).length + ' edges';

      // Click -> open file in editor
      cy.on('tap', 'node', (evt) => {
        const data = evt.target.data();
        if (data.filePath && data.line) {
          const fullPath = metadata.projectRoot + '/' + data.filePath;
          vscode.postMessage({ type: 'openFile', filePath: fullPath, line: data.line });
        }
      });

      // Hover tooltip
      const tooltip = document.getElementById('tooltip');
      cy.on('mouseover', 'node', (evt) => {
        const d = evt.target.data();
        tooltip.textContent = d.filePath + ':' + d.line + ' (' + d.type + ')';
        tooltip.style.display = 'block';
      });
      cy.on('mouseout', 'node', () => {
        tooltip.style.display = 'none';
      });
      cy.on('mousemove', (evt) => {
        tooltip.style.left = evt.originalEvent.clientX + 12 + 'px';
        tooltip.style.top = evt.originalEvent.clientY + 12 + 'px';
      });
    }
  </script>
</body>
</html>`;
  }
}
