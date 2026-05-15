import * as vscode from 'vscode';
import { formatLocalDateTime } from '@anytime-markdown/trail-core/formatDate';

interface DbRootItem {
  readonly label: string;
  readonly contextValue: 'sqliteDb';
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

class DbDetailTreeItem extends vscode.TreeItem {
  constructor(label: string, value: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
  }
}

class ImportingTreeItem extends vscode.TreeItem {
  constructor() {
    super('$(loading~spin) Importing...', vscode.TreeItemCollapsibleState.None);
  }
}

type AnyTreeItem =
  | DbRootTreeItem
  | DbDetailTreeItem
  | ImportingTreeItem;

export class DatabaseProvider implements vscode.TreeDataProvider<AnyTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AnyTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sqliteStatus = 'Not initialized';
  private sqliteLastImported: string | null = null;
  private importing = false;

  // バックアップ一覧 / 復元 UI は vscode-database-extension に移管済み。
  // trail 拡張側はバックアップトリガ (FileBackupManager.maybeRotate) のみを担う。
  constructor() {}

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

  setImporting(value: boolean): void {
    this.importing = value;
    this.refresh();
  }

  getTreeItem(element: AnyTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AnyTreeItem): AnyTreeItem[] {
    if (!element) {
      const items: AnyTreeItem[] = [
        new DbRootTreeItem({
          label: 'SQLite',
          contextValue: 'sqliteDb',
          lastImported: this.sqliteLastImported,
        }),
      ];
      if (this.importing) {
        items.push(new ImportingTreeItem());
      }
      return items;
    }

    if (element instanceof DbRootTreeItem) {
      return [
        new DbDetailTreeItem('Status', this.sqliteStatus),
        new DbDetailTreeItem('最終インポート', this.sqliteLastImported ? formatLocalDateTime(this.sqliteLastImported) : '未実行'),
      ];
    }

    return [];
  }
}
