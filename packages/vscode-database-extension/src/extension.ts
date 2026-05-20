import * as path from "node:path";
import * as vscode from "vscode";
import {
  TrailDatabase,
  SupabaseTrailStore,
  SyncService,
} from "@anytime-markdown/trail-db";
import { FileBackupManager } from "@anytime-markdown/database-core/FileBackupManager";
import { AnytimeDatabaseEditorProvider } from "./providers/AnytimeDatabaseEditorProvider";
import { DatabaseProvider, BackupTreeItem, type DbFile } from "./providers/DatabaseProvider";
import {
  S3BackupUploader,
  S3ConfigError,
  BackupNotFoundError,
  S3UploadError,
  type S3Config,
} from "./utils/S3BackupUploader";
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
    // 書き込み (upsert/delete) には service_role キーを使う。RLS により anon キーは読み取り専用のため。
    const serviceRoleKey = remoteConfig.get<string>("supabaseServiceRoleKey", "");
    if (url && serviceRoleKey) {
      supabaseStore = new SupabaseTrailStore(url, serviceRoleKey, DbLogger);
    } else if (url) {
      DbLogger.warn(
        "Supabase remote enabled but anytimeTrail.remote.supabaseServiceRoleKey is not set. " +
          "Sync writes require the service_role key (the anon key is read-only under RLS).",
      );
    }
  }

  const trailDbPath = dbStorageDir ? path.join(dbStorageDir, "trail.db") : null;
  const databaseProvider = new DatabaseProvider(
    backupManager,
    trailDbPath,
    dbStorageDir ?? null,
    backupGenerations,
    backupIntervalDays,
    remoteProvider,
    supabaseStore,
  );
  const databaseTreeView = vscode.window.createTreeView("anytimeDatabase.database", {
    treeDataProvider: databaseProvider,
  });

  // ワークスペース内の DB ファイルを列挙して TreeView に反映する。
  // storagePath 配下は「特別」(展開可能 + Backups 子要素)、配下外はフラット。
  const DB_GLOB = "**/*.{db,sqlite,sqlite3,db3}";
  const DB_EXCLUDE = "**/{node_modules,.git,dist,out,build,.next}/**";

  async function refreshDbFiles(): Promise<void> {
    const uris = await vscode.workspace.findFiles(DB_GLOB, DB_EXCLUDE);
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    const storageDirNorm = dbStorageDir ? path.resolve(dbStorageDir) : null;
    const trailDbPathNorm = trailDbPath ? path.resolve(trailDbPath) : null;
    const files: DbFile[] = uris
      .map((uri) => {
        const fsPath = path.resolve(uri.fsPath);
        const relPath = wsRoot ? path.relative(wsRoot, fsPath) : fsPath;
        const isManaged = storageDirNorm ? isPathInside(fsPath, storageDirNorm) : false;
        const isTrailDb = trailDbPathNorm !== null && fsPath === trailDbPathNorm;
        return { fsPath, relPath, isManaged, isTrailDb };
      })
      .sort((a, b) => {
        // managed → flat の順、その中はパスでソート
        if (a.isManaged !== b.isManaged) return a.isManaged ? -1 : 1;
        return a.relPath.localeCompare(b.relPath);
      });
    databaseProvider.setDbFiles(files);
  }

  const dbWatcher = vscode.workspace.createFileSystemWatcher(DB_GLOB);
  context.subscriptions.push(
    dbWatcher,
    dbWatcher.onDidCreate(() => void refreshDbFiles()),
    dbWatcher.onDidDelete(() => void refreshDbFiles()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refreshDbFiles()),
  );

  void refreshDbFiles();

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
      const serviceRoleKey = cfg.get<string>("supabaseServiceRoleKey", "");
      if (!url || !serviceRoleKey) {
        vscode.window.showWarningMessage(
          "Supabase URL and service_role key are required (the anon key is read-only under RLS).",
        );
        return;
      }
      supabaseStore = new SupabaseTrailStore(url, serviceRoleKey, DbLogger);
      databaseProvider.updateRemoteStatus("Reconnected");
      vscode.window.showInformationMessage("Supabase reconnected.");
    }),
  );

  // DB バックアップ復元: BackupTreeItem 経由（特定 DB の特定世代）またはコマンドパレット経由（trail.db フォールバック）
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "anytimeDatabase.restoreBackup",
      async (arg?: BackupTreeItem | number) => {
        // 対象 DB パスと世代を決定する
        let targetDbPath: string | null = null;
        let generation: number | undefined;
        if (arg instanceof BackupTreeItem) {
          targetDbPath = arg.dbPath;
          generation = arg.generation;
        } else if (typeof arg === "number") {
          // 後方互換: 旧 API の generation のみ指定 = trail.db
          targetDbPath = trailDbPath;
          generation = arg;
        } else {
          // 引数なし: trail.db を QuickPick
          targetDbPath = trailDbPath;
        }

        if (!targetDbPath) {
          vscode.window.showErrorMessage(vscode.l10n.t("Trail DB is not initialized."));
          return;
        }

        // BackupManager を取得（trail.db は既存インスタンス、それ以外は新規生成）
        const isTrail = targetDbPath === trailDbPath;
        const mgr = isTrail && backupManager
          ? backupManager
          : new FileBackupManager(targetDbPath, backupGenerations, backupIntervalDays);

        const entries = mgr.listBackups();
        if (entries.length === 0) {
          vscode.window.showInformationMessage(
            vscode.l10n.t("No backups available yet. Backups are created on the first save of each VS Code session."),
          );
          return;
        }

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
          const result = mgr.restoreFromBackup(generation);
          DbLogger.info(
            `DB restored from ${result.restoredFrom}; safety copy at ${result.safetyCopy ?? "(none)"}`,
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
          DbLogger.error("DB restore failed", err);
          vscode.window.showErrorMessage(
            vscode.l10n.t("Restore failed: {0}", err instanceof Error ? err.message : String(err)),
          );
        }
      },
    ),
  );

  // ===== S3 backup upload =====
  function readS3Config(): S3Config {
    const cfg = vscode.workspace.getConfiguration("anytimeDatabase.s3");
    return {
      bucket: cfg.get<string>("bucket", ""),
      region: cfg.get<string>("region", "ap-northeast-1"),
      prefix: cfg.get<string>("prefix", "anytime-database-backups"),
      accessKeyId: cfg.get<string>("accessKeyId", ""),
      secretAccessKey: cfg.get<string>("secretAccessKey", ""),
    };
  }

  let s3Uploader: S3BackupUploader | null = null;
  function getS3Uploader(): S3BackupUploader {
    if (!s3Uploader) {
      s3Uploader = new S3BackupUploader(readS3Config(), DbLogger);
    }
    return s3Uploader;
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("anytimeDatabase.s3")) {
        s3Uploader = null;
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "anytime-database.uploadBackupToS3",
      async (arg?: BackupTreeItem | DbFile) => {
        // 対象 DB パスと表示名を解決
        let targetDbPath: string | null = null;
        let targetDisplayName = "trail.db";
        if (arg instanceof BackupTreeItem) {
          targetDbPath = arg.dbPath;
          targetDisplayName = path.basename(arg.dbPath);
        } else if (arg && typeof (arg as DbFile).fsPath === "string") {
          const dbFile = arg as DbFile;
          targetDbPath = dbFile.fsPath;
          targetDisplayName = path.basename(targetDbPath);
        } else if (trailDbPath) {
          targetDbPath = trailDbPath;
        }

        if (!targetDbPath) {
          vscode.window.showErrorMessage(vscode.l10n.t("Trail DB is not initialized."));
          return;
        }
        const resolvedDbPath: string = targetDbPath;
        const resolvedDisplayName: string = targetDisplayName;

        let uploader: S3BackupUploader;
        try {
          uploader = getS3Uploader();
        } catch (err) {
          if (err instanceof S3ConfigError) {
            vscode.window.showErrorMessage(
              vscode.l10n.t("S3 not configured: missing {0}", err.missing.join(", ")),
            );
            DbLogger.error("S3 upload aborted: missing config", err);
            return;
          }
          DbLogger.error("S3 upload aborted: unexpected error", err);
          throw err;
        }

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: vscode.l10n.t("Uploading {0} to S3", resolvedDisplayName),
              cancellable: false,
            },
            async () => {
              const result = await uploader.uploadLatest(resolvedDbPath, resolvedDisplayName);
              const sizeMb = (result.size / 1024 / 1024).toFixed(2);
              vscode.window.showInformationMessage(
                vscode.l10n.t(
                  "Uploaded s3://{0}/{1} ({2} MB, {3} ms)",
                  result.bucket,
                  result.key,
                  sizeMb,
                  String(result.elapsedMs),
                ),
              );
            },
          );
        } catch (err) {
          if (err instanceof BackupNotFoundError) {
            vscode.window.showWarningMessage(
              vscode.l10n.t("Latest backup not yet created for {0}", resolvedDisplayName),
            );
            DbLogger.warn(`S3 upload skipped: backup not found at ${err.path}`);
            return;
          }
          if (err instanceof S3UploadError) {
            vscode.window.showErrorMessage(
              vscode.l10n.t("S3 upload failed: {0}", err.message),
            );
            DbLogger.error("S3 upload failed (PutObject)", err);
            return;
          }
          vscode.window.showErrorMessage(vscode.l10n.t("S3 upload failed"));
          DbLogger.error("S3 upload unexpected error", err);
        }
      },
    ),
  );

  context.subscriptions.push(databaseTreeView);
}

export function deactivate(): void {
  DbLogger.dispose();
}

/**
 * `target` が `parent` ディレクトリの配下にあるか判定する。両者は事前に `path.resolve` 済み前提。
 */
function isPathInside(target: string, parent: string): boolean {
  const rel = path.relative(parent, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
