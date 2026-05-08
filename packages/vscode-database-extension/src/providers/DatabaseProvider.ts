import * as vscode from 'vscode';
import type { TrailDatabase, SupabaseTrailStore } from '@anytime-markdown/trail-db';
import { formatLocalDateTime } from '@anytime-markdown/trail-core/formatDate';

interface DbRootItem {
  readonly label: string;
  readonly contextValue: 'sqliteDb' | 'supabaseDb' | 'postgresDb';
  readonly lastImported: string | null;
}

class DbRootTreeItem extends vscode.TreeItem {
  constructor(item: DbRootItem) {
    super(item.label, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = item.contextValue;
    this.iconPath = new vscode.ThemeIcon('database');
  }
}

class DbDetailTreeItem extends vscode.TreeItem {
  constructor(label: string, value: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
  }
}

class BackupsRootTreeItem extends vscode.TreeItem {
  readonly kind = 'backupsRoot' as const;
  constructor(count: number) {
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

// クリックなし（参照のみ）
class BackupTreeItem extends vscode.TreeItem {
  readonly kind = 'backup' as const;
  constructor(generation: number, mtime: Date, compressedBytes: number) {
    const label = vscode.l10n.t('Generation {0}', generation);
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'backupEntry';
    this.iconPath = new vscode.ThemeIcon('history');
    this.description = mtime.toLocaleString();
    const mb = (compressedBytes / 1024 / 1024).toFixed(2);
    this.tooltip = `${label}\n${mtime.toLocaleString()}\n${mb} MB (gzip)`;
  }
}

class ImportingTreeItem extends vscode.TreeItem {
  constructor() {
    super(vscode.l10n.t('$(loading~spin) Syncing...'), vscode.TreeItemCollapsibleState.None);
  }
}

type AnyTreeItem =
  | DbRootTreeItem
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

  constructor(
    private readonly trailDb: TrailDatabase,
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

  getTreeItem(element: AnyTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AnyTreeItem): AnyTreeItem[] {
    if (!element) {
      const items: AnyTreeItem[] = [
        new DbRootTreeItem({ label: 'SQLite', contextValue: 'sqliteDb', lastImported: this.sqliteLastImported }),
      ];
      if (this.remoteProvider === 'supabase') {
        items.push(new DbRootTreeItem({ label: 'Supabase', contextValue: 'supabaseDb', lastImported: this.remoteLastSynced }));
      } else if (this.remoteProvider === 'postgres') {
        items.push(new DbRootTreeItem({ label: 'PostgreSQL', contextValue: 'postgresDb', lastImported: this.remoteLastSynced }));
      }
      if (this.syncing) items.push(new ImportingTreeItem());
      return items;
    }

    if (element instanceof DbRootTreeItem) {
      if (element.contextValue === 'sqliteDb') {
        const backups = this.trailDb.listBackups();
        return [
          new DbDetailTreeItem(vscode.l10n.t('Status'), this.sqliteStatus),
          new DbDetailTreeItem(
            vscode.l10n.t('Last imported'),
            this.sqliteLastImported
              ? formatLocalDateTime(this.sqliteLastImported)
              : vscode.l10n.t('Not run'),
          ),
          new BackupsRootTreeItem(backups.length),
        ];
      }
      if (element.contextValue === 'supabaseDb' || element.contextValue === 'postgresDb') {
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
    }

    if (element instanceof BackupsRootTreeItem) {
      return this.trailDb.listBackups().map(
        (b) => new BackupTreeItem(b.generation, b.mtime, b.compressedSize),
      );
    }

    return [];
  }
}
