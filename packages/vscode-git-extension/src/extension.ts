import * as vscode from 'vscode';
import * as path from 'node:path';
import { TimelineProvider, TimelineItem } from './providers/TimelineProvider';
import { GraphProvider } from './providers/GraphProvider';
import { ChangesProvider, ChangesFileItem } from './providers/ChangesProvider';
import { SpecDocsProvider, SpecDocsItem, SpecDocsRootItem, SpecDocsDragAndDrop } from './providers/SpecDocsProvider';

/** git の元コンテンツを提供する TextDocumentContentProvider */
class GitOriginalContentProvider implements vscode.TextDocumentContentProvider {
	private contentMap = new Map<string, string>();

	setContent(uriString: string, content: string): void {
		this.contentMap.set(uriString, content);
	}

	provideTextDocumentContent(uri: vscode.Uri): string {
		return this.contentMap.get(uri.toString()) ?? '';
	}
}

/** .md / .markdown ファイルかどうか判定する */
function isMarkdownFile(filePath: string): boolean {
	const lower = filePath.toLowerCase();
	return lower.endsWith('.md') || lower.endsWith('.markdown');
}

/** Anytime Markdown の比較モードでファイルを開く（利用可能な場合） */
async function openWithMarkdownCompare(uri: vscode.Uri, originalContent: string): Promise<boolean> {
	const commands = await vscode.commands.getCommands(true);
	if (commands.includes('anytime-markdown.openCompareMode')) {
		await vscode.commands.executeCommand('anytime-markdown.openCompareMode', uri, originalContent);
		return true;
	}
	return false;
}

/** vscode.diff を使用して差分を表示する */
async function openWithVsCodeDiff(
	gitContentProvider: GitOriginalContentProvider,
	filePath: string,
	currentUri: vscode.Uri,
	originalContent: string,
	diffLabel: string,
): Promise<void> {
	const originalUri = vscode.Uri.parse(`anytime-git-original:${encodeURIComponent(filePath)}?ts=${Date.now()}`);
	gitContentProvider.setContent(originalUri.toString(), originalContent);
	await vscode.commands.executeCommand('vscode.diff', originalUri, currentUri, diffLabel);
}

