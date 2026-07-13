import * as vscode from 'vscode';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { formatLocalDateTimeHyphen } from '../dateFormat';

const execFileAsync = promisify(execFile);

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
		clickCommand: string,
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
			command: clickCommand,
			title: 'Compare with this commit',
			arguments: [this],
		};
	}
}

/**
 * `YYYY-MM-DD HH:mm` 形式。Date のローカル getter は WSL 上の Extension Host
 * (system TZ = UTC) で UTC 値を返すため、TZ を明示解決する formatLocalDateTimeHyphen を使う。
 */
function formatDate(date: Date): string {
	return formatLocalDateTimeHyphen(date) ?? '';
}

export class TimelineProvider implements vscode.TreeDataProvider<TimelineItem> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private fileUri: vscode.Uri | null = null;
	private items: TimelineItem[] = [];

	/** 明示的に外部リポジトリ指定された git root（refreshWithGitRoot 経由）*/
	private gitRoot: string | null = null;
	/** vscode.git API でリポジトリが見つからなかったとき検出した git root */
	private resolvedGitRoot: string | null = null;

	constructor(
		private readonly clickCommand: string,
		private readonly logError: (msg: string, err: unknown) => void = (msg, err) => {
			// フォールバック: console.error。各拡張は OutputChannel を渡すこと推奨
			console.error(msg, err);
		},
	) {}

	/** 外部リポジトリ（マークダウン管理）の履歴表示中かどうか */
	get isExternalMode(): boolean { return this.gitRoot !== null; }

	refresh(uri: vscode.Uri | null): void {
		this.fileUri = uri;
		this.gitRoot = null;
		this.resolvedGitRoot = null;
		this.items = [];
		this._onDidChangeTreeData.fire();
	}

	/** git コマンドベースで履歴を表示（外部リポジトリ対応） */
	refreshWithGitRoot(fileAbsPath: string, gitRoot: string): void {
		this.fileUri = vscode.Uri.file(fileAbsPath);
		this.gitRoot = gitRoot;
		this.resolvedGitRoot = null;
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

		// 明示指定された外部リポジトリ
		if (this.gitRoot) {
			return this.getChildrenFromGitCommand(this.gitRoot, this.fileUri);
		}

		// vscode.git API（ワークスペース内）
		const repo = await this.getRepository(this.fileUri);
		if (repo) {
			const relativePath = path.relative(repo.rootUri.fsPath, this.fileUri.fsPath).replaceAll("\\", '/');
			try {
				const commits = await repo.log({ path: relativePath });
				this.items = commits.map(c => new TimelineItem(c, this.fileUri!, this.clickCommand));
				return this.items;
			} catch (err) {
				this.logError('[TimelineProvider] vscode.git log failed', err);
				return [];
			}
		}

		// フォールバック: ワークスペース外のファイル → git rev-parse で root 検出
		const detected = await this.detectGitRoot(this.fileUri.fsPath);
		if (detected) {
			this.resolvedGitRoot = detected;
			return this.getChildrenFromGitCommand(detected, this.fileUri);
		}
		return [];
	}

	private async getChildrenFromGitCommand(gitRoot: string, fileUri: vscode.Uri): Promise<TimelineItem[]> {
		const relativePath = path.relative(gitRoot, fileUri.fsPath).replaceAll("\\", '/');
		try {
			const result = await execFileAsync(
				'git', ['log', '--format=%H%n%s%n%an%n%aI', '-50', '--', relativePath],
				{ cwd: gitRoot, encoding: 'utf-8' },
			) as { stdout: string; stderr: string };
			const lines = result.stdout.trim().split('\n');
			const commits: TimelineItem[] = [];
			for (let i = 0; i + 3 < lines.length; i += 4) {
				const hash = lines[i];
				const message = lines[i + 1];
				const authorName = lines[i + 2];
				const authorDate = new Date(lines[i + 3]);
				commits.push(new TimelineItem(
					{ hash, message, authorName, authorDate },
					fileUri,
					this.clickCommand,
				));
			}
			this.items = commits;
			return this.items;
		} catch (err) {
			this.logError(`[TimelineProvider] git log command failed (gitRoot=${gitRoot}, relativePath=${relativePath})`, err);
			return [];
		}
	}

	private async detectGitRoot(absPath: string): Promise<string | null> {
		try {
			const dir = path.dirname(absPath);
			const result = await execFileAsync(
				'git', ['rev-parse', '--show-toplevel'],
				{ cwd: dir, encoding: 'utf-8' },
			) as { stdout: string; stderr: string };
			const root = result.stdout.trim();
			return root || null;
		} catch {
			// git リポジトリでない場合 — 正常系のためログ不要
			return null;
		}
	}

	async getCommitContent(item: TimelineItem): Promise<string | null> {
		const effectiveGitRoot = this.gitRoot ?? this.resolvedGitRoot;
		// git コマンドベース
		if (effectiveGitRoot) {
			const relativePath = path.relative(effectiveGitRoot, item.fileUri.fsPath).replaceAll("\\", '/');
			try {
				const result = await execFileAsync(
					'git', ['show', `${item.commit.hash}:${relativePath}`],
					{ cwd: effectiveGitRoot, encoding: 'utf-8' },
				) as { stdout: string; stderr: string };
				return result.stdout;
			} catch (err) {
				this.logError(`[TimelineProvider] git show command failed (gitRoot=${effectiveGitRoot}, relativePath=${relativePath}, hash=${item.commit.hash})`, err);
				return null;
			}
		}
		// vscode.git API
		const repo = await this.getRepository(item.fileUri);
		if (!repo) { return null; }
		const relativePath = path.relative(repo.rootUri.fsPath, item.fileUri.fsPath).replaceAll("\\", '/');
		try {
			return await repo.show(item.commit.hash, relativePath);
		} catch (err) {
			this.logError(`[TimelineProvider] vscode.git show failed (relativePath=${relativePath}, hash=${item.commit.hash})`, err);
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
