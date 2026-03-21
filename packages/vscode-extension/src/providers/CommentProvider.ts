import * as vscode from 'vscode';

export interface CommentData {
	id: string;
	text: string;
	resolved: boolean;
	createdAt: string;
	targetText: string;
	pos: number;
	isPoint: boolean;
}

export class CommentItem extends vscode.TreeItem {
	constructor(public readonly comment: CommentData) {
		const label = comment.text || '(empty)';
		super(label, vscode.TreeItemCollapsibleState.None);

		// 対象テキストを description に表示
		if (!comment.isPoint && comment.targetText) {
			this.description = `"${comment.targetText}"`;
		} else if (comment.isPoint) {
			this.description = 'Point comment';
		}

		this.iconPath = new vscode.ThemeIcon(
			comment.resolved ? 'pass' : 'comment',
		);

		this.contextValue = comment.resolved ? 'resolved' : 'unresolved';

		this.command = {
			command: 'anytime-markdown.scrollToComment',
			title: 'Go to comment',
			arguments: [comment.pos],
		};
	}
}

export type CommentFilter = 'all' | 'open' | 'resolved';

export class CommentProvider implements vscode.TreeDataProvider<CommentItem> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private allItems: CommentData[] = [];
	private _filter: CommentFilter = 'all';

	get filter(): CommentFilter {
		return this._filter;
	}

	setFilter(filter: CommentFilter): void {
		this._filter = filter;
		this._onDidChangeTreeData.fire();
	}

	update(comments: CommentData[]): void {
		this.allItems = comments;
		this._onDidChangeTreeData.fire();
	}

	clear(): void {
		this.allItems = [];
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: CommentItem): vscode.TreeItem {
		return element;
	}

	getChildren(): CommentItem[] {
		const filtered = this.allItems.filter(c => {
			if (this._filter === 'open') return !c.resolved;
			if (this._filter === 'resolved') return c.resolved;
			return true;
		});
		return filtered.map(c => new CommentItem(c));
	}
}
