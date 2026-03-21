import * as vscode from 'vscode';

interface HeadingData {
	level: number;
	text: string;
	pos: number;
	kind: string;
}

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

	private collapsibleState(): vscode.TreeItemCollapsibleState {
		return this._allCollapsed
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.Expanded;
	}

	private addChild(parent: OutlineItem, child: OutlineItem): void {
		parent.children.push(child);
		parent.collapsibleState = this.collapsibleState();
	}

	private buildTree(headings: HeadingData[]): OutlineItem[] {
		const filtered = this._showBlockElements
			? headings
			: headings.filter(h => h.kind === 'heading');

		const items = filtered.map(h => new OutlineItem(h));
		const roots: OutlineItem[] = [];
		const stack: OutlineItem[] = [];

		for (const item of items) {
			if (item.heading.kind !== 'heading') {
				const parent = stack[stack.length - 1];
				if (parent) this.addChild(parent, item);
				else roots.push(item);
				continue;
			}

			while (stack.length > 0 && stack[stack.length - 1].heading.level >= item.heading.level) {
				stack.pop();
			}

			const parent = stack[stack.length - 1];
			if (parent) this.addChild(parent, item);
			else roots.push(item);

			stack.push(item);
		}

		return roots;
	}
}
