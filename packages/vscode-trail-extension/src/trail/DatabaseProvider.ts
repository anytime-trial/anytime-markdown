import * as vscode from 'vscode';
import type { TrailDatabase } from './TrailDatabase';
import type { SupabaseTrailStore } from './SupabaseTrailStore';
import { formatLocalDateTime } from '@anytime-markdown/trail-core/formatDate';

// ルートノード（SQLite / Supabase）
interface DbRootItem {
  readonly label: string;
  readonly contextValue: 'sqliteDb' | 'supabaseDb';
  readonly status?: string;
  readonly lastImported: string | null;
}

class DbRootTreeItem extends vscode.TreeItem {
  constructor(item: DbRootItem) {
    super(item.label, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = item.contextValue;
    this.iconPath = new vscode.ThemeIcon('database');
    if (item.status !== undefined) {
      this.description = item.status;
    }
  }
}

// 子ノード（Status行・最終インポート行）
class DbDetailTreeItem extends vscode.TreeItem {
  constructor(label: string, value: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
  }
}

// バックアップのグループノード（SQLite 配下に表示）
class BackupsRootTreeItem extends vscode.TreeItem {
  readonly kind = 'backupsRoot' as const;
  constructor(count: number) {
    super('Backups', count > 0
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'backupsRoot';
    this.iconPath = new vscode.ThemeIcon('archive');
    this.description = count > 0 ? `${count} generation${count === 1 ? '' : 's'}` : 'None';
  }
}

// 個別バックアップ（クリックで復元コマンド起動）
class BackupTreeItem extends vscode.TreeItem {
  readonly kind = 'backup' as const;
  constructor(generation: number, mtime: Date, compressedBytes: number) {
    super(`Generation ${generation}`, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'backupEntry';
    this.iconPath = new vscode.ThemeIcon('history');
    this.description = mtime.toLocaleString();
    const mb = (compressedBytes / 1024 / 1024).toFixed(2);
    this.tooltip = `Generation ${generation}\n${mtime.toLocaleString()}\n${mb} MB (gzip)`;
    this.command = {
      command: 'anytime-trail.restoreBackup',
      title: 'Restore from this backup',
      arguments: [generation],
    };
  }
}

// インポート中スピナー
class ImportingTreeItem extends vscode.TreeItem {
  constructor() {
    super('$(loading~spin) Importing...', vscode.TreeItemCollapsibleState.None);
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
  private supabaseStatus = 'Not connected';
  private supabaseLastImported: string | null = null;
  private importing = false;

  constructor(
    private readonly trailDb: TrailDatabase,
    private readonly supabaseStore?: SupabaseTrailStore,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateSqliteStatus(status: string, lastImported?: string | null): void {
    this.sqliteStatus = status;
    if (lastImported !== undefined) {
      this.sqliteLastImported = lastImported;
    }
    this.refresh();
  }

  updateSupabaseStatus(status: string, lastImported?: string | null): void {
    this.supabaseStatus = status;
    if (lastImported !== undefined) {
      this.supabaseLastImported = lastImported;
    }
    this.refresh();
  }

  setImporting(value: boolean): void {
    this.importing = value;
    this.refresh();
  }

  getTreeItem(element: AnyTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AnyTreeItem): AnyTreeItem[] {
    if (!element) {
      // ルートレベル
      const items: AnyTreeItem[] = [
        new DbRootTreeItem({
          label: 'SQLite',
          contextValue: 'sqliteDb',
          lastImported: this.sqliteLastImported,
        }),
        new DbRootTreeItem({
          label: 'Supabase',
          contextValue: 'supabaseDb',
          lastImported: this.supabaseLastImported,
        }),
      ];
      if (this.importing) {
        items.push(new ImportingTreeItem());
      }
      return items;
    }

    // 子ノード（DbRootTreeItem の展開）
    if (element instanceof DbRootTreeItem) {
      if (element.contextValue === 'sqliteDb') {
        const backups = this.trailDb.listBackups();
        return [
          new DbDetailTreeItem('Status', this.sqliteStatus),
          new DbDetailTreeItem('最終インポート', this.sqliteLastImported ? formatLocalDateTime(this.sqliteLastImported) : '未実行'),
          new BackupsRootTreeItem(backups.length),
        ];
      }
      if (element.contextValue === 'supabaseDb') {
        return [
          new DbDetailTreeItem('Status', this.supabaseStatus),
          new DbDetailTreeItem('最終同期', this.supabaseLastImported ? formatLocalDateTime(this.supabaseLastImported) : '未実行'),
        ];
      }
    }

    // バックアップグループの展開
    if (element instanceof BackupsRootTreeItem) {
      return this.trailDb.listBackups().map(
        (b) => new BackupTreeItem(b.generation, b.mtime, b.compressedSize),
      );
    }

    return [];
  }
}
