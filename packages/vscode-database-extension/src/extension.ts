import * as vscode from "vscode";
import { AnytimeDatabaseEditorProvider } from "./providers/AnytimeDatabaseEditorProvider";
import { AnytimeDatabaseLogger } from "./logger";

// VSIX 配布時、better-sqlite3 とその依存 (bindings / file-uri-to-path) は
// webpack の CopyPlugin により dist/node_modules/ 以下に配置されるため、
// extension.js (dist/extension.js) からの標準 require 解決で hit する。

export function activate(context: vscode.ExtensionContext): void {
  const logger = new AnytimeDatabaseLogger("Anytime Database");
  const provider = new AnytimeDatabaseEditorProvider(context, logger);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      "anytimeDatabase.sqlite",
      provider,
      { supportsMultipleEditorsPerDocument: false },
    ),
    logger,
  );
}

export function deactivate(): void {
  /* no-op */
}
