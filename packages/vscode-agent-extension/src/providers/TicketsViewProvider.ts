import * as vscode from 'vscode';

/**
 * チケットビューの行。クリックでコマンドを起動する「ボタン」として振る舞う
 * （`AiNoteItem` と同じ `TreeItem.command` の使い方）。
 */
export class TicketsActionItem extends vscode.TreeItem {
  constructor(label: string, icon: string, command: string, tooltip: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.tooltip = tooltip;
    this.contextValue = 'ticketsActionItem';
    this.command = { command, title: label };
  }
}

/**
 * チケット機能への入口を並べるビュー。
 *
 * Why not: ここにチケット一覧そのものをツリー表示しない。一覧・編集は webview の
 * カンバンボード（web アプリの /tickets と同じ UI）が担当し、本ビューは起動と
 * 保存先切り替えだけを持つ。ツリーと webview で二重に一覧を持つと、同じデータに
 * 対する更新経路が 2 つできて整合を取り続ける必要が生じる。
 *
 * 文言は既存プロバイダ（OllamaProvider 等）と同じく日本語を直書きする。
 * 本拡張は l10n を構成していないため、`vscode.l10n.t` は使わない。
 */
export class TicketsViewProvider implements vscode.TreeDataProvider<TicketsActionItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: TicketsActionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): TicketsActionItem[] {
    return [
      new TicketsActionItem(
        'チケット管理を開く',
        'checklist',
        'anytime-agent.tickets.open',
        'カンバンボードをエディタタブで開く',
      ),
      new TicketsActionItem(
        'リポジトリとブランチを選択',
        'repo',
        'anytime-agent.tickets.selectRepo',
        'チケットの保存先を切り替える',
      ),
    ];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}
