import * as vscode from 'vscode';

interface HeadingData {
	level: number;
	text: string;
	pos: number;
	kind: string;
}

const MANUAL_NUMBER_RE = /^\d+(\.\d+)*\.?\s/;

const KIND_ICONS: Record<string, string> = {
	heading: 'symbol-structure',
	mermaid: 'graph',
	plantuml: 'graph',
	codeBlock: 'code',
	table: 'table',
	image: 'file-media',
};

export class OutlineItem extends vscode.TreeItem {
	public readonly children: OutlineItem[] = [];

	constructor(
		public readonly heading: HeadingData,
	) {
		const text = heading.text || '(empty)';
		const label = text;
		super(label, vscode.TreeItemCollapsibleState.None);
		if (heading.kind !== 'heading') {
			this.iconPath = new vscode.ThemeIcon(KIND_ICONS[heading.kind] ?? 'symbol-misc');
		}
		this.command = {
			command: 'anytime-markdown.scrollToHeading',
			title: 'Go to heading',
			arguments: [heading.pos],
		};
	}
}

export class OutlineProvider implements vscode.TreeDataProvider<OutlineItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private roots: OutlineItem[] = [];
	private lastHeadings: HeadingData[] = [];
	private _showBlockElements = false;
	private _allCollapsed = false;

	get showBlockElements(): boolean {
		return this._showBlockElements;
	}

	get allCollapsed(): boolean {
		return this._allCollapsed;
	}

	toggleBlockElements(): void {
		this._showBlockElements = !this._showBlockElements;
		this.roots = this.buildTree(this.lastHeadings);
		this._onDidChangeTreeData.fire();
	}

	toggleCollapseAll(): void {
		this._allCollapsed = !this._allCollapsed;
		this.roots = this.buildTree(this.lastHeadings);
		this._onDidChangeTreeData.fire();
	}

	update(headings: HeadingData[]): void {
		this.lastHeadings = headings;
		this.roots = this.buildTree(headings);
		this._onDidChangeTreeData.fire();
	}

	clear(): void {
		this.roots = [];
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: OutlineItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: OutlineItem): OutlineItem[] {
		if (!element) {
			return this.roots;
		}
		return element.children;
	}

	private buildTree(headings: HeadingData[]): OutlineItem[] {
		const filtered = this._showBlockElements
			? headings
			: headings.filter(h => h.kind === 'heading');

		// セクション番号マップ（web アプリの OutlinePanel と同じ自動判定）
		const headingItems = headings.filter(h => h.kind === 'heading');
		let sectionNumberMap: Map<number, string> | null = null;
		if (headingItems.length >= 2) {
			const numberedCount = headingItems.filter(h => MANUAL_NUMBER_RE.test(h.text)).length;
			if (numberedCount < headingItems.length / 2) {
				sectionNumberMap = new Map();
				const counters = [0, 0, 0, 0, 0];
				for (const h of headingItems) {
					const level = h.level - 1;
					counters[level]++;
					for (let i = level + 1; i < 5; i++) counters[i] = 0;
					sectionNumberMap.set(h.pos, counters.slice(0, level + 1).join('.') + '. ');
				}
			}
		}

		const items = filtered.map(h => {
			const item = new OutlineItem(h);
			const prefix = sectionNumberMap?.get(h.pos);
			if (prefix) {
				item.label = prefix + (h.text || '(empty)');
			}
			return item;
		});
		const roots: OutlineItem[] = [];
		const stack: OutlineItem[] = [];

		for (const item of items) {
			// 非見出し項目（level 6: mermaid, table 等）は直前の見出しの子にする
			if (item.heading.kind !== 'heading') {
				if (stack.length > 0) {
					const parent = stack[stack.length - 1];
					parent.children.push(item);
					parent.collapsibleState = this._allCollapsed
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.Expanded;
				} else {
					roots.push(item);
				}
				continue;
			}

			// スタックから現在レベル以上の項目を除去
			while (stack.length > 0 && stack[stack.length - 1].heading.level >= item.heading.level) {
				stack.pop();
			}

			if (stack.length > 0) {
				const parent = stack[stack.length - 1];
				parent.children.push(item);
				parent.collapsibleState = this._allCollapsed
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.Expanded;
			} else {
				roots.push(item);
			}

			stack.push(item);
		}

		return roots;
	}
}
