import * as path from "node:path";
import * as vscode from "vscode";
import { AnytimeDatabaseEditorProvider } from "./providers/AnytimeDatabaseEditorProvider";
import { AnytimeDatabaseLogger } from "./logger";

// VSIX 配布時、better_sqlite3.node は dist/native/ に同梱される。
// 実行時に require パスを通して `require('better-sqlite3')` を解決可能にする。
const sqliteNativePath = path.join(__dirname, "native");
process.env.NODE_PATH =
  (process.env.NODE_PATH || "") + path.delimiter + sqliteNativePath;
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("module")._initPaths();

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
