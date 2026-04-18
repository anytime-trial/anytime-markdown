import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

function readFrontmatterTitle(filePath: string): string | undefined {
	try {
		const content = fs.readFileSync(filePath, { encoding: 'utf-8' });
		if (!content.startsWith('---')) { return undefined; }
		const end = content.indexOf('\n---', 3);
		if (end === -1) { return undefined; }
		const frontmatter = content.slice(3, end);
		const match = /^title:\s*["']?(.+?)["']?\s*$/m.exec(frontmatter);
		return match?.[1];
	} catch {
		return undefined;
	}
}

export class AiNoteItem extends vscode.TreeItem {
	constructor(
		public readonly filePath: string,
		public readonly fileName: string,
		label: string,
	) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.tooltip = filePath;
		this.iconPath = new vscode.ThemeIcon('note');
		this.contextValue = 'noteItem';
		this.command = {
			command: 'anytime-trail.openNotePage',
			title: 'Open Note',
			arguments: [filePath],
		};
	}
}

export class AiNoteProvider implements vscode.TreeDataProvider<AiNoteItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly storageDir: string) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: AiNoteItem): vscode.TreeItem {
		return element;
	}

	getChildren(): AiNoteItem[] {
		if (!fs.existsSync(this.storageDir)) { return []; }

		const files = fs.readdirSync(this.storageDir)
			.filter(f => f.startsWith('anytime-note') && f.endsWith('.md'))
			.sort((a, b) => {
				const numA = Number.parseInt(a.replace('anytime-note-', '').replace('.md', ''), 10);
				const numB = Number.parseInt(b.replace('anytime-note-', '').replace('.md', ''), 10);
				if (!Number.isNaN(numA) && !Number.isNaN(numB)) { return numA - numB; }
				return a.localeCompare(b);
			});

		return files.map(fileName => {
			const filePath = path.join(this.storageDir, fileName);
			const num = fileName.replace('anytime-note-', '').replace('.md', '');
			const title = readFrontmatterTitle(filePath);
			const label = title ? `ページ${num} - ${title}` : `ページ${num}`;
			return new AiNoteItem(filePath, fileName, label);
		});
	}
}
