import * as vscode from 'vscode';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitLogger } from '../utils/GitLogger';

const GIT_LOG_LIMIT = 100;
const GIT_LOG_MAX_BUFFER = 1024 * 1024;

/** 拡張機能ルートからの相対パスで SVG アイコンを返す */
let extensionPath = '';
function iconPath(name: string): { light: vscode.Uri; dark: vscode.Uri } {
	const p = vscode.Uri.file(path.join(extensionPath, 'images', name));
	return { light: p, dark: p };
}

function resolveIcon(hash: string, refs: string, isLocal: boolean): { light: vscode.Uri; dark: vscode.Uri } {
	if (!hash) {
		return iconPath('graph-empty.svg');
	}
	if (refs) {
		const isHead = refs.includes('HEAD');
		if (isHead) {
			// HEAD: ローカル=青中抜き、リモート済み=赤中抜き
			return iconPath(isLocal ? 'graph-head-outline.svg' : 'graph-head-remote.svg');
		}
		// ブランチ参照あり
		return iconPath(isLocal ? 'graph-branch-local2.svg' : 'graph-branch-remote2.svg');
	}
	// 通常コミット: ローカル=青塗り、リモート済み=赤塗り
	return iconPath(isLocal ? 'graph-dot.svg' : 'graph-dot-remote.svg');
}

export class GraphItem extends vscode.TreeItem {
	constructor(
		public readonly graph: string,
		public readonly hash: string,
		public readonly message: string,
		public readonly refs: string,
		public readonly date: string,
		public readonly author: string,
		isLocal: boolean,
	) {
		super('', vscode.TreeItemCollapsibleState.None);

		this.iconPath = resolveIcon(hash, refs, isLocal);

		const statusText = isLocal ? ' (local)' : ' (remote)';

		if (!hash) {
			// グラフのみの行（マージライン等）
			this.label = graph;
			this.description = '';
			this.tooltip = '';
		} else if (refs) {
			this.label = `${graph} ${message}`;
			this.description = `[${refs}]  ${date}  ${author}`;
			this.tooltip = `${hash.substring(0, 7)}  ${message}${statusText}\n${refs}\n${author}  ${date}`;
		} else {
			this.label = `${graph} ${message}`;
			this.description = `${date}  ${author}`;
			this.tooltip = `${hash.substring(0, 7)}  ${message}${statusText}\n${author}  ${date}`;
		}
	}
}

/** ローカルのみのコミットハッシュを取得する */
function collectLocalOnlyHashes(gitRoot: string): Set<string> {
	const hashes = new Set<string>();
	try {
		const output = execFileSync(
			'git', ['log', '--format=%h', '--branches', '--not', '--remotes'],
			{ cwd: gitRoot, encoding: 'utf-8' },
		);
		for (const h of output.split('\n')) {
			const trimmed = h.trim();
			if (trimmed) { hashes.add(trimmed); }
		}
	} catch { /* リモートなしの場合は全てローカル扱い — 正常系 */ }
	return hashes;
}

/** git log の1行をパースして GraphItem を返す */
function parseGitLogLine(line: string, localOnlyHashes: Set<string>): GraphItem | null {
	if (!line.trim()) return null;

	const nullIdx = line.indexOf('\0');
	if (nullIdx === -1) {
		// グラフのみの行（マージライン等）
		return new GraphItem(line.trim(), '', '', '', '', '', false);
	}

	const parts = line.split('\0');
	const graphAndHash = parts[0];
	const message = parts[1] ?? '';
	const refs = (parts[2] ?? '').trim().replaceAll(/^\(|\)$/g, '');
	const date = parts[3] ?? '';
	const author = parts[4] ?? '';

	// グラフ文字とハッシュを分離
	const hashMatch = /([0-9a-f]{7,})$/.exec(graphAndHash.trimEnd());
	const hash = hashMatch ? hashMatch[1] : '';
	let graph = hashMatch ? graphAndHash.substring(0, hashMatch.index).trimEnd() : graphAndHash;
	if (graph.replaceAll(/\s/g, '') === '*') {
		graph = '';
	}

	const isLocal = hash ? localOnlyHashes.has(hash) : false;
	return new GraphItem(graph, hash, message, refs, date, author, isLocal);
}

/** git log 出力全体をパースして GraphItem 配列を返す */
function parseGitLogOutput(output: string, localOnlyHashes: Set<string>): GraphItem[] {
	const items: GraphItem[] = [];
	for (const line of output.split('\n')) {
		const item = parseGitLogLine(line, localOnlyHashes);
		if (item) items.push(item);
	}
	return items;
}

export class GraphProvider implements vscode.TreeDataProvider<GraphItem> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private gitRoot: string | null = null;
	private items: GraphItem[] = [];

	constructor(context: vscode.ExtensionContext) {
		extensionPath = context.extensionPath;
	}

	getGitRoot(): string | null {
		return this.gitRoot;
	}

	setTargetRoot(rootPath: string | null): void {
		this.gitRoot = null;
		if (rootPath) {
			try {
				this.gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: rootPath, encoding: 'utf-8' }).trim();
			} catch (err) { GitLogger.warn(`Not a git repo: ${rootPath}`); }
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
			const localOnlyHashes = collectLocalOnlyHashes(this.gitRoot);
			const output = execFileSync(
				'git', ['log', '--graph', '--all', '--oneline', '--decorate', `--format=%h%x00%s%x00%d%x00%ar%x00%an`, `-${GIT_LOG_LIMIT}`],
				{ cwd: this.gitRoot, encoding: 'utf-8', maxBuffer: GIT_LOG_MAX_BUFFER },
			);
			this.items = parseGitLogOutput(output, localOnlyHashes);
			return this.items;
		} catch {
			return [];
		}
	}

	dispose(): void { /* nothing */ }
}
