import * as vscode from 'vscode';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

interface GitExtension {
	getAPI(version: 1): GitAPI;
}
interface GitAPI {
	getRepository(uri: vscode.Uri): Repository | null;
}
interface Repository {
	rootUri: vscode.Uri;
	show(ref: string, filePath: string): Promise<string>;
	log(options?: { maxEntries?: number; path?: string }): Promise<Commit[]>;
}
interface Commit {
	hash: string;
	message: string;
	authorName?: string;
	authorDate?: Date;
}

export class TimelineItem extends vscode.TreeItem {
	constructor(
		public readonly commit: Commit,
		public readonly fileUri: vscode.Uri,
	) {
		const shortMsg = commit.message.split('\n')[0];
		super(shortMsg, vscode.TreeItemCollapsibleState.None);

		const date = commit.authorDate
			? formatDate(commit.authorDate)
			: '';
		const author = commit.authorName ?? '';
		this.description = `${date}  ${author}`;
		this.tooltip = `${commit.hash.substring(0, 7)}  ${shortMsg}\n${author}  ${date}`;
		this.iconPath = new vscode.ThemeIcon('git-commit');
		this.command = {
			command: 'anytime-markdown.compareWithCommit',
			title: 'Compare with this commit',
			arguments: [this],
		};
	}
}

function formatDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	const h = String(date.getHours()).padStart(2, '0');
	const min = String(date.getMinutes()).padStart(2, '0');
	return `${y}-${m}-${d} ${h}:${min}`;
}

export class TimelineProvider implements vscode.TreeDataProvider<TimelineItem> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private fileUri: vscode.Uri | null = null;
	private items: TimelineItem[] = [];

	private gitRoot: string | null = null;

	/** 外部リポジトリ（マークダウン管理）の履歴表示中かどうか */
	get isExternalMode(): boolean { return this.gitRoot !== null; }

	refresh(uri: vscode.Uri | null): void {
		this.fileUri = uri;
		this.gitRoot = null;
		this.items = [];
		this._onDidChangeTreeData.fire();
	}

	/** git コマンドベースで履歴を表示（外部リポジトリ対応） */
	refreshWithGitRoot(fileAbsPath: string, gitRoot: string): void {
		this.fileUri = vscode.Uri.file(fileAbsPath);
		this.gitRoot = gitRoot;
		this.items = [];
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TimelineItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<TimelineItem[]> {
		if (!this.fileUri) {
			return [];
		}
		if (this.items.length > 0) {
			return this.items;
		}

		// git コマンドベース（外部リポジトリ）
		if (this.gitRoot) {
			return this.getChildrenFromGitCommand();
		}

		// vscode.git API（メインプロジェクト）
		const repo = await this.getRepository(this.fileUri);
		if (!repo) {
			return [];
		}

		const relativePath = path.relative(repo.rootUri.fsPath, this.fileUri.fsPath).replaceAll("\\", '/');
		try {
			const commits = await repo.log({ path: relativePath });
			this.items = commits.map(c => new TimelineItem(c, this.fileUri!));
			return this.items;
		} catch {
			return [];
		}
	}

	private getChildrenFromGitCommand(): TimelineItem[] {
		if (!this.gitRoot || !this.fileUri) { return []; }
		const relativePath = path.relative(this.gitRoot, this.fileUri.fsPath).replaceAll("\\", '/');
		try {
			const output = execFileSync(
				'git', ['log', '--format=%H%n%s%n%an%n%aI', '-50', '--', relativePath],
				{ cwd: this.gitRoot, encoding: 'utf-8' },
			);
			const lines = output.trim().split('\n');
			const commits: TimelineItem[] = [];
			for (let i = 0; i + 3 < lines.length; i += 4) {
				const hash = lines[i];
				const message = lines[i + 1];
				const authorName = lines[i + 2];
				const authorDate = new Date(lines[i + 3]);
				commits.push(new TimelineItem(
					{ hash, message, authorName, authorDate },
					this.fileUri,
				));
			}
			this.items = commits;
			return this.items;
		} catch {
			return [];
		}
	}

	async getCommitContent(item: TimelineItem): Promise<string | null> {
		// git コマンドベース
		if (this.gitRoot) {
			const relativePath = path.relative(this.gitRoot, item.fileUri.fsPath).replaceAll("\\", '/');
			try {
				return execFileSync('git', ['show', `${item.commit.hash}:${relativePath}`], { cwd: this.gitRoot, encoding: 'utf-8' });
			} catch {
				return null;
			}
		}
		// vscode.git API
		const repo = await this.getRepository(item.fileUri);
		if (!repo) { return null; }
		const relativePath = path.relative(repo.rootUri.fsPath, item.fileUri.fsPath).replaceAll("\\", '/');
		try {
			return await repo.show(item.commit.hash, relativePath);
		} catch {
			return null;
		}
	}

	private async getRepository(uri: vscode.Uri): Promise<Repository | null> {
		const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
		if (!gitExtension) { return null; }
		if (!gitExtension.isActive) {
			await gitExtension.activate();
		}
		return gitExtension.exports.getAPI(1).getRepository(uri);
	}
}
