import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** メモリファイルの TreeItem */
export class AiMemoryItem extends vscode.TreeItem {
	constructor(
		public readonly filePath: string,
		public readonly fileName: string,
		public readonly memoryName: string,
		public readonly memoryType: string,
	) {
		super(memoryName, vscode.TreeItemCollapsibleState.None);
		this.description = memoryType;
		this.tooltip = `${memoryName}\nType: ${memoryType}\n${fileName}`;
		this.iconPath = new vscode.ThemeIcon(getIconForType(memoryType));
		this.command = {
			command: 'anytime-trail.openAiMemory',
			title: 'Open AI Memory',
			arguments: [this],
		};
	}
}

function getIconForType(type: string): string {
	switch (type) {
		case 'feedback': return 'comment';
		case 'user': return 'person';
		case 'project': return 'project';
		case 'reference': return 'link-external';
		default: return 'note';
	}
}

/** frontmatter からメタデータを抽出 */
function parseFrontmatter(content: string): { name: string; type: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) { return { name: '', type: '' }; }
	const fm = match[1];
	const nameMatch = fm.match(/^name:\s*(.+)$/m);
	const typeMatch = fm.match(/^type:\s*(.+)$/m);
	return {
		name: nameMatch?.[1]?.trim() || '',
		type: typeMatch?.[1]?.trim() || '',
	};
}

/** メモリ一覧を提供する TreeDataProvider */
export class AiMemoryProvider implements vscode.TreeDataProvider<AiMemoryItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly memoryDir: string) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: AiMemoryItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<AiMemoryItem[]> {
		if (!fs.existsSync(this.memoryDir)) { return []; }

		const files = fs.readdirSync(this.memoryDir)
			.filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
			.sort();

		const items: AiMemoryItem[] = [];
		for (const fileName of files) {
			const filePath = path.join(this.memoryDir, fileName);
			const content = fs.readFileSync(filePath, 'utf-8');
			const { name, type } = parseFrontmatter(content);
			const displayName = name || fileName.replace('.md', '');
			items.push(new AiMemoryItem(filePath, fileName, displayName, type));
		}
		return items;
	}
}