export function activate(context: vscode.ExtensionContext) {
	// Git 元コンテンツプロバイダー（diff 表示用）
	const gitContentProvider = new GitOriginalContentProvider();
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider('anytime-git-original', gitContentProvider),
	);

	// Git 関連パネル（ワークスペースが開かれている場合のみ初期化）
	const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;

	let changesProvider: ChangesProvider | undefined;
	let changesTreeView: vscode.TreeView<vscode.TreeItem> | undefined;
	let timelineProvider: TimelineProvider | undefined;
	let timelineTreeView: vscode.TreeView<TimelineItem> | undefined;
	let graphProvider: GraphProvider | undefined;
	let graphTreeView: vscode.TreeView<vscode.TreeItem> | undefined;

	if (hasWorkspace) {
		changesProvider = new ChangesProvider();
		changesTreeView = vscode.window.createTreeView('anytimeGit.changes', {
			treeDataProvider: changesProvider,
		});

		// 変更ファイル数をサイドバーバッジに表示 + 消えたファイルのタブを閉じる
		let previousChangedPaths = new Set<string>();
		const updateChangesBadge = () => {
			const count = changesProvider!.getChangesCount();
			changesTreeView!.badge = count > 0
				? { value: count, tooltip: `${count} changes` }
				: undefined;
			changesProvider!.closeRemovedTabs(previousChangedPaths);
			previousChangedPaths = changesProvider!.getChangedPaths();
		};
		changesProvider.onDidChangeTreeData(updateChangesBadge);
		setTimeout(() => {
			updateChangesBadge();
			previousChangedPaths = changesProvider!.getChangedPaths();
		}, 2000);

		timelineProvider = new TimelineProvider();
		timelineTreeView = vscode.window.createTreeView('anytimeGit.timeline', {
			treeDataProvider: timelineProvider,
		});

		graphProvider = new GraphProvider(context);
		graphTreeView = vscode.window.createTreeView('anytimeGit.graph', {
			treeDataProvider: graphProvider,
		});
	}

	// アクティブテキストエディタ変更時にタイムラインを更新
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (!timelineProvider || timelineProvider.isExternalMode) return;
			timelineProvider.refresh(editor?.document.uri ?? null);
		}),
	);

	// マークダウン管理パネル
	const specDocsProvider = new SpecDocsProvider(context);
	const specDocsDragAndDrop = new SpecDocsDragAndDrop(specDocsProvider);
	const specDocsTreeView = vscode.window.createTreeView('anytimeGit.specDocs', {
		treeDataProvider: specDocsProvider,
		dragAndDropController: specDocsDragAndDrop,
	});

	// アクティブルート追跡
	let activeRoot: string | null = specDocsProvider.roots[0] ?? null;

	const setActiveRoot = (rootPath: string | null) => {
		activeRoot = rootPath;
		changesProvider?.setPrimaryRoot(rootPath);
		graphProvider?.setTargetRoot(rootPath);
	};

	let previousRoots: string[] = [];
	specDocsProvider.onDidChangeTreeData(() => {
		const roots = specDocsProvider.roots;
		// ルート一覧が変わった場合のみ changesProvider を更新
		if (JSON.stringify(roots) !== JSON.stringify(previousRoots)) {
			previousRoots = roots;
			changesProvider?.setTargetRoots(roots);
		}
		if (roots.length === 0) {
			setActiveRoot(null);
		} else if (activeRoot && !roots.includes(activeRoot)) {
			setActiveRoot(roots[0]);
		} else if (!activeRoot) {
			setActiveRoot(roots[0]);
		}
	});

	// 初回: git 初期化を待ってからターゲットを設定
	if (changesProvider) {
		setTimeout(() => {
			changesProvider!.setTargetRoots(specDocsProvider.roots);
			previousRoots = specDocsProvider.roots;
			setActiveRoot(activeRoot);
		}, 2000);
	}

	// マークダウン管理: シングルクリックでプレビュー、ダブルクリックで固定タブ
	let lastSpecClickUri: string | null = null;
	let lastSpecClickTime = 0;
	const specDocsOpenFile = vscode.commands.registerCommand(
		'anytime-git.specDocsOpenFile',
		async (uri: vscode.Uri) => {
			const now = Date.now();
			const isDoubleClick = lastSpecClickUri === uri.toString() && (now - lastSpecClickTime) < 500;
			lastSpecClickUri = uri.toString();
			lastSpecClickTime = now;

			await vscode.commands.executeCommand('vscode.open', uri, { preview: !isDoubleClick });

			// ファイルのルートを判定して activeRoot を更新
			const fileRoot = specDocsProvider.findRootForPath(uri.fsPath);
			if (fileRoot && fileRoot !== activeRoot) {
				setActiveRoot(fileRoot);
			}

			// git history を更新
			const fileGitRoot = changesProvider?.findGitRootForPath(uri.fsPath);
			if (fileGitRoot) {
				timelineProvider?.refreshWithGitRoot(uri.fsPath, fileGitRoot);
			}
		}
	);

	const specDocsOpenFolder = vscode.commands.registerCommand(
		'anytime-git.specDocsOpenFolder', () => specDocsProvider.openFolder()
	);
	const specDocsCloneRepo = vscode.commands.registerCommand(
		'anytime-git.specDocsCloneRepo', () => specDocsProvider.cloneRepository()
	);
	const specDocsClose = vscode.commands.registerCommand(
		'anytime-git.specDocsClose', () => specDocsProvider.closeFolder()
	);
	const specDocsRefresh = vscode.commands.registerCommand(
		'anytime-git.specDocsRefresh', () => specDocsProvider.refresh()
	);
	const switchBranch = vscode.commands.registerCommand(
		'anytime-git.switchBranch', (item?: SpecDocsRootItem) => {
			specDocsProvider.switchBranch(item?.rootPath);
		}
	);
	const graphRefresh = vscode.commands.registerCommand(
		'anytime-git.graphRefresh', () => graphProvider?.refresh()
	);
	const toggleMdOnly = vscode.commands.registerCommand(
		'anytime-git.toggleMdOnly', () => {
			specDocsProvider.toggleMdOnly();
			changesProvider?.refresh();
		}
	);
	changesProvider?.setMdOnlyGetter(() => specDocsProvider.mdOnly);

	// ファイル/フォルダ操作
	const specDocsCreateFile = vscode.commands.registerCommand(
		'anytime-git.specDocsCreateFile', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.createFile(item)
	);
	const specDocsCreateFolder = vscode.commands.registerCommand(
		'anytime-git.specDocsCreateFolder', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.createFolder(item)
	);
	const specDocsDelete = vscode.commands.registerCommand(
		'anytime-git.specDocsDelete', (item: SpecDocsItem) => specDocsProvider.deleteItem(item)
	);
	const specDocsRename = vscode.commands.registerCommand(
		'anytime-git.specDocsRename', (item: SpecDocsItem) => specDocsProvider.renameItem(item)
	);
	const specDocsRemoveRoot = vscode.commands.registerCommand(
		'anytime-git.specDocsRemoveRoot', (item: SpecDocsRootItem) => specDocsProvider.removeRoot(item.rootPath)
	);
	const specDocsCopyPath = vscode.commands.registerCommand(
		'anytime-git.specDocsCopyPath', (item: SpecDocsItem) => {
			if (item?.resourceUri) {
				vscode.env.clipboard.writeText(item.resourceUri.fsPath);
			}
		}
	);
	const specDocsCopyFileName = vscode.commands.registerCommand(
		'anytime-git.specDocsCopyFileName', (item: SpecDocsItem) => {
			if (item?.resourceUri) {
				vscode.env.clipboard.writeText(path.basename(item.resourceUri.fsPath));
			}
		}
	);
	const specDocsImportFiles = vscode.commands.registerCommand(
		'anytime-git.specDocsImportFiles', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.importFiles(item)
	);
	const specDocsCut = vscode.commands.registerCommand(
		'anytime-git.specDocsCut', (item: SpecDocsItem) => specDocsProvider.cut(item)
	);
	const specDocsCopy = vscode.commands.registerCommand(
		'anytime-git.specDocsCopy', (item: SpecDocsItem) => specDocsProvider.copy(item)
	);
	const specDocsPaste = vscode.commands.registerCommand(
		'anytime-git.specDocsPaste', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.paste(item)
	);

	// Git 変更コマンド
	const changesRefresh = vscode.commands.registerCommand(
		'anytime-git.changesRefresh', () => changesProvider?.refresh()
	);
	const stageFile = vscode.commands.registerCommand(
		'anytime-git.stageFile', (item: ChangesFileItem) => changesProvider?.stageFile(item)
	);
	const unstageFile = vscode.commands.registerCommand(
		'anytime-git.unstageFile', (item: ChangesFileItem) => changesProvider?.unstageFile(item)
	);
	const stageAll = vscode.commands.registerCommand(
		'anytime-git.stageAll', (gitRoot?: string) => changesProvider?.stageAll(gitRoot)
	);
	const unstageAll = vscode.commands.registerCommand(
		'anytime-git.unstageAll', (gitRoot?: string) => changesProvider?.unstageAll(gitRoot)
	);
	const discardAll = vscode.commands.registerCommand(
		'anytime-git.discardAll', (gitRoot?: string) => changesProvider?.discardAll(gitRoot)
	);
	const discardChanges = vscode.commands.registerCommand(
		'anytime-git.discardChanges', (item: ChangesFileItem) => changesProvider?.discardChanges(item)
	);

	// 変更: シングルクリックでプレビュー、ダブルクリックで固定タブ
	let lastChangesClickUri: string | null = null;
	let lastChangesClickTime = 0;
	const changesOpenFile = vscode.commands.registerCommand(
		'anytime-git.changesOpenFile',
		async (gitRoot: string, filePath: string, group: 'staged' | 'changes', currentUri: vscode.Uri, isMd: boolean, diffLabel: string) => {
			const now = Date.now();
			const uriStr = currentUri.toString();
			const isDoubleClick = lastChangesClickUri === uriStr && (now - lastChangesClickTime) < 500;
			lastChangesClickUri = uriStr;
			lastChangesClickTime = now;

			// git コマンドで変更前コンテンツを取得
			let originalContent: string;
			try {
				const { execFileSync } = await import('node:child_process');
				originalContent = group === 'staged'
					? execFileSync('git', ['show', `HEAD:${filePath}`], { cwd: gitRoot, encoding: 'utf-8' })
					: execFileSync('git', ['show', `:${filePath}`], { cwd: gitRoot, encoding: 'utf-8' });
			} catch {
				originalContent = '';
			}

			if (isMd && isMarkdownFile(currentUri.fsPath)) {
				// Anytime Markdown の比較モードを試行、失敗時は vscode.diff
				const opened = await openWithMarkdownCompare(currentUri, originalContent);
				if (!opened) {
					await openWithVsCodeDiff(gitContentProvider, filePath, currentUri, originalContent, diffLabel);
				}
			} else {
				await openWithVsCodeDiff(gitContentProvider, filePath, currentUri, originalContent, diffLabel);
			}

			// git history を更新
			if (gitRoot) {
				timelineProvider?.refreshWithGitRoot(currentUri.fsPath, gitRoot);
			}
		}
	);

	const commitChanges = vscode.commands.registerCommand(
		'anytime-git.commitChanges', () => changesProvider?.commit()
	);
	const syncChanges = vscode.commands.registerCommand(
		'anytime-git.syncChanges', (gitRoot?: string) => changesProvider?.sync(gitRoot)
	);
	const pushChanges = vscode.commands.registerCommand(
		'anytime-git.pushChanges', () => changesProvider?.push()
	);

	// Timeline: コミットとの比較
	const compareWithCommit = vscode.commands.registerCommand(
		'anytime-git.compareWithCommit',
		async (item: TimelineItem) => {
			const content = await timelineProvider?.getCommitContent(item);
			if (content == null) {
				vscode.window.showWarningMessage('Could not load file content for this commit.');
				return;
			}

			if (isMarkdownFile(item.fileUri.fsPath)) {
				const opened = await openWithMarkdownCompare(item.fileUri, content);
				if (!opened) {
					const shortHash = item.commit.hash.substring(0, 7);
					const label = `${path.basename(item.fileUri.fsPath)} (${shortHash} vs Working)`;
					await openWithVsCodeDiff(gitContentProvider, item.fileUri.fsPath, item.fileUri, content, label);
				}
			} else {
				const shortHash = item.commit.hash.substring(0, 7);
				const label = `${path.basename(item.fileUri.fsPath)} (${shortHash} vs Working)`;
				await openWithVsCodeDiff(gitContentProvider, item.fileUri.fsPath, item.fileUri, content, label);
			}
		}
	);

	// ファイル保存時にリフレッシュ
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(() => changesProvider?.refresh()),
		specDocsTreeView,
		...(changesProvider ? [changesTreeView!, { dispose: () => changesProvider!.dispose() }] : []),
		...(timelineTreeView ? [timelineTreeView] : []),
		specDocsOpenFile, specDocsOpenFolder, specDocsCloneRepo, specDocsClose, specDocsRefresh, switchBranch, toggleMdOnly,
		specDocsCreateFile, specDocsCreateFolder, specDocsDelete, specDocsRename, specDocsRemoveRoot, specDocsCopyPath, specDocsCopyFileName, specDocsImportFiles, specDocsCut, specDocsCopy, specDocsPaste,
		...(graphTreeView ? [graphTreeView] : []), graphRefresh,
		changesRefresh, stageFile, unstageFile, stageAll, unstageAll, discardAll, discardChanges, commitChanges, pushChanges, syncChanges, changesOpenFile,
		compareWithCommit,
	);
}

export function deactivate() {
	// Intentionally empty – VS Code requires this export but no cleanup is needed.
}
