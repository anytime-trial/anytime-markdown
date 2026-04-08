import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { TimelineProvider, TimelineItem } from './providers/TimelineProvider';
import { GraphProvider, GraphItem } from './providers/GraphProvider';
import { ChangesProvider } from './providers/ChangesProvider';
import { SpecDocsProvider, SpecDocsDragAndDrop } from './providers/SpecDocsProvider';
import { C4Panel } from './c4/C4Panel';
import { C4DataServer } from './server/C4DataServer';
import { TrailPanel } from './trail/TrailPanel';
import { TrailDataServer } from './server/TrailDataServer';
import { registerSpecDocsCommands } from './commands/specDocsCommands';
import { registerChangesCommands, GitOriginalContentProvider } from './commands/changesCommands';
import { registerC4Commands } from './commands/c4Commands';
import { TrailLogger } from './utils/TrailLogger';
import { C4TreeProvider } from './providers/C4TreeProvider';

let dataServer: C4DataServer | undefined;
let trailDataServer: TrailDataServer | undefined;
let extensionDistPath = '';

// ---------------------------------------------------------------------------
//  C4 Data Server helpers
// ---------------------------------------------------------------------------

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

function startDataServer(port: number): void {
	const server = new C4DataServer(() => C4Panel.getDataProvider(), extensionDistPath);
	dataServer = server;
	C4Panel.setDataServer(server);
	server.start(port).then(() => {
		statusBarItem.text = `$(radio-tower) C4 Server: :${port}`;
		statusBarItem.tooltip = `C4 Data Server running on port ${port}`;
		statusBarItem.show();
		const restored = C4Panel.restoreSavedModel();
		void vscode.commands.executeCommand('setContext', 'anytimeTrail.c4ModelLoaded', restored);
		// ドキュメントパス設定を読み取りスキャンを開始
		applyDocsPathConfig();
		// カバレッジウォッチ設定を適用
		applyCoverageConfig();
		// ドキュメントリンククリック時にVS Codeでファイルを開く
		server.onOpenDocLink = (docPath) => {
			const docsDir = vscode.workspace.getConfiguration('anytimeTrail').get<string>('docsPath', '');
			if (!docsDir) return;
			const uri = vscode.Uri.file(path.join(docsDir, docPath));
			vscode.commands.executeCommand('vscode.openWith', uri, 'anytimeMarkdown').then(
				undefined,
				() => {
					// anytimeMarkdown エディタが利用不可の場合は通常のテキストエディタで開く
					vscode.workspace.openTextDocument(uri).then(
						(doc) => vscode.window.showTextDocument(doc),
						() => vscode.window.showWarningMessage(`File not found: ${uri.fsPath}`),
					);
				},
			);
		};
	}).catch((err: Error) => {
		vscode.window.showErrorMessage(`C4 Data Server: ${err.message}`);
	});
}

function applyDocsPathConfig(): void {
	const docsPath = vscode.workspace.getConfiguration('anytimeTrail').get<string>('docsPath', '');
	dataServer?.setDocsPath(docsPath || undefined);
}

