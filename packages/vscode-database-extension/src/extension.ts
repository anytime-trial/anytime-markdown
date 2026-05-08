import * as path from "node:path";
import * as vscode from "vscode";
import {
  TrailDatabase,
  SupabaseTrailStore,
  SyncService,
} from "@anytime-markdown/trail-db";
import { AnytimeDatabaseEditorProvider } from "./providers/AnytimeDatabaseEditorProvider";
import { DatabaseProvider } from "./providers/DatabaseProvider";
import { AnytimeDatabaseLogger } from "./logger";
import { DbLogger } from "./utils/DbLogger";

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
      {
        supportsMultipleEditorsPerDocument: false,
        // タブ切替時に WebView を破棄せず状態保持。これがないと別のタブに移動して
        // 戻った時に webview の React state が初期化され "Loading database..." に戻る。
        webviewOptions: { retainContextWhenHidden: true },
      },
    ),
    logger,
  );

  // --- Activity Bar: Database panel ---
  const extensionDistPath = context.extensionPath
    ? path.join(context.extensionPath, "dist")
    : "";
  const dbConfig = vscode.workspace.getConfiguration("anytimeTrail.database");
  const dbStoragePathSetting = dbConfig.get<string>("storagePath", "");
  const wsRootForDb = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const dbStorageDir = path.isAbsolute(dbStoragePathSetting)
    ? dbStoragePathSetting
    : wsRootForDb ? path.join(wsRootForDb, dbStoragePathSetting) : undefined;
  const backupGenerations = dbConfig.get<number>("backupGenerations", 1);
  const trailDb = new TrailDatabase(extensionDistPath, dbStorageDir, backupGenerations, DbLogger);

  const remoteConfig = vscode.workspace.getConfiguration("anytimeTrail.remote");
  const remoteProvider = remoteConfig.get<"none" | "supabase" | "postgres">("provider", "none");

  let supabaseStore: SupabaseTrailStore | undefined;
  if (remoteProvider === "supabase") {
    const url = remoteConfig.get<string>("supabaseUrl", "");
    const key = remoteConfig.get<string>("supabaseAnonKey", "");
    if (url && key) {
      supabaseStore = new SupabaseTrailStore(url, key, DbLogger);
    }
  }

  const databaseProvider = new DatabaseProvider(trailDb, remoteProvider, supabaseStore);
  const databaseTreeView = vscode.window.createTreeView("anytimeDatabase.database", {
    treeDataProvider: databaseProvider,
  });

  void trailDb.init().then(() => {
    databaseProvider.updateSqliteStatus("Ready", trailDb.getLastImportedAt());
  }).catch((err: unknown) => {
    DbLogger.error("Failed to initialize trail database", err);
    databaseProvider.updateSqliteStatus("Error");
  });

  // Supabase 同期
  context.subscriptions.push(
    vscode.commands.registerCommand("anytime-database.syncToSupabase", async () => {
      if (!supabaseStore || !trailDb) {
        vscode.window.showErrorMessage("Supabase が設定されていません");
        return;
      }
      databaseProvider.setSyncing(true);
      databaseProvider.updateRemoteStatus("Syncing...");
      try {
        const syncService = new SyncService(trailDb, supabaseStore, DbLogger);
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Trail: Syncing to Supabase",
            cancellable: false,
          },
          async (progress) => {
            const result = await syncService.sync(({ message, increment }) => {
              progress.report({ message, increment });
              DbLogger.info(`Trail Supabase sync: ${message}`);
            });
            databaseProvider.updateRemoteStatus("Connected", new Date().toISOString());
            vscode.window.showInformationMessage(
              `Trail sync complete: ${result.synced} synced, ${result.skipped} up-to-date, ${result.errors} errors`,
            );
          },
        );
      } catch (err) {
        DbLogger.error("Trail Supabase sync failed", err);
        databaseProvider.updateRemoteStatus("Error");
        vscode.window.showErrorMessage("Trail Supabase sync failed");
      } finally {
        databaseProvider.setSyncing(false);
      }
    }),
  );

  // Supabase 再接続
  context.subscriptions.push(
    vscode.commands.registerCommand("anytime-database.reconnectSupabase", async () => {
      const cfg = vscode.workspace.getConfiguration("anytimeTrail.remote");
      const url = cfg.get<string>("supabaseUrl", "");
      const key = cfg.get<string>("supabaseAnonKey", "");
      if (!url || !key) {
        vscode.window.showWarningMessage("Supabase URL and anon key are required.");
        return;
      }
      supabaseStore = new SupabaseTrailStore(url, key, DbLogger);
      databaseProvider.updateRemoteStatus("Reconnected");
      vscode.window.showInformationMessage("Supabase reconnected.");
    }),
  );

  context.subscriptions.push(databaseTreeView);
}

export function deactivate(): void {
  DbLogger.dispose();
}
