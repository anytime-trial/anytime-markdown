import * as path from 'node:path';
import * as vscode from 'vscode';
import type { SupabaseTrailStore } from '@anytime-markdown/trail-db';
import { FileBackupManager } from '@anytime-markdown/database-core/FileBackupManager';
import { formatLocalDateTime } from '@anytime-markdown/trail-core/formatDate';

interface DbFile {
  /** ワークスペース絶対パス */
  readonly fsPath: string;
  /** ワークスペースルートからの相対パス（表示用） */
  readonly relPath: string;
  /** storagePath 配下なら true */
  readonly isManaged: boolean;
  /** Trail 拡張が初期化した trail.db 本体なら true */
  readonly isTrailDb: boolean;
}

class SqliteRootTreeItem extends vscode.TreeItem {
  readonly kind = 'sqliteRoot' as const;
  constructor() {
    super('SQLite', vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'sqliteRoot';
    this.iconPath = new vscode.ThemeIcon('database');
  }
}

class RemoteRootTreeItem extends vscode.TreeItem {
  readonly kind = 'remoteRoot' as const;
  constructor(
    readonly provider: 'supabase' | 'postgres',
    label: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = provider === 'supabase' ? 'supabaseDb' : 'postgresDb';
    this.iconPath = new vscode.ThemeIcon('database');
  }
}

class ManagedDbTreeItem extends vscode.TreeItem {
  readonly kind = 'managedDb' as const;
  constructor(readonly db: DbFile) {
    super(path.basename(db.fsPath), vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = db.isTrailDb ? 'trailDb' : 'managedDb';
    this.iconPath = new vscode.ThemeIcon('database');
    this.description = path.relative(
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
      path.dirname(db.fsPath),
    );
    this.resourceUri = vscode.Uri.file(db.fsPath);
    this.tooltip = db.relPath;
  }
}

class FlatDbTreeItem extends vscode.TreeItem {
  readonly kind = 'flatDb' as const;
  constructor(readonly db: DbFile) {
    super(path.basename(db.fsPath), vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'flatDb';
    this.iconPath = new vscode.ThemeIcon('file');
    this.description = path.relative(
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
      path.dirname(db.fsPath),
    );
    this.resourceUri = vscode.Uri.file(db.fsPath);
    this.tooltip = db.relPath;
    this.command = {
      command: 'vscode.openWith',
      title: 'Open',
      arguments: [this.resourceUri, 'anytimeDatabase.sqlite'],
    };
  }
}

class EmptyTreeItem extends vscode.TreeItem {
  readonly kind = 'empty' as const;
  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = '';
  }
}

class DbDetailTreeItem extends vscode.TreeItem {
  readonly kind = 'detail' as const;
  constructor(label: string, value: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
  }
}

class BackupsRootTreeItem extends vscode.TreeItem {
  readonly kind = 'backupsRoot' as const;
  constructor(readonly dbPath: string, count: number) {
    super(
      vscode.l10n.t('Backups'),
      count > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.contextValue = 'backupsRoot';
    this.iconPath = new vscode.ThemeIcon('archive');
    this.description =
      count === 0
        ? vscode.l10n.t('None')
        : count === 1
          ? vscode.l10n.t('1 generation')
          : vscode.l10n.t('{0} generations', count);
  }
}

export class BackupTreeItem extends vscode.TreeItem {
  readonly kind = 'backup' as const;
  constructor(
    readonly dbPath: string,
    readonly generation: number,
    mtime: Date,
    compressedBytes: number,
  ) {
    const label = vscode.l10n.t('Generation {0}', generation);
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = generation === 1 ? 'backupEntryLatest' : 'backupEntryOlder';
    this.iconPath = new vscode.ThemeIcon('history');
    // toLocaleString() は TZ 未指定のため Extension Host (WSL, system TZ=UTC) で UTC 表示になる。
    // 同パネルの Last imported / Last synced と同じ formatLocalDateTime を使う。
    const mtimeStr = formatLocalDateTime(mtime.toISOString());
    this.description = mtimeStr;
    const mb = (compressedBytes / 1024 / 1024).toFixed(2);
    this.tooltip = `${label}\n${mtimeStr}\n${mb} MB (gzip)`;
    this.command = {
      command: 'anytimeDatabase.restoreBackup',
      title: 'Restore from this backup',
      arguments: [this],
    };
  }
}

class ImportingTreeItem extends vscode.TreeItem {
  readonly kind = 'importing' as const;
  constructor() {
    super(vscode.l10n.t('$(loading~spin) Syncing...'), vscode.TreeItemCollapsibleState.None);
  }
}

type AnyTreeItem =
  | SqliteRootTreeItem
  | RemoteRootTreeItem
  | ManagedDbTreeItem
  | FlatDbTreeItem
  | EmptyTreeItem
  | DbDetailTreeItem
  | BackupsRootTreeItem
  | BackupTreeItem
  | ImportingTreeItem;

export class DatabaseProvider implements vscode.TreeDataProvider<AnyTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AnyTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sqliteStatus = 'Not initialized';
  private sqliteLastImported: string | null = null;
  private remoteStatus = 'Not connected';
  private remoteLastSynced: string | null = null;
  private syncing = false;
  private dbFiles: readonly DbFile[] = [];

