import * as vscode from 'vscode';
import type { TrailDatabase } from './TrailDatabase';
import type { SupabaseTrailStore } from './SupabaseTrailStore';

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

// インポート中スピナー
class ImportingTreeItem extends vscode.TreeItem {
  constructor() {
    super('$(loading~spin) Importing...', vscode.TreeItemCollapsibleState.None);
  }
}

function formatJst(isoString: string): string {
  const date = new Date(isoString);
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');
  const ss = String(jst.getUTCSeconds()).padStart(2, '0');
  return `${y}/${m}/${d} ${hh}:${mm}:${ss}`;
}

type AnyTreeItem = DbRootTreeItem | DbDetailTreeItem | ImportingTreeItem;

export class DashboardProvider implements vscode.TreeDataProvider<AnyTreeItem> {
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
        return [
          new DbDetailTreeItem('Status', this.sqliteStatus),
          new DbDetailTreeItem('最終インポート', this.sqliteLastImported ? formatJst(this.sqliteLastImported) : '未実行'),
        ];
      }
      if (element.contextValue === 'supabaseDb') {
        return [
          new DbDetailTreeItem('Status', this.supabaseStatus),
          new DbDetailTreeItem('最終同期', this.supabaseLastImported ? formatJst(this.supabaseLastImported) : '未実行'),
        ];
      }
    }
    return [];
  }
}
