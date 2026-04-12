import * as vscode from 'vscode';
import { TimelineProvider, TimelineItem } from './providers/TimelineProvider';
import { GraphProvider, GraphItem } from './providers/GraphProvider';
import { ChangesProvider } from './providers/ChangesProvider';
import { SpecDocsProvider, SpecDocsDragAndDrop } from './providers/SpecDocsProvider';
import { registerSpecDocsCommands } from './commands/specDocsCommands';
import { registerChangesCommands, GitOriginalContentProvider } from './commands/changesCommands';
import { GitLogger } from './utils/GitLogger';

export async function activate(context: vscode.ExtensionContext) {
	// Git 元コンテンツプロバイダー（diff 表示用）
	const gitContentProvider = new GitOriginalContentProvider();
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider('anytime-history-original', gitContentProvider),
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
		changesTreeView = vscode.window.createTreeView('anytimeHistory.changes', {
			treeDataProvider: changesProvider,
		});

		// 変更ファイル数をサイドバーバッジに表示 + 消えたファイルのタブを閉じる
		let previousChangedPaths = new Set<string>();
		const cp = changesProvider;
		const ctv = changesTreeView;
		const updateChangesBadge = () => {
			const count = cp.getChangesCount();
			ctv.badge = count > 0
				? { value: count, tooltip: `${count} changes` }
				: undefined;
			cp.closeRemovedTabs(previousChangedPaths);
			previousChangedPaths = cp.getChangedPaths();
		};
		cp.onDidChangeTreeData(updateChangesBadge);
		setTimeout(() => {
			updateChangesBadge();
			previousChangedPaths = cp.getChangedPaths();
		}, 2000);

		timelineProvider = new TimelineProvider();
		timelineTreeView = vscode.window.createTreeView('anytimeHistory.timeline', {
			treeDataProvider: timelineProvider,
		});

		graphProvider = new GraphProvider(context);
		graphTreeView = vscode.window.createTreeView('anytimeHistory.graph', {
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
	const specDocsTreeView = vscode.window.createTreeView('anytimeHistory.specDocs', {
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
		const cp = changesProvider;
		setTimeout(() => {
			cp.setTargetRoots(specDocsProvider.roots);
			previousRoots = specDocsProvider.roots;
			setActiveRoot(activeRoot);
		}, 2000);
	}

	// --- コマンド登録 ---
	registerSpecDocsCommands(context, {
		specDocsProvider,
		changesProvider,
		timelineProvider,
		setActiveRoot,
	});

	changesProvider?.setMdOnlyGetter(() => specDocsProvider.mdOnly);

	const graphRefresh = vscode.commands.registerCommand(
		'anytime-history.graphRefresh', () => graphProvider?.refresh()
	);

	registerChangesCommands(context, {
		changesProvider,
		timelineProvider,
		gitContentProvider,
	});

	// Git リポジトリが開かれている場合、自動的にフォルダを開く
	if (hasWorkspace) {
		const autoOpenGitRoots = async () => {
			try {
				const { execFileSync } = await import('node:child_process');
				const folders = vscode.workspace.workspaceFolders;
				if (!folders) return;
				for (const folder of folders) {
					try {
						execFileSync('git', ['rev-parse', '--git-dir'], {
							cwd: folder.uri.fsPath,
							encoding: 'utf-8',
						});
						specDocsProvider.addRoot(folder.uri.fsPath);
					} catch {
						// git リポジトリでないフォルダはスキップ — 正常系
					}
				}
			} catch (err) {
				GitLogger.error('Failed to auto-open git roots', err);
			}
		};
		setTimeout(autoOpenGitRoots, 1000);
	}

	// ファイル保存時にリフレッシュ
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(() => changesProvider?.refresh()),
		specDocsTreeView,
		{ dispose: () => specDocsProvider.dispose() },
		...(changesProvider && changesTreeView ? [changesTreeView, { dispose: () => changesProvider.dispose() }] : []),
		...(timelineTreeView ? [timelineTreeView] : []),
		...(graphTreeView ? [graphTreeView] : []), graphRefresh,
	);
}

export function deactivate(): void {
	GitLogger.dispose();
}