  constructor(
    /** Trail 拡張が管理する trail.db 用の BackupManager（trail.db ノード専用） */
    private readonly trailBackupManager: FileBackupManager | null,
    /** Trail 拡張が管理する trail.db の絶対パス（管理判定用）。未指定なら全て flat */
    private readonly trailDbPath: string | null,
    /** storagePath の絶対パス（配下判定用）。未指定なら全て flat */
    private readonly storageDir: string | null,
    private readonly backupGenerations: number,
    private readonly backupIntervalDays: number,
    private remoteProvider: 'supabase' | 'postgres' | 'none',
    private readonly supabaseStore?: SupabaseTrailStore,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateSqliteStatus(status: string, lastImported?: string | null): void {
    this.sqliteStatus = status;
    if (lastImported !== undefined) this.sqliteLastImported = lastImported;
    this.refresh();
  }

  updateRemoteStatus(status: string, lastSynced?: string | null): void {
    this.remoteStatus = status;
    if (lastSynced !== undefined) this.remoteLastSynced = lastSynced;
    this.refresh();
  }

  setSyncing(value: boolean): void {
    this.syncing = value;
    this.refresh();
  }

  setRemoteProvider(provider: 'supabase' | 'postgres' | 'none'): void {
    this.remoteProvider = provider;
    this.refresh();
  }

  setDbFiles(files: readonly DbFile[]): void {
    this.dbFiles = files;
    this.refresh();
  }

  getTreeItem(element: AnyTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AnyTreeItem): AnyTreeItem[] {
    if (!element) {
      const items: AnyTreeItem[] = [new SqliteRootTreeItem()];
      if (this.remoteProvider === 'supabase') {
        items.push(new RemoteRootTreeItem('supabase', 'Supabase'));
      } else if (this.remoteProvider === 'postgres') {
        items.push(new RemoteRootTreeItem('postgres', 'PostgreSQL'));
      }
      if (this.syncing) items.push(new ImportingTreeItem());
      return items;
    }

    if (element instanceof SqliteRootTreeItem) {
      if (this.dbFiles.length === 0) {
        return [new EmptyTreeItem(vscode.l10n.t('No database files found'))];
      }
      const managed = this.dbFiles.filter((f) => f.isManaged);
      const flat = this.dbFiles.filter((f) => !f.isManaged);
      return [
        ...managed.map((f) => new ManagedDbTreeItem(f)),
        ...flat.map((f) => new FlatDbTreeItem(f)),
      ];
    }

    if (element instanceof ManagedDbTreeItem) {
      const { db } = element;
      const backupManager = this.getBackupManager(db.fsPath);
      const backups = backupManager.listBackups();
      const details: AnyTreeItem[] = [];
      if (db.isTrailDb) {
        details.push(
          new DbDetailTreeItem(vscode.l10n.t('Status'), this.sqliteStatus),
          new DbDetailTreeItem(
            vscode.l10n.t('Last imported'),
            this.sqliteLastImported
              ? formatLocalDateTime(this.sqliteLastImported)
              : vscode.l10n.t('Not run'),
          ),
        );
      }
      details.push(new BackupsRootTreeItem(db.fsPath, backups.length));
      return details;
    }

    if (element instanceof RemoteRootTreeItem) {
      return [
        new DbDetailTreeItem(vscode.l10n.t('Status'), this.remoteStatus),
        new DbDetailTreeItem(
          vscode.l10n.t('Last synced'),
          this.remoteLastSynced
            ? formatLocalDateTime(this.remoteLastSynced)
            : vscode.l10n.t('Not run'),
        ),
      ];
    }

    if (element instanceof BackupsRootTreeItem) {
      const backupManager = this.getBackupManager(element.dbPath);
      return backupManager
        .listBackups()
        .map((b) => new BackupTreeItem(element.dbPath, b.generation, b.mtime, b.compressedSize));
    }

    return [];
  }

  /**
   * 指定 DB パスの FileBackupManager を取得する。trail.db 本体は extension.ts 側で
   * 構築済みの単一インスタンスを再利用する（書き込み状態 backupDone を共有するため）。
   * それ以外は listBackups だけが目的なので、その都度生成して問題ない。
   */
  private getBackupManager(dbPath: string): FileBackupManager {
    if (this.trailBackupManager && this.trailDbPath && dbPath === this.trailDbPath) {
      return this.trailBackupManager;
    }
    return new FileBackupManager(dbPath, this.backupGenerations, this.backupIntervalDays);
  }
}

export type { DbFile };
