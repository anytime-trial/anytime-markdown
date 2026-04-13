import * as vscode from 'vscode';
import * as path from 'node:path';
import { C4Panel } from './c4/C4Panel';
import { TrailPanel } from './trail/TrailPanel';
import { TrailDataServer } from './server/TrailDataServer';
import { TrailDatabase } from './trail/TrailDatabase';
import { registerC4Commands } from './commands/c4Commands';
import { TrailLogger } from './utils/TrailLogger';
import { C4TreeProvider } from './providers/C4TreeProvider';
import { DatabaseProvider } from './trail/DatabaseProvider';
import { AiMemoryProvider, AiMemoryItem } from './providers/AiMemoryProvider';
import type { IRemoteTrailStore } from './trail/IRemoteTrailStore';
import { SupabaseTrailStore } from './trail/SupabaseTrailStore';
import { PostgresTrailStore } from './trail/PostgresTrailStore';
import { SyncService } from './trail/SyncService';

let trailDataServer: TrailDataServer | undefined;
let trailDb: TrailDatabase | undefined;
let extensionDistPath = '';

// ---------------------------------------------------------------------------
//  C4 Data Server helpers
// ---------------------------------------------------------------------------

function applyDocsPathConfig(): void {
	const docsPath = vscode.workspace.getConfiguration('anytimeTrail').get<string>('docsPath', '');
	trailDataServer?.setDocsPath(docsPath || undefined);
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

function setupC4OnServer(server: TrailDataServer): void {
	server.setC4Provider(() => C4Panel.getDataProvider());
	C4Panel.setDataServer(server);
	const restored = C4Panel.restoreSavedModel();
	void vscode.commands.executeCommand('setContext', 'anytimeTrail.c4ModelLoaded', restored);
	applyDocsPathConfig();
	applyCoverageConfig();
	server.onOpenDocLink = (docPath) => {
		const docsDir = vscode.workspace.getConfiguration('anytimeTrail').get<string>('docsPath', '');
		if (!docsDir) return;
		const uri = vscode.Uri.file(path.join(docsDir, docPath));
		vscode.commands.executeCommand('vscode.openWith', uri, 'anytimeMarkdown').then(
			undefined,
			() => {
				vscode.workspace.openTextDocument(uri).then(
					(doc) => vscode.window.showTextDocument(doc),
					() => vscode.window.showWarningMessage(`File not found: ${uri.fsPath}`),
				);
			},
		);
	};
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
		getDataServer: () => trailDataServer,
		startServer: async () => {
			// TrailDataServer は非同期で起動済みのため待機のみ
			await new Promise((resolve) => setTimeout(resolve, 1000));
		},
	});

	// C4 Elements パネル
	const c4TreeProvider = new C4TreeProvider();
	const c4ElementsTreeView = vscode.window.createTreeView('anytimeTrail.c4Elements', {
		treeDataProvider: c4TreeProvider,
	});

	// Trail Database + Data Server (non-blocking initialization)
	trailDb = new TrailDatabase(extensionDistPath);
	C4Panel.setTrailDatabase(trailDb);
	const gitRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	trailDataServer = new TrailDataServer(extensionDistPath, trailDb, gitRoot);
	TrailPanel.setDataServer(trailDataServer);
	setupC4OnServer(trailDataServer);
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

	// Database panel
	const databaseProvider = new DatabaseProvider(trailDb, supabaseStore);
	const databaseTreeView = vscode.window.createTreeView('anytimeTrail.database', {
		treeDataProvider: databaseProvider,
	});

	// Initialize DB and start server in background — do not block activate
	void (async () => {
		try {
			TrailLogger.info(`Trail DB: initializing with distPath=${extensionDistPath}`);
			await trailDb!.init();
			databaseProvider.updateSqliteStatus('Ready', trailDb!.getLastImportedAt());
			TrailLogger.info('Trail DB: initialized');
		} catch (err) {
			TrailLogger.error('Failed to initialize trail database', err);
			databaseProvider.updateSqliteStatus('Error');
			return; // DB 初期化失敗時はサーバー起動もスキップ
		}
		try {
			TrailLogger.info(`Trail Data Server: starting on port ${trailPort}...`);
			await trailDataServer!.start(trailPort);
			TrailLogger.info(`Trail Data Server started on port ${trailPort}`);
		} catch (err) {
			TrailLogger.error('Trail Data Server failed to start', err);
		}
	})().catch((err) => {
		TrailLogger.error('Unexpected error during initialization', err);
	});

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.openTrailViewer', () => {
			TrailPanel.openViewer(true);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.importTrailData', async () => {
			const repoName = vscode.workspace.workspaceFolders?.[0]?.name ?? '(no workspace)';
			if (!trailDb) {
				TrailLogger.error(`Trail import [${repoName}] skipped: trailDb is null (not initialized)`);
				return;
			}
			TrailLogger.info(`Trail DB [${repoName}]: import started`);
			databaseProvider.setImporting(true);
			try {
				const result = await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Trail: Refreshing Trail Data',
						cancellable: false,
					},
					async (progress) => {
						const gitRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
						const c4ModelPath = vscode.workspace.getConfiguration('anytimeTrail.c4').get<string>('modelPath', '');
						const resolvedC4Path = c4ModelPath && gitRoot ? require('node:path').resolve(gitRoot, c4ModelPath) : undefined;
						return trailDb!.importAll((message, increment) => {
							progress.report({ message, increment });
							TrailLogger.info(`Trail import [${repoName}]: ${message}`);
						}, gitRoot, resolvedC4Path);
					},
				);
				TrailLogger.info(`Trail DB [${repoName}]: import complete - imported=${result.imported}, skipped=${result.skipped}, commits=${result.commitsResolved}, releases=${result.releasesResolved}, analyzed=${result.releasesAnalyzed}`);
				databaseProvider.updateSqliteStatus('Ready', trailDb.getLastImportedAt());
				databaseProvider.setImporting(false);

				trailDataServer?.notifySessionsUpdated();

				vscode.window.showInformationMessage(
					`Trail: imported ${result.imported} sessions, ${result.commitsResolved} commits linked, ${result.releasesResolved} releases resolved, ${result.releasesAnalyzed} releases analyzed, ${result.coverageImported} coverage entries (${result.skipped} skipped)`,
				);
			} catch (err) {
				databaseProvider.setImporting(false);
				databaseProvider.updateSqliteStatus('Import failed');
				TrailLogger.error(`Trail import [${repoName}] failed`, err);
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
			databaseProvider.setImporting(true);
			databaseProvider.updateSupabaseStatus('Syncing...');
			try {
				const syncService = new SyncService(trailDb, supabaseStore);
				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Trail: Syncing to Supabase',
						cancellable: false,
					},
					async (progress) => {
						const result = await syncService.syncWithOpenStore(({ message, increment }) => {
							progress.report({ message, increment });
							TrailLogger.info(`Trail Supabase sync: ${message}`);
						});
						databaseProvider.updateSupabaseStatus('Connected', new Date().toISOString());
						vscode.window.showInformationMessage(
							`Supabase sync complete: ${result.synced} synced, ${result.skipped} up-to-date, ${result.errors} errors`,
						);
					},
				);
			} catch (e) {
				databaseProvider.updateSupabaseStatus('Sync failed');
				vscode.window.showErrorMessage(`同期エラー: ${e}`);
			} finally {
				databaseProvider.setImporting(false);
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
			databaseProvider.updateSupabaseStatus('Connecting...');
			try {
				await supabaseStore.close();
				await supabaseStore.connect();
				const syncedAt = await supabaseStore.getExistingSyncedAt();
				const lastSync = syncedAt.size > 0
					? [...syncedAt.values()].reduce((a, b) => (a > b ? a : b))
					: null;
				databaseProvider.updateSupabaseStatus('Connected', lastSync);
			} catch (e) {
				databaseProvider.updateSupabaseStatus('Connection failed');
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
		databaseTreeView,
		aiMemoryTreeView,
		aiMemoryRefresh,
		openAiMemory,
	);
}

export function deactivate(): void {
	trailDataServer?.stop().catch((err) => TrailLogger.error('Failed to stop trail data server', err));
	trailDb?.close();
	TrailLogger.dispose();
}
