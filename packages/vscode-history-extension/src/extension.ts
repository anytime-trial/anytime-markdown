import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  TrailDatabase,
  SupabaseTrailStore,
  PostgresTrailStore,
  SyncService,
} from '@anytime-markdown/trail-db';
import type { IRemoteTrailStore } from '@anytime-markdown/trail-db';
import { TimelineProvider, TimelineItem } from '@anytime-markdown/vscode-common';
import { GraphProvider, GraphItem } from './providers/GraphProvider';
import { ChangesProvider } from './providers/ChangesProvider';
import { SpecDocsProvider, SpecDocsDragAndDrop } from './providers/SpecDocsProvider';
import { DatabaseProvider } from './providers/DatabaseProvider';
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
		const updateChangesBadge = async () => {
			const count = await cp.getChangesCount();
			ctv.badge = count > 0
				? { value: count, tooltip: `${count} changes` }
				: undefined;
			await cp.closeRemovedTabs(previousChangedPaths);
			previousChangedPaths = await cp.getChangedPaths();
		};
		cp.onDidChangeTreeData(() => { void updateChangesBadge(); });
		setTimeout(() => {
			void updateChangesBadge();
		}, 2000);

		timelineProvider = new TimelineProvider(
			'anytime-history.compareWithCommit',
			(msg, err) => GitLogger.error(msg, err),
		);
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
		void graphProvider?.setTargetRoot(rootPath);
	};

	let previousRoots: string[] = [];
	specDocsProvider.onDidChangeTreeData(() => {
		const roots = specDocsProvider.roots;
		// ルート一覧が変わった場合のみ changesProvider を更新
		if (JSON.stringify(roots) !== JSON.stringify(previousRoots)) {
			previousRoots = roots;
			void changesProvider?.setTargetRoots(roots);
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
			void cp.setTargetRoots(specDocsProvider.roots);
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

	// --- Trail DB / Database panel ---
	const extensionDistPath = context.extensionPath
		? path.join(context.extensionPath, 'dist')
		: '';
	const dbConfig = vscode.workspace.getConfiguration('anytimeTrail.database');
	const dbStoragePathSetting = dbConfig.get<string>('storagePath', '');
	const wsRootForDb = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const dbStorageDir = path.isAbsolute(dbStoragePathSetting)
		? dbStoragePathSetting
		: wsRootForDb ? path.join(wsRootForDb, dbStoragePathSetting) : undefined;
	const backupGenerations = dbConfig.get<number>('backupGenerations', 1);
	const trailDb = new TrailDatabase(extensionDistPath, dbStorageDir, backupGenerations, GitLogger);

	const remoteConfig = vscode.workspace.getConfiguration('anytimeTrail.remote');
	const remoteProvider = remoteConfig.get<'none' | 'supabase' | 'postgres'>('provider', 'none');

	let supabaseStore: SupabaseTrailStore | undefined;
	if (remoteProvider === 'supabase') {
		const url = remoteConfig.get<string>('supabaseUrl', '');
		const key = remoteConfig.get<string>('supabaseAnonKey', '');
		if (url && key) {
			supabaseStore = new SupabaseTrailStore(url, key, GitLogger);
		}
	}

	const databaseProvider = new DatabaseProvider(trailDb, remoteProvider, supabaseStore);
	const databaseTreeView = vscode.window.createTreeView('anytimeHistory.database', {
		treeDataProvider: databaseProvider,
	});

	void trailDb.init().then(() => {
		databaseProvider.updateSqliteStatus('Ready', trailDb.getLastImportedAt());
	}).catch((err: unknown) => {
		GitLogger.error('Failed to initialize trail database', err);
		databaseProvider.updateSqliteStatus('Error');
	});

	// Supabase 同期
	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-history.syncToSupabase', async () => {
			if (!supabaseStore || !trailDb) {
				vscode.window.showErrorMessage('Supabase が設定されていません');
				return;
			}
			databaseProvider.setSyncing(true);
			databaseProvider.updateRemoteStatus('Syncing...');
			try {
				const syncService = new SyncService(trailDb, supabaseStore, GitLogger);
				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Trail: Syncing to Supabase',
						cancellable: false,
					},
					async (progress) => {
						const result = await syncService.sync(({ message, increment }) => {
							progress.report({ message, increment });
							GitLogger.info(`Trail Supabase sync: ${message}`);
						});
						databaseProvider.updateRemoteStatus('Connected', new Date().toISOString());
						vscode.window.showInformationMessage(
							`Trail sync complete: ${result.synced} synced, ${result.skipped} up-to-date, ${result.errors} errors`,
						);
					},
				);
			} catch (err) {
				GitLogger.error('Trail Supabase sync failed', err);
				databaseProvider.updateRemoteStatus('Error');
				vscode.window.showErrorMessage('Trail Supabase sync failed');
			} finally {
				databaseProvider.setSyncing(false);
			}
		}),
	);

	// Supabase 再接続
	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-history.reconnectSupabase', async () => {
			const config = vscode.workspace.getConfiguration('anytimeTrail.remote');
			const url = config.get<string>('supabaseUrl', '');
			const key = config.get<string>('supabaseAnonKey', '');
			if (!url || !key) {
				vscode.window.showWarningMessage('Supabase URL and anon key are required.');
				return;
			}
			supabaseStore = new SupabaseTrailStore(url, key, GitLogger);
			databaseProvider.updateRemoteStatus('Reconnected');
			vscode.window.showInformationMessage('Supabase reconnected.');
		}),
	);

	// 汎用リモート同期（PostgreSQL / その他）
	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-history.syncToRemote', async () => {
			if (!trailDb) return;
			const config = vscode.workspace.getConfiguration('anytimeTrail.remote');
			const provider = config.get<string>('provider', 'none');
			let store: IRemoteTrailStore;
			if (provider === 'supabase') {
				const url = config.get<string>('supabaseUrl', '');
				const key = config.get<string>('supabaseAnonKey', '');
				if (!url || !key) {
					vscode.window.showWarningMessage('Supabase URL and anon key are required.');
					return;
				}
				store = new SupabaseTrailStore(url, key, GitLogger);
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

			const syncService = new SyncService(trailDb, store, GitLogger);
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

	// ファイル保存時にリフレッシュ
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(() => changesProvider?.refresh()),
		specDocsTreeView,
		{ dispose: () => specDocsProvider.dispose() },
		...(changesProvider && changesTreeView ? [changesTreeView, { dispose: () => changesProvider.dispose() }] : []),
		...(timelineTreeView ? [timelineTreeView] : []),
		...(graphTreeView ? [graphTreeView] : []), graphRefresh,
		databaseTreeView,
		{ dispose: () => trailDb.close() },
	);
}

export function deactivate(): void {
	GitLogger.dispose();
}
