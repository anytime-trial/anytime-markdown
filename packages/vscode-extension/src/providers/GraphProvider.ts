import * as vscode from 'vscode';
import { execSync } from 'child_process';

export class GraphItem extends vscode.TreeItem {
	constructor(
		public readonly graph: string,
		public readonly hash: string,
		public readonly message: string,
		public readonly refs: string,
		public readonly date: string,
		public readonly author: string,
	) {
		super('', vscode.TreeItemCollapsibleState.None);
		// グラフ文字 + コミットメッセージ
		this.label = `${graph} ${message}`;
		const parts: string[] = [];
		if (refs) parts.push(refs);
		parts.push(date);
		parts.push(author);
		this.description = parts.join('  ');
		this.tooltip = `${hash.substring(0, 7)}  ${message}\n${refs ? refs + '\n' : ''}${author}  ${date}`;
		this.iconPath = new vscode.ThemeIcon('git-commit');
	}
}

export class GraphProvider implements vscode.TreeDataProvider<GraphItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private gitRoot: string | null = null;
	private items: GraphItem[] = [];

	setTargetRoot(rootPath: string | null): void {
		this.gitRoot = null;
		if (rootPath) {
			try {
				this.gitRoot = execSync('git rev-parse --show-toplevel', { cwd: rootPath, encoding: 'utf-8' }).trim();
			} catch { /* ignore */ }
		}
		this.items = [];
		this._onDidChangeTreeData.fire();
	}

	refresh(): void {
		this.items = [];
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: GraphItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<GraphItem[]> {
		if (!this.gitRoot) { return []; }
		if (this.items.length > 0) { return this.items; }

		try {
			// %x00 をセパレータに使用
			const output = execSync(
				'git log --graph --all --oneline --decorate --format="%h%x00%s%x00%d%x00%ar%x00%an" -100',
				{ cwd: this.gitRoot, encoding: 'utf-8', maxBuffer: 1024 * 1024 },
			);
			for (const line of output.split('\n')) {
				if (!line.trim()) continue;
				// グラフ部分とデータ部分を分離
				const nullIdx = line.indexOf('\0');
				if (nullIdx === -1) {
					// グラフのみの行（マージライン等）
					this.items.push(new GraphItem(line.trim(), '', '', '', '', ''));
					continue;
				}
				// グラフ部分: nullの前のハッシュ前まで
				// フォーマット: "* abc1234\0message\0 (refs)\0date\0author"
				// --onelineの場合グラフ文字 + スペース + ハッシュ\0...
				const parts = line.split('\0');
				const graphAndHash = parts[0];
				const message = parts[1] ?? '';
				const refs = (parts[2] ?? '').trim().replace(/^\(|\)$/g, '');
				const date = parts[3] ?? '';
				const author = parts[4] ?? '';

				// グラフ文字とハッシュを分離
				const hashMatch = graphAndHash.match(/([0-9a-f]{7,})\s*$/);
				const hash = hashMatch ? hashMatch[1] : '';
				const graph = hashMatch ? graphAndHash.substring(0, hashMatch.index).trimEnd() : graphAndHash;

				this.items.push(new GraphItem(graph, hash, message, refs, date, author));
			}
			return this.items;
		} catch {
			return [];
		}
	}

	dispose(): void { /* nothing */ }
}
