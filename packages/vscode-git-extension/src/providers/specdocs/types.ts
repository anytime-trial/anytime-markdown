import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { showError } from '../../utils/errorHelpers';

export function isMarkdownFile(name: string): boolean {
	const lower = name.toLowerCase();
	return lower.endsWith('.md') || lower.endsWith('.markdown');
}

/** ディレクトリを遡って .git ディレクトリ/ファイルのパスを返す */
export function findGitDir(startDir: string): string | null {
	let dir = startDir;
	while (dir !== path.dirname(dir)) {
		const gitPath = path.join(dir, '.git');
		if (fs.existsSync(gitPath)) return gitPath;
		dir = path.dirname(dir);
	}
	return null;
}

/** .git パスからブランチ名を読み取る */
export function readGitBranch(gitPath: string): string {
	try {
		if (!fs.statSync(gitPath).isDirectory()) return 'HEAD';
		const headPath = path.join(gitPath, 'HEAD');
		const head = fs.readFileSync(headPath, 'utf-8').trim();
		const match = head.match(/^ref: refs\/heads\/(.+)$/);
		return match ? match[1] : head.substring(0, 7);
	} catch {
		return 'HEAD';
	}
}

export class SpecDocsRootItem extends vscode.TreeItem {
	constructor(public readonly rootPath: string, repoName: string) {
		super(repoName, vscode.TreeItemCollapsibleState.Expanded);
		this.contextValue = 'specDocsRoot';
		this.iconPath = new vscode.ThemeIcon('repo');
		this.resourceUri = vscode.Uri.file(rootPath);
	}
}

export class SpecDocsItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly resourceUri: vscode.Uri,
		public readonly isDirectory: boolean,
		collapsibleState: vscode.TreeItemCollapsibleState,
	) {
		super(label, collapsibleState);
		if (isDirectory) {
			this.contextValue = 'folder';
			this.iconPath = vscode.ThemeIcon.Folder;
		} else {
			this.contextValue = 'file';
			this.iconPath = vscode.ThemeIcon.File;
			if (isMarkdownFile(label)) {
				this.command = {
					command: 'anytime-history.specDocsOpenFile',
					title: 'Open',
					arguments: [resourceUri],
				};
			} else {
				this.command = {
					command: 'vscode.open',
					title: 'Open',
					arguments: [resourceUri],
				};
			}
		}
	}
}

/** SpecDocs ツリーで扱うノード型 */
export type SpecDocsNode = SpecDocsRootItem | SpecDocsItem;

export class SpecDocsDragAndDrop implements vscode.TreeDragAndDropController<SpecDocsNode> {
	readonly dropMimeTypes = ['application/vnd.code.tree.anytimegit.specdocs', 'text/uri-list'];
	readonly dragMimeTypes = ['application/vnd.code.tree.anytimegit.specdocs'];

	constructor(private readonly provider: { roots: string[]; refresh(): void }) {}

	handleDrag(source: readonly SpecDocsNode[], dataTransfer: vscode.DataTransfer): void {
		// SpecDocsRootItem はドラッグ対象外
		const items = source.filter((s): s is SpecDocsItem => s instanceof SpecDocsItem);
		if (items.length === 0) return;
		dataTransfer.set(
			'application/vnd.code.tree.anytimegit.specdocs',
			new vscode.DataTransferItem(items.map(s => s.resourceUri.fsPath)),
		);
	}

	/** ドロップターゲットからディレクトリパスを解決する */
	private resolveDropDir(target: SpecDocsNode | undefined, fallbackRoots?: string[]): string | undefined {
		if (target instanceof SpecDocsRootItem) return target.rootPath;
		if (target?.isDirectory) return target.resourceUri.fsPath;
		if (target && !target.isDirectory) return path.dirname(target.resourceUri.fsPath);
		return fallbackRoots?.[0];
	}

	async handleDrop(target: SpecDocsNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
		// 内部ドラッグ（移動）— 外部ドロップより先に判定する
		const raw = dataTransfer.get('application/vnd.code.tree.anytimegit.specdocs');
		if (raw) {
			const sourcePaths: string[] = raw.value;
			if (sourcePaths && sourcePaths.length > 0) {
				const destDir = this.resolveInternalDropDir(target, sourcePaths);
				if (!destDir) return;

				for (const srcPath of sourcePaths) {
					const name = path.basename(srcPath);
					const dest = path.join(destDir, name);
					if (srcPath === dest) continue;
					try {
						fs.renameSync(srcPath, dest);
					} catch (e: unknown) {
						showError('Move failed', e);
					}
				}
				this.provider.refresh();
				return;
			}
		}

		// 外部ファイルのドロップ（コピー）
		const uriList = dataTransfer.get('text/uri-list');
		if (!uriList) return;
		await this.handleExternalDrop(target, uriList);
	}

	/** 内部ドラッグのドロップ先ディレクトリを決定する */
	private resolveInternalDropDir(target: SpecDocsNode | undefined, sourcePaths: string[]): string | undefined {
		const resolved = this.resolveDropDir(target);
		if (resolved) return resolved;

		// ルートにドロップ（複数ルートの場合はソースのルートを使用）
		const roots = this.provider.roots;
		if (roots.length === 0) return undefined;
		const srcRoot = roots.find(r => {
			const nr = r.endsWith(path.sep) ? r : r + path.sep;
			return sourcePaths[0] === r || sourcePaths[0].startsWith(nr);
		});
		return srcRoot;
	}

	private async handleExternalDrop(target: SpecDocsNode | undefined, uriList: vscode.DataTransferItem): Promise<void> {
		const destDir = this.resolveDropDir(target, this.provider.roots);
		if (!destDir) return;

		const uris = await this.parseUriList(uriList);
		if (uris.length === 0) return;

		for (const uri of uris) {
			await this.copyFileWithOverwriteCheck(uri.fsPath, destDir);
		}
		this.provider.refresh();
	}

	/** text/uri-list からファイル URI を解析する */
	private async parseUriList(uriList: vscode.DataTransferItem): Promise<vscode.Uri[]> {
		const raw = await uriList.asString();
		return raw.split(/\r?\n/)
			.map(line => line.trim())
			.filter(line => line && !line.startsWith('#'))
			.map(line => {
				try { return vscode.Uri.parse(line); } catch { return null; }
			})
			.filter((u): u is vscode.Uri => u !== null && u.scheme === 'file');
	}

	/** ファイルをコピーする（上書き確認付き） */
	private async copyFileWithOverwriteCheck(srcPath: string, destDir: string): Promise<void> {
		const name = path.basename(srcPath);
		const dest = path.join(destDir, name);
		if (srcPath === dest) return;

		if (fs.existsSync(dest)) {
			const answer = await vscode.window.showWarningMessage(
				`"${name}" already exists. Overwrite?`,
				{ modal: true },
				'Overwrite',
			);
			if (answer !== 'Overwrite') return;
		}

		try {
			fs.copyFileSync(srcPath, dest);
		} catch (e: unknown) {
			showError('Copy failed', e);
		}
	}
}
