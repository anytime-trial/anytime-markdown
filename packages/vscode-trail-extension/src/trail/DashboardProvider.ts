import * as vscode from 'vscode';
import type { TrailDatabase } from './TrailDatabase';

interface DashboardItem {
  readonly label: string;
  readonly description?: string;
  readonly command?: vscode.Command;
  readonly contextValue?: string;
}

class DashboardTreeItem extends vscode.TreeItem {
  constructor(item: DashboardItem) {
    super(item.label, vscode.TreeItemCollapsibleState.None);
    this.description = item.description;
    this.command = item.command;
    this.contextValue = item.contextValue;
  }
}

export class DashboardProvider implements vscode.TreeDataProvider<DashboardTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private dbStatus = 'Not initialized';
  private sessionCount = 0;
  private importing = false;

  constructor(private readonly trailDb: TrailDatabase) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateStatus(status: string, sessions?: number): void {
    this.dbStatus = status;
    if (sessions !== undefined) {
      this.sessionCount = sessions;
    }
    this.refresh();
  }

  setImporting(value: boolean): void {
    this.importing = value;
    this.refresh();
  }

  getTreeItem(element: DashboardTreeItem): DashboardTreeItem {
    return element;
  }

  getChildren(): DashboardTreeItem[] {
    const items: DashboardTreeItem[] = [];

    // DB Status
    items.push(new DashboardTreeItem({
      label: `DB: ${this.dbStatus}`,
      description: this.sessionCount > 0 ? `${this.sessionCount} sessions` : '',
    }));

    // Import status (shown during import)
    if (this.importing) {
      items.push(new DashboardTreeItem({
        label: '$(loading~spin) Importing...',
      }));
    }

    return items;
  }
}
