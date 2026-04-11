import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { C4Panel } from './c4/C4Panel';
import { C4DataServer } from './server/C4DataServer';
import { TrailPanel } from './trail/TrailPanel';
import { TrailDataServer } from './server/TrailDataServer';
import { TrailDatabase } from './trail/TrailDatabase';
import { registerC4Commands } from './commands/c4Commands';
import { TrailLogger } from './utils/TrailLogger';
import { C4TreeProvider } from './providers/C4TreeProvider';
import { DashboardProvider } from './trail/DashboardProvider';
import { AiMemoryProvider, AiMemoryItem } from './providers/AiMemoryProvider';
import type { IRemoteTrailStore } from './trail/IRemoteTrailStore';
import { SupabaseTrailStore } from './trail/SupabaseTrailStore';
import { PostgresTrailStore } from './trail/PostgresTrailStore';
import { SyncService } from './trail/SyncService';

let dataServer: C4DataServer | undefined;
let trailDataServer: TrailDataServer | undefined;
let trailDb: TrailDatabase | undefined;
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

export async function activate(context: vscode.ExtensionContext) {
	extensionDistPath = path.join(context.extensionUri.fsPath, 'dist');

	// --- コマンド登録 ---
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

	// Trail Database + Data Server (non-blocking initialization)
	trailDb = new TrailDatabase(extensionDistPath);
	const gitRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	trailDataServer = new TrailDataServer(extensionDistPath, trailDb, gitRoot);
	TrailPanel.setDataServer(trailDataServer);
	const trailPort = vscode.workspace.getConfiguration('anytimeTrail.trailServer').get<number>('port', 19841);

	// Supabase store（設定が揃っている場合のみ初期化）
	const remoteConfig = vscode.workspace.getConfiguration('anytimeTrail.remote');
	let supabaseStore: SupabaseTrailStore | undefined;
	if (remoteConfig.get<string>('provider', 'none') === 'supabase') {
		const url = remoteConfig.get<string>('supabaseUrl', '');
		const key = remoteConfig.get<string>('supabaseAnonKey', '');
		if (url && key) {
			supabaseStore = new SupabaseTrailStore(url, key);
		}
	}

	// Dashboard panel
	const dashboardProvider = new DashboardProvider(trailDb, supabaseStore);
	const dashboardTreeView = vscode.window.createTreeView('anytimeTrail.dashboard', {
		treeDataProvider: dashboardProvider,
	});

	// Initialize DB and start server in background — do not block activate
	void (async () => {
		try {
			TrailLogger.info(`Trail DB: initializing with distPath=${extensionDistPath}`);
			await trailDb!.init();
			dashboardProvider.updateSqliteStatus('Ready', trailDb!.getLastImportedAt());
			TrailLogger.info('Trail DB: initialized');
		} catch (err) {
			TrailLogger.error('Failed to initialize trail database', err);
			dashboardProvider.updateSqliteStatus('Error');
		}
		try {
			await trailDataServer!.start(trailPort);
			TrailLogger.info(`Trail Data Server started on port ${trailPort}`);
		} catch (err) {
			TrailLogger.error('Trail Data Server failed to start', err);
		}
	})();

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.openTrailViewer', () => {
			TrailPanel.openViewer(true);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.importTrailData', async () => {
			if (!trailDb) return;
			dashboardProvider.setImporting(true);
			try {
				const result = await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Trail: Importing JSONL logs',
						cancellable: false,
					},
					async (progress) => {
						const gitRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
						return trailDb!.importAll((message, increment) => {
							progress.report({ message, increment });
						}, gitRoot);
					},
				);
				TrailLogger.info(`Trail DB: import complete - imported=${result.imported}, skipped=${result.skipped}`);
				dashboardProvider.updateSqliteStatus('Ready', trailDb.getLastImportedAt());
				dashboardProvider.setImporting(false);

				trailDataServer?.notifySessionsUpdated();

				vscode.window.showInformationMessage(
					`Trail: imported ${result.imported} sessions, ${result.commitsResolved} commits linked (${result.skipped} skipped)`,
				);
			} catch (err) {
				dashboardProvider.setImporting(false);
				dashboardProvider.updateSqliteStatus('Import failed');
				TrailLogger.error('Trail import failed', err);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.syncToRemote', async () => {
			if (!trailDb) return;
			const config = vscode.workspace.getConfiguration('anytimeTrail.remote');
			const provider = config.get<string>('provider', 'none');

			if (provider === 'none') {
				vscode.window.showWarningMessage(
					'Remote sync is disabled. Set anytimeTrail.remote.provider in settings.',
				);
				return;
			}

			let store: IRemoteTrailStore;
			if (provider === 'supabase') {
				const url = config.get<string>('supabaseUrl', '');
				const key = config.get<string>('supabaseAnonKey', '');
				if (!url || !key) {
					vscode.window.showWarningMessage('Supabase URL and anon key are required.');
					return;
				}
				store = new SupabaseTrailStore(url, key);
			} else if (provider === 'postgres') {
				const pgUrl = config.get<string>('postgresUrl', '');
				if (!pgUrl) {
					vscode.window.showWarningMessage('PostgreSQL connection string is required.');
					return;
				}
				store = new PostgresTrailStore(pgUrl);
			} else {
				vscode.window.showWarningMessage(`Unknown provider: ${provider}`);
				return;
			}

			const syncService = new SyncService(trailDb, store);
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Syncing Trail data to remote DB...',
					cancellable: false,
				},
				async (progress) => {
					const result = await syncService.sync(({ message, increment }) => {
						progress.report({ message, increment });
					});
					vscode.window.showInformationMessage(
						`Trail sync complete: ${result.synced} synced, ${result.skipped} up-to-date, ${result.errors} errors`,
					);
				},
			);
		}),
	);

	// Supabase 同期
	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.syncToSupabase', async () => {
			if (!supabaseStore || !trailDb) {
				vscode.window.showErrorMessage('Supabase が設定されていません');
				return;
			}
			dashboardProvider.setImporting(true);
			dashboardProvider.updateSupabaseStatus('Syncing...');
			try {
				const syncService = new SyncService(trailDb, supabaseStore);
				const result = await syncService.syncWithOpenStore();
				dashboardProvider.updateSupabaseStatus('Connected', new Date().toISOString());
				vscode.window.showInformationMessage(
					`Supabase sync complete: ${result.synced} synced, ${result.skipped} up-to-date, ${result.errors} errors`,
				);
			} catch (e) {
				dashboardProvider.updateSupabaseStatus('Sync failed');
				vscode.window.showErrorMessage(`同期エラー: ${e}`);
			} finally {
				dashboardProvider.setImporting(false);
			}
		}),
	);

	// Supabase 再接続
	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.reconnectSupabase', async () => {
			if (!supabaseStore) {
				vscode.window.showErrorMessage('Supabase が設定されていません');
				return;
			}
			dashboardProvider.updateSupabaseStatus('Connecting...');
			try {
				await supabaseStore.close();
				await supabaseStore.connect();
				const syncedAt = await supabaseStore.getExistingSyncedAt();
				const lastSync = syncedAt.size > 0
					? [...syncedAt.values()].reduce((a, b) => (a > b ? a : b))
					: null;
				dashboardProvider.updateSupabaseStatus('Connected', lastSync);
			} catch (e) {
				dashboardProvider.updateSupabaseStatus('Connection failed');
				vscode.window.showErrorMessage(`再接続エラー: ${e}`);
			}
		}),
	);

	context.subscriptions.push({
		dispose: () => {
			trailDataServer?.stop().catch(() => {});
			trailDb?.close();
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

	// AI Memory ビュー
	const homeDir = process.env.HOME || process.env.USERPROFILE || '';
	const claudeDir = homeDir ? path.join(homeDir, '.claude') : '';
	const sessionsDir = claudeDir ? path.join(claudeDir, 'projects') : '';
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
	const projectDirName = workspaceRoot.replaceAll('/', '-') || '-';
	const memoryDir = sessionsDir
		? path.join(sessionsDir, projectDirName, 'memory')
		: '';

	const aiMemoryProvider = new AiMemoryProvider(memoryDir);
	const aiMemoryTreeView = vscode.window.createTreeView('anytimeTrail.aiMemory', {
		treeDataProvider: aiMemoryProvider,
	});

	const aiMemoryRefresh = vscode.commands.registerCommand(
		'anytime-trail.aiMemoryRefresh', () => aiMemoryProvider.refresh(),
	);

	const openAiMemory = vscode.commands.registerCommand(
		'anytime-trail.openAiMemory',
		async (item: AiMemoryItem) => {
			const uri = vscode.Uri.file(item.filePath);
			await vscode.commands.executeCommand('vscode.openWith', uri, 'anytimeMarkdown');
		},
	);

	context.subscriptions.push(
		c4ElementsTreeView,
		dashboardTreeView,
		statusBarItem,
		aiMemoryTreeView,
		aiMemoryRefresh,
		openAiMemory,
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
	trailDb?.close();
	TrailLogger.dispose();
}
