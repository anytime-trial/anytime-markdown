import * as path from "node:path";
import * as vscode from "vscode";
import {
  TrailDatabase,
  SupabaseTrailStore,
  SyncService,
} from "@anytime-markdown/trail-db";
import { FileBackupManager } from "@anytime-markdown/database-core/FileBackupManager";
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
  // storagePath は trail 拡張が書き込む既定パス (.anytime/trail/db) 設定を共有する。
  const dbStorageConfig = vscode.workspace.getConfiguration("anytimeTrail.database");
  const dbStoragePathSetting = dbStorageConfig.get<string>("storagePath", ".anytime/trail/db") || ".anytime/trail/db";
  const wsRootForDb = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const dbStorageDir = path.isAbsolute(dbStoragePathSetting)
    ? dbStoragePathSetting
    : wsRootForDb ? path.join(wsRootForDb, dbStoragePathSetting) : undefined;

  // バックアップ設定は本拡張が所有する (anytimeDatabase.backup.*)。
  // ただし FileTrailStorage 内蔵のバックアップトリガは trail 拡張のみに集約するため、
  // ここでは TrailDatabase に backupGenerations=0 を渡しトリガを抑止する。
  // 一覧 / 復元用には別途 FileBackupManager を実値で立てる。
  const backupConfig = vscode.workspace.getConfiguration("anytimeDatabase.backup");
  const backupGenerations = backupConfig.get<number>("generations", 1);
  const backupIntervalDays = backupConfig.get<number>("intervalDays", 1);

  const trailDb = new TrailDatabase(extensionDistPath, dbStorageDir, 0, DbLogger);

  // dbStorageDir 未解決 (ワークスペース未オープン) の場合は backup 機能を無効化する。
  const backupManager: FileBackupManager | null = dbStorageDir
    ? new FileBackupManager(
        path.join(dbStorageDir, "trail.db"),
        backupGenerations,
        backupIntervalDays,
      )
    : null;

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

  const databaseProvider = new DatabaseProvider(backupManager, remoteProvider, supabaseStore);
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

  // Trail DB バックアップ復元 (旧 anytime-trail.restoreBackup を移管)
  context.subscriptions.push(
    vscode.commands.registerCommand("anytimeDatabase.restoreBackup", async (arg?: number) => {
      if (!backupManager) {
        vscode.window.showErrorMessage(vscode.l10n.t("Trail DB is not initialized."));
        return;
      }
      const entries = backupManager.listBackups();
      if (entries.length === 0) {
        vscode.window.showInformationMessage(
          vscode.l10n.t("No backups available yet. Backups are created on the first save of each VS Code session."),
        );
        return;
      }
      let generation: number | undefined = typeof arg === "number" ? arg : undefined;
      if (generation === undefined) {
        const items = entries.map((e) => ({
          label: `$(history) ${vscode.l10n.t("Generation {0}", e.generation)}`,
          description: e.mtime.toLocaleString(),
          detail: `${(e.compressedSize / 1024 / 1024).toFixed(2)} MB (gzip) · ${e.path}`,
          generation: e.generation,
        }));
        const picked = await vscode.window.showQuickPick(items, {
          title: vscode.l10n.t("Restore Trail DB from backup"),
          placeHolder: vscode.l10n.t("Select a generation to restore (current DB will be saved as .restore-safety-*)"),
          ignoreFocusOut: true,
        });
        if (!picked) return;
        generation = picked.generation;
      }
      if (!entries.some((e) => e.generation === generation)) {
        vscode.window.showErrorMessage(vscode.l10n.t("Backup generation {0} not found.", generation));
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        vscode.l10n.t(
          "Restore Trail DB from generation {0}? The current DB will be backed up to a .restore-safety-* file. You must reload the VS Code window after restore for changes to take effect.",
          generation,
        ),
        { modal: true },
        vscode.l10n.t("Restore"),
      );
      if (confirm !== vscode.l10n.t("Restore")) return;
      try {
        const result = backupManager.restoreFromBackup(generation);
        DbLogger.info(
          `Trail DB restored from ${result.restoredFrom}; safety copy at ${result.safetyCopy ?? "(none)"}`,
        );
        databaseProvider.refresh();
        const reload = await vscode.window.showInformationMessage(
          vscode.l10n.t("Restored from generation {0}. Reload the window now?", generation),
          vscode.l10n.t("Reload Window"),
        );
        if (reload === vscode.l10n.t("Reload Window")) {
          await vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      } catch (err) {
        DbLogger.error("Trail DB restore failed", err);
        vscode.window.showErrorMessage(
          vscode.l10n.t("Restore failed: {0}", err instanceof Error ? err.message : String(err)),
        );
      }
    }),
  );

  context.subscriptions.push(databaseTreeView);
}

export function deactivate(): void {
  DbLogger.dispose();
}
