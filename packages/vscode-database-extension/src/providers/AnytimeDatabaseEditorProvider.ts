import * as fs from "node:fs";
import * as vscode from "vscode";
import { BetterSqlite3Adapter } from "@anytime-markdown/database-core/BetterSqlite3Adapter";
import { setupIpcBridge } from "../ipcBridge";
import { AnytimeDatabaseLogger } from "../logger";
import { DatabaseDocument } from "./DatabaseDocument";

export class AnytimeDatabaseEditorProvider
  implements vscode.CustomEditorProvider<DatabaseDocument>
{
  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<DatabaseDocument>
  >();
  readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: AnytimeDatabaseLogger,
  ) {}

  async openCustomDocument(uri: vscode.Uri): Promise<DatabaseDocument> {
    const config = vscode.workspace.getConfiguration("anytimeDatabase");
    const openMode = config.get<"readwrite" | "readonly">("openMode", "readwrite");
    if (!fs.existsSync(uri.fsPath)) {
      throw new Error(`file not found: ${uri.fsPath}`);
    }
    const adapter = new BetterSqlite3Adapter({
      filePath: uri.fsPath,
      openMode,
    });
    this.logger.info(`opened ${uri.fsPath} mode=${openMode}`);
    return new DatabaseDocument(uri, adapter);
  }

  async resolveCustomEditor(
    document: DatabaseDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    panel.webview.html = await this.buildHtml(panel.webview);

    const subs: vscode.Disposable[] = [];
    subs.push(
      setupIpcBridge(panel, document.adapter, () => {
        document.markDirty();
        this._onDidChangeCustomDocument.fire({
          document,
          label: "edit",
          undo: async () => {
            /* revert via custom command */
          },
          redo: async () => {
            /* no-op */
          },
        });
      }),
    );

    const config = vscode.workspace.getConfiguration("anytimeDatabase");
    const queryMaxRows = config.get<number>("query.maxRows", 1000);
    const openMode = config.get<"readwrite" | "readonly">("openMode", "readwrite");

    const schema = await document.adapter.listSchema();
    void panel.webview.postMessage({
      type: "init",
      capabilities: document.adapter.capabilities,
      schema,
      config: { queryMaxRows, openMode, fileName: document.uri.fsPath },
    });

    subs.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("anytimeDatabase.query.maxRows")) {
          const v = vscode.workspace
            .getConfiguration("anytimeDatabase")
            .get<number>("query.maxRows", 1000);
          void panel.webview.postMessage({
            type: "configChanged",
            config: { queryMaxRows: v },
          });
        }
      }),
    );

    panel.onDidDispose(() => subs.forEach((s) => s.dispose()));
  }

  async saveCustomDocument(document: DatabaseDocument): Promise<void> {
    await document.adapter.save();
    document.markClean();
    this.logger.info(`saved ${document.uri.fsPath}`);
  }

  async saveCustomDocumentAs(
    _document: DatabaseDocument,
    _destination: vscode.Uri,
  ): Promise<void> {
    throw new Error("Save As is not supported in v1");
  }

  async revertCustomDocument(document: DatabaseDocument): Promise<void> {
    await document.adapter.revert();
    document.markClean();
  }

  async backupCustomDocument(): Promise<vscode.CustomDocumentBackup> {
    return { id: "noop", delete: () => {} };
  }

  private async buildHtml(webview: vscode.Webview): Promise<string> {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js"),
    );
    const nonce = makeNonce();
    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' ${webview.cspSource}; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
<title>Anytime Database</title>
</head><body>
<div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body></html>`;
  }
}

function makeNonce(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}
