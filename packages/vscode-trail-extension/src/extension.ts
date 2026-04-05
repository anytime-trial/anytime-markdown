import * as vscode from 'vscode';
import * as path from 'node:path';
import { TimelineProvider, TimelineItem } from './providers/TimelineProvider';
import { GraphProvider, GraphItem } from './providers/GraphProvider';
import { ChangesProvider, ChangesFileItem } from './providers/ChangesProvider';
import { SpecDocsProvider, SpecDocsItem, SpecDocsRootItem, SpecDocsDragAndDrop } from './providers/SpecDocsProvider';
import { C4Panel } from './c4/C4Panel';
import { C4ElementsProvider } from './providers/C4ElementsProvider';
import { C4DataServer } from './server/C4DataServer';

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

let dataServer: C4DataServer | undefined;
let extensionDistPath = '';

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
	const originalUri = vscode.Uri.parse(`anytime-trail-original:${encodeURIComponent(filePath)}?ts=${Date.now()}`);
	gitContentProvider.setContent(originalUri.toString(), originalContent);
	await vscode.commands.executeCommand('vscode.diff', originalUri, currentUri, diffLabel);
}

// ---------------------------------------------------------------------------
//  C4 Data Server helpers
// ---------------------------------------------------------------------------

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

function startDataServer(port: number): void {
	dataServer = new C4DataServer(() => C4Panel.getDataProvider(), extensionDistPath);
	C4Panel.setDataServer(dataServer);
	dataServer.start(port).then(() => {
		statusBarItem.text = `$(radio-tower) C4 Server: :${port}`;
		statusBarItem.tooltip = `C4 Data Server running on port ${port}`;
		statusBarItem.show();
	}).catch((err: Error) => {
		vscode.window.showErrorMessage(`C4 Data Server: ${err.message}`);
	});
}

function stopDataServer(): void {
	dataServer?.stop().catch(() => {});
	dataServer = undefined;
	statusBarItem.hide();
}

function handleServerConfigChange(): void {
	const config = vscode.workspace.getConfiguration('anytimeTrail.server');
	const enabled = config.get<boolean>('enabled', false);
	const port = config.get<number>('port', 19840);

	if (enabled && !dataServer?.isRunning) {
		startDataServer(port);
	} else if (!enabled && dataServer?.isRunning) {
		stopDataServer();
	} else if (enabled && dataServer?.isRunning) {
		// Port may have changed — restart
		stopDataServer();
		startDataServer(port);
	}
}

