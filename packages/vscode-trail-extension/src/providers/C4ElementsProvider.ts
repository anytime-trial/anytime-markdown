import * as vscode from 'vscode';
import { buildElementTree, filterTreeByLevel } from '@anytime-markdown/c4-kernel';
import type { BoundaryInfo, C4Model, C4TreeNode } from '@anytime-markdown/c4-kernel';

/** C4TreeNode に対応する要素タイプ → ThemeIcon マッピング */
const TYPE_ICONS: Readonly<Record<C4TreeNode['type'], string>> = {
	person: 'person',
	system: 'server',
	container: 'package',
	containerDb: 'database',
	component: 'extensions',
	code: 'file-code',
	boundary: 'folder',
};

export class C4ElementItem extends vscode.TreeItem {
	readonly c4Id: string;
	readonly childNodes: readonly C4TreeNode[];

	constructor(node: C4TreeNode) {
		const collapsible = node.children.length > 0
			? vscode.TreeItemCollapsibleState.Expanded
			: vscode.TreeItemCollapsibleState.None;
		super(node.name, collapsible);

		this.c4Id = node.id;
		this.childNodes = node.children;
		this.iconPath = new vscode.ThemeIcon(TYPE_ICONS[node.type] ?? 'circle-outline');
		this.tooltip = buildTooltip(node);

		if (node.external) {
			this.description = '(external)';
		} else if (node.technology) {
			this.description = node.technology;
		}
	}
}

function buildTooltip(node: C4TreeNode): string {
	const parts = [node.name];
	if (node.technology) parts.push(`[${node.technology}]`);
	if (node.description) parts.push(node.description);
	if (node.external) parts.push('(external)');
	return parts.join('\n');
}

export class C4ElementsProvider implements vscode.TreeDataProvider<C4ElementItem> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private model: C4Model | null = null;
	private boundaries: readonly BoundaryInfo[] = [];
	private level = 4;
	private filteredTree: readonly C4TreeNode[] = [];

	setModel(model: C4Model, boundaries: readonly BoundaryInfo[]): void {
		this.model = model;
		this.boundaries = boundaries;
		this.rebuildTree();
	}

	setLevel(level: number): void {
		this.level = level;
		this.rebuildTree();
	}

	getLevel(): number {
		return this.level;
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	clear(): void {
		this.model = null;
		this.boundaries = [];
		this.filteredTree = [];
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: C4ElementItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: C4ElementItem): C4ElementItem[] {
		const nodes = element ? element.childNodes : this.filteredTree;
		return [...nodes]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(n => new C4ElementItem(n));
	}

	private rebuildTree(): void {
		if (!this.model) {
			this.filteredTree = [];
		} else {
			const fullTree = buildElementTree(this.model, this.boundaries);
			this.filteredTree = filterTreeByLevel(fullTree, this.level);
		}
		this._onDidChangeTreeData.fire();
	}
}