function applyCoverageConfig(): void {
	const config = vscode.workspace.getConfiguration('anytimeTrail.coverage');
	const coveragePath = config.get<string>('path', '');

	if (coveragePath) {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
		const absPath = path.isAbsolute(coveragePath)
			? coveragePath
			: path.join(workspaceRoot, coveragePath);
		C4Panel.startCoverageWatch(absPath);
	} else {
		C4Panel.stopCoverageWatch();
	}
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
		timelineTreeView = vscode.window.createTreeView('anytimeTrail.timeline', {
			treeDataProvider: timelineProvider,
		});

		graphProvider = new GraphProvider(context);
		graphTreeView = vscode.window.createTreeView('anytimeTrail.graph', {
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
		'anytime-trail.graphRefresh', () => graphProvider?.refresh()
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.loadCoverage', () => {
			const config = vscode.workspace.getConfiguration('anytimeTrail.coverage');
			const coveragePath = config.get<string>('path', '');
			if (!coveragePath) {
				vscode.window.showWarningMessage('anytimeTrail.coverage.path is not configured.');
				return;
			}
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
			const absPath = path.isAbsolute(coveragePath)
				? coveragePath
				: path.join(workspaceRoot, coveragePath);
			C4Panel.loadCoverageData(absPath);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.runE2eTest', () => {
			const cmd = vscode.workspace.getConfiguration('anytimeTrail.test').get<string>('e2eCommand', 'cd packages/web-app && npm run e2e');
			const terminal = vscode.window.createTerminal('E2E Test');
			terminal.show();
			terminal.sendText(cmd);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.runCoverageTest', () => {
			const cmd = vscode.workspace.getConfiguration('anytimeTrail.test').get<string>('coverageCommand', 'npx jest --coverage --maxWorkers=1');
			const terminal = vscode.window.createTerminal('Coverage Test');
			terminal.show();
			terminal.sendText(cmd);
		}),
	);

	registerChangesCommands(context, {
		changesProvider,
		timelineProvider,
		gitContentProvider,
	});

	registerC4Commands(context, {
		getDataServer: () => dataServer,
		startServer: async () => {
			const config = vscode.workspace.getConfiguration('anytimeTrail.server');
			const port = config.get<number>('port', 19840);
			startDataServer(port);
			// サーバー起動を少し待つ
			await new Promise((resolve) => setTimeout(resolve, 1000));
		},
	});

	// C4 Elements パネル
	const c4TreeProvider = new C4TreeProvider();
	const c4ElementsTreeView = vscode.window.createTreeView('anytimeTrail.c4Elements', {
		treeDataProvider: c4TreeProvider,
	});

	// C4 Data Server
	const serverConfig = vscode.workspace.getConfiguration('anytimeTrail.server');
	if (serverConfig.get<boolean>('enabled', false)) {
		startDataServer(serverConfig.get<number>('port', 19840));
	}

	// Trail Data Server
	trailDataServer = new TrailDataServer(extensionDistPath);
	TrailPanel.setDataServer(trailDataServer);
	const trailPort = vscode.workspace.getConfiguration('anytimeTrail.trailServer').get<number>('port', 19841);
	trailDataServer.start(trailPort).catch((err: Error) => {
		vscode.window.showErrorMessage(`Trail Data Server: ${err.message}`);
	});

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.openTrailViewer', () => {
			TrailPanel.openViewer(true);
		}),
	);

	context.subscriptions.push({
		dispose: () => {
			trailDataServer?.stop().catch(() => {});
		},
	});

	// Watch for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('anytimeTrail.server')) {
				handleServerConfigChange();
			}
			if (e.affectsConfiguration('anytimeTrail.docsPath')) {
				applyDocsPathConfig();
			}
			if (e.affectsConfiguration('anytimeTrail.coverage')) {
				applyCoverageConfig();
			}
		}),
	);

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
				TrailLogger.error('Failed to auto-open git roots', err);
			}
		};
		setTimeout(autoOpenGitRoots, 1000);
	}

	// ファイル保存時にリフレッシュ
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(() => changesProvider?.refresh()),
		specDocsTreeView,
		...(changesProvider && changesTreeView ? [changesTreeView, { dispose: () => changesProvider.dispose() }] : []),
		...(timelineTreeView ? [timelineTreeView] : []),
		...(graphTreeView ? [graphTreeView] : []), graphRefresh,
		c4ElementsTreeView,
		statusBarItem,
	);

	// Claude Code スキルの自動配置
	installClaudeSkills(context);
}

/** 拡張機能同梱の Claude Code スキルを ~/.claude/skills/ にコピーする */
function installClaudeSkills(context: vscode.ExtensionContext): void {
	const skillsSource = path.join(context.extensionUri.fsPath, 'skills');
	if (!fs.existsSync(skillsSource)) return;

	const claudeSkillsDir = path.join(os.homedir(), '.claude', 'skills');

	for (const skillName of fs.readdirSync(skillsSource)) {
		const srcDir = path.join(skillsSource, skillName);
		if (!fs.statSync(srcDir).isDirectory()) continue;

		const destDir = path.join(claudeSkillsDir, skillName);
		if (!fs.existsSync(destDir)) {
			fs.mkdirSync(destDir, { recursive: true });
		}

		const srcFile = path.join(srcDir, 'SKILL.md');
		const destFile = path.join(destDir, 'SKILL.md');
		if (fs.existsSync(srcFile)) {
			fs.copyFileSync(srcFile, destFile);
		}
	}
}

export function deactivate(): void {
	dataServer?.stop().catch((err) => TrailLogger.error('Failed to stop data server', err));
	trailDataServer?.stop().catch((err) => TrailLogger.error('Failed to stop trail data server', err));
	TrailLogger.dispose();
}