export function activate(context: vscode.ExtensionContext) {
	extensionDistPath = path.join(context.extensionUri.fsPath, 'dist');

	// Git 元コンテンツプロバイダー（diff 表示用）
	const gitContentProvider = new GitOriginalContentProvider();
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider('anytime-trail-original', gitContentProvider),
	);

	// Git 関連パネル（ワークスペースが開かれている場合のみ初期化）
	const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;

	let changesProvider: ChangesProvider | undefined;
	let changesTreeView: vscode.TreeView<vscode.TreeItem> | undefined;
	let timelineProvider: TimelineProvider | undefined;
	let timelineTreeView: vscode.TreeView<TimelineItem> | undefined;
	let graphProvider: GraphProvider | undefined;
	let graphTreeView: vscode.TreeView<GraphItem> | undefined;

	if (hasWorkspace) {
		changesProvider = new ChangesProvider();
		changesTreeView = vscode.window.createTreeView('anytimeTrail.changes', {
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
		timelineTreeView = vscode.window.createTreeView('anytimeTrail.timeline', {
			treeDataProvider: timelineProvider,
		});

		graphProvider = new GraphProvider(context);
		graphTreeView = vscode.window.createTreeView('anytimeTrail.graph', {
			treeDataProvider: graphProvider,
		});

		// (highlightFiles は standalone viewer 移行により削除)
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
	const specDocsTreeView = vscode.window.createTreeView('anytimeTrail.specDocs', {
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
		'anytime-trail.specDocsOpenFile',
		async (uri: vscode.Uri) => {
			const now = Date.now();
			const isDoubleClick = lastSpecClickUri === uri.toString() && (now - lastSpecClickTime) < 500;
			lastSpecClickUri = uri.toString();
			lastSpecClickTime = now;

			if (isMarkdownFile(uri.fsPath)) {
				// Markdown ファイルは Anytime Markdown エディタで開く
				const commands = await vscode.commands.getCommands(true);
				if (commands.includes('anytime-markdown.openEditorWithFile')) {
					await vscode.commands.executeCommand('anytime-markdown.openEditorWithFile', uri);
				} else {
					await vscode.commands.executeCommand('vscode.open', uri, { preview: !isDoubleClick });
				}
			} else {
				await vscode.commands.executeCommand('vscode.open', uri, { preview: !isDoubleClick });
			}

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
		'anytime-trail.specDocsOpenFolder', () => specDocsProvider.openFolder()
	);
	const specDocsCloneRepo = vscode.commands.registerCommand(
		'anytime-trail.specDocsCloneRepo', () => specDocsProvider.cloneRepository()
	);
	const specDocsClose = vscode.commands.registerCommand(
		'anytime-trail.specDocsClose', () => specDocsProvider.closeFolder()
	);
	const specDocsRefresh = vscode.commands.registerCommand(
		'anytime-trail.specDocsRefresh', () => specDocsProvider.refresh()
	);
	const switchBranch = vscode.commands.registerCommand(
		'anytime-trail.switchBranch', (item?: SpecDocsRootItem) => {
			specDocsProvider.switchBranch(item?.rootPath);
		}
	);
	const graphRefresh = vscode.commands.registerCommand(
		'anytime-trail.graphRefresh', () => graphProvider?.refresh()
	);
	const toggleMdOnly = vscode.commands.registerCommand(
		'anytime-trail.toggleMdOnly', () => {
			specDocsProvider.toggleMdOnly();
			changesProvider?.refresh();
		}
	);
	changesProvider?.setMdOnlyGetter(() => specDocsProvider.mdOnly);

	// ファイル/フォルダ操作
	const specDocsCreateFile = vscode.commands.registerCommand(
		'anytime-trail.specDocsCreateFile', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.createFile(item)
	);
	const specDocsCreateFolder = vscode.commands.registerCommand(
		'anytime-trail.specDocsCreateFolder', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.createFolder(item)
	);
	const specDocsDelete = vscode.commands.registerCommand(
		'anytime-trail.specDocsDelete', (item: SpecDocsItem) => specDocsProvider.deleteItem(item)
	);
	const specDocsRename = vscode.commands.registerCommand(
		'anytime-trail.specDocsRename', (item: SpecDocsItem) => specDocsProvider.renameItem(item)
	);
	const specDocsRemoveRoot = vscode.commands.registerCommand(
		'anytime-trail.specDocsRemoveRoot', (item: SpecDocsRootItem) => specDocsProvider.removeRoot(item.rootPath)
	);
	const specDocsCopyPath = vscode.commands.registerCommand(
		'anytime-trail.specDocsCopyPath', (item: SpecDocsItem) => {
			if (item?.resourceUri) {
				vscode.env.clipboard.writeText(item.resourceUri.fsPath);
			}
		}
	);
	const specDocsCopyFileName = vscode.commands.registerCommand(
		'anytime-trail.specDocsCopyFileName', (item: SpecDocsItem) => {
			if (item?.resourceUri) {
				vscode.env.clipboard.writeText(path.basename(item.resourceUri.fsPath));
			}
		}
	);
	const specDocsImportFiles = vscode.commands.registerCommand(
		'anytime-trail.specDocsImportFiles', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.importFiles(item)
	);
	const specDocsCut = vscode.commands.registerCommand(
		'anytime-trail.specDocsCut', (item: SpecDocsItem) => specDocsProvider.cut(item)
	);
	const specDocsCopy = vscode.commands.registerCommand(
		'anytime-trail.specDocsCopy', (item: SpecDocsItem) => specDocsProvider.copy(item)
	);
	const specDocsPaste = vscode.commands.registerCommand(
		'anytime-trail.specDocsPaste', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.paste(item)
	);

	// Git 変更コマンド
	const changesRefresh = vscode.commands.registerCommand(
		'anytime-trail.changesRefresh', () => changesProvider?.refresh()
	);
	const stageFile = vscode.commands.registerCommand(
		'anytime-trail.stageFile', (item: ChangesFileItem) => changesProvider?.stageFile(item)
	);
	const unstageFile = vscode.commands.registerCommand(
		'anytime-trail.unstageFile', (item: ChangesFileItem) => changesProvider?.unstageFile(item)
	);
	const stageAll = vscode.commands.registerCommand(
		'anytime-trail.stageAll', (gitRoot?: string) => changesProvider?.stageAll(gitRoot)
	);
	const unstageAll = vscode.commands.registerCommand(
		'anytime-trail.unstageAll', (gitRoot?: string) => changesProvider?.unstageAll(gitRoot)
	);
	const discardAll = vscode.commands.registerCommand(
		'anytime-trail.discardAll', (gitRoot?: string) => changesProvider?.discardAll(gitRoot)
	);
	const discardChanges = vscode.commands.registerCommand(
		'anytime-trail.discardChanges', (item: ChangesFileItem) => changesProvider?.discardChanges(item)
	);

	// 変更: シングルクリックでプレビュー、ダブルクリックで固定タブ
	let lastChangesClickUri: string | null = null;
	let lastChangesClickTime = 0;
	const changesOpenFile = vscode.commands.registerCommand(
		'anytime-trail.changesOpenFile',
		async (gitRoot: string, filePath: string, group: 'staged' | 'changes', currentUri: vscode.Uri, isMd: boolean, diffLabel: string) => {
			const now = Date.now();
			const uriStr = currentUri.toString();
			const _isDoubleClick = lastChangesClickUri === uriStr && (now - lastChangesClickTime) < 500;
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
		'anytime-trail.commitChanges', () => changesProvider?.commit()
	);
	const syncChanges = vscode.commands.registerCommand(
		'anytime-trail.syncChanges', (gitRoot?: string) => changesProvider?.sync(gitRoot)
	);
	const pushChanges = vscode.commands.registerCommand(
		'anytime-trail.pushChanges', () => changesProvider?.push()
	);

	// Timeline: コミットとの比較
	const compareWithCommit = vscode.commands.registerCommand(
		'anytime-trail.compareWithCommit',
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

	// C4 Model コマンド
	const c4Import = vscode.commands.registerCommand('anytime-trail.c4Import', () =>
		C4Panel.importMermaid(),
	);
	const c4Analyze = vscode.commands.registerCommand('anytime-trail.c4Analyze', () =>
		C4Panel.analyzeWorkspace(),
	);
	const c4Export = vscode.commands.registerCommand('anytime-trail.c4Export', () =>
		C4Panel.exportData(),
	);

	// DSM コマンド
	const dsmAnalyze = vscode.commands.registerCommand('anytime-trail.dsmAnalyze', () => {
		C4Panel.analyzeWorkspace();
	});

	// C4 Elements ツリービュー
	const c4ElementsProvider = new C4ElementsProvider();
	C4Panel.setTreeProvider(c4ElementsProvider);
	const c4ElementsTreeView = vscode.window.createTreeView('anytimeTrail.c4Elements', {
		treeDataProvider: c4ElementsProvider,
	});

	// 保存済みC4モデルを自動読み込み
	const savedModel = C4Panel.loadSavedModel();
	if (savedModel) {
		c4ElementsProvider.setModel(savedModel.model, savedModel.boundaries);
	}

	const c4ElementsRefresh = vscode.commands.registerCommand('anytime-trail.c4ElementsRefresh', () =>
		c4ElementsProvider.refresh(),
	);
	const c4SetLevel = vscode.commands.registerCommand('anytime-trail.c4SetLevel', async () => {
		const current = c4ElementsProvider.getLevel();
		const items = [1, 2, 3, 4].map(l => ({
			label: `L${l}`,
			description: l === current ? '(current)' : undefined,
			level: l,
		}));
		const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select C4 detail level' });
		if (picked) {
			c4ElementsProvider.setLevel(picked.level);
		}
	});

	// C4 Data Server
	const serverConfig = vscode.workspace.getConfiguration('anytimeTrail.server');
	if (serverConfig.get<boolean>('enabled', false)) {
		startDataServer(serverConfig.get<number>('port', 19840));
	}

	// Watch for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('anytimeTrail.server')) {
				handleServerConfigChange();
			}
		}),
	);

	// Git リポジトリが開かれている場合、自動的にフォルダを開く
	if (hasWorkspace) {
		const autoOpenGitRoots = async () => {
			try {
				const { execFileSync } = await import('node:child_process');
				for (const folder of vscode.workspace.workspaceFolders!) {
					try {
						execFileSync('git', ['rev-parse', '--git-dir'], {
							cwd: folder.uri.fsPath,
							encoding: 'utf-8',
						});
						specDocsProvider.addRoot(folder.uri.fsPath);
					} catch {
						// git リポジトリでないフォルダはスキップ
					}
				}
			} catch {
				// ignore
			}
		};
		setTimeout(autoOpenGitRoots, 1000);
	}

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
		c4Import, c4Analyze, c4Export,
		dsmAnalyze,
		c4ElementsTreeView, c4ElementsRefresh, c4SetLevel,
		statusBarItem,
	);
}

export function deactivate() {
	dataServer?.stop().catch(() => {});
}
