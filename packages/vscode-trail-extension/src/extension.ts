import * as vscode from 'vscode';
import * as fs from 'node:fs';
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
import { AiNoteProvider, AiNoteItem } from './providers/AiNoteProvider';
import type { IRemoteTrailStore } from './trail/IRemoteTrailStore';
import { SupabaseTrailStore } from './trail/SupabaseTrailStore';
import { PostgresTrailStore } from './trail/PostgresTrailStore';
import { SyncService } from './trail/SyncService';
import { setupClaudeHooks } from '@anytime-markdown/vscode-common';

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

function setupC4OnServer(server: TrailDataServer): void {
	server.setC4Provider(() => C4Panel.getDataProvider());
	C4Panel.setDataServer(server);
	applyDocsPathConfig();
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

	// Claude Code hook を ~/.claude/settings.json に自動登録
	const claudeStatusDirSetting = vscode.workspace.getConfiguration('anytimeTrail.claudeStatus').get<string>('directory', '') || '.vscode';
	const trailPortForHooks = vscode.workspace.getConfiguration('anytimeTrail.trailServer').get<number>('port', 19841);
	{
		const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (wsRoot) {
			const registered = setupClaudeHooks(wsRoot, claudeStatusDirSetting, trailPortForHooks);
			TrailLogger.info(`Claude hooks setup: ${registered ? 'registered' : 'skipped (already registered or .claude not found)'}`);
		}
	}

	// Agent Note ビュー
	const noteStorageDir = context.globalStorageUri.fsPath;
	const aiNoteProvider = new AiNoteProvider(noteStorageDir);
	const aiNoteTreeView = vscode.window.createTreeView('anytimeTrail.aiNote', {
		treeDataProvider: aiNoteProvider,
	});

	const noteWatcher = vscode.workspace.createFileSystemWatcher(
		new vscode.RelativePattern(vscode.Uri.file(noteStorageDir), 'anytime-note-*.md')
	);
	noteWatcher.onDidCreate(() => aiNoteProvider.refresh());
	noteWatcher.onDidDelete(() => aiNoteProvider.refresh());

	/** ノートファイルをカスタムエディタで開く */
	async function openNoteFile(filePath: string): Promise<void> {
		const uri = vscode.Uri.file(filePath);
		for (const group of vscode.window.tabGroups.all) {
			for (const tab of group.tabs) {
				const input = tab.input as { uri?: vscode.Uri } | undefined;
				if (input?.uri?.fsPath === uri.fsPath) {
					await vscode.window.tabGroups.close(tab, true);
				}
			}
		}
		try {
			await vscode.commands.executeCommand('vscode.openWith', uri, 'anytimeMarkdown');
		} catch {
			vscode.window.showErrorMessage(`ノートファイルを開けませんでした: ${filePath}`);
		}
	}

	const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
	const claudeDir = homeDir ? path.join(homeDir, '.claude') : '';
	const hasClaudeDir = Boolean(claudeDir) && fs.existsSync(claudeDir);

	const openContext = vscode.commands.registerCommand(
		'anytime-trail.openContext',
		async () => {
			const dir = noteStorageDir;
			const filePath = path.join(dir, 'anytime-note-1.md');
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			try {
				fs.writeFileSync(filePath, '', { encoding: 'utf-8', flag: 'wx' });
			} catch {
				// EEXIST: ファイル既存は正常
			}
			aiNoteProvider.refresh();

			if (hasClaudeDir) {
				const skillDir = path.join(claudeDir, 'skills', 'anytime-note');
				const skillPath = path.join(skillDir, 'SKILL.md');
				try {
					fs.mkdirSync(skillDir, { recursive: true });
					const imagesDir = path.join(dir, 'images');
					const skillContent = [
						'---',
						'name: anytime-note',
						'description: Agent Note（anytime-note-N.md）を読んで指示を実行する。「/anytime-note [ページ番号] 対応内容」の形式で使用。ノートに書かれたコンテキスト（画像・テキスト・メモ）を参照し、指示された作業を行う。',
						'user_invocable: true',
						'argument: task',
						'---',
						'',
						'# Agent Note 連携',
						'',
						'## 引継ぎモード',
						'',
						'引数が「引継ぎ」の場合、以下の手順で実行する。',
						'',
						'1. 最新の要約ページを特定する',
						'',
						`   - ノートフォルダ: \`${dir}\``,
						'   - フォルダ内の `anytime-note-*.md` を Glob で検索し、最大番号のファイルを読み込む',
						'   - ファイルが見つからない場合は「要約ページがありません」と表示して終了する',
						'',
						'2. 要約ページの内容を読み込む',
						'',
						'   - Read ツールでファイルを読み込む',
						`   - 画像フォルダ: \`${imagesDir}\``,
						'   - 画像が参照されている場合は画像も読み込む',
						'',
						'3. 内容をユーザーに報告する（変更点と次にやることを簡潔に伝える）',
						'',
						'4. 「次にやること」セクションの最初の未完了タスクから作業を開始する（ユーザーに確認してから進める）',
						'',
						'## 要約モード',
						'',
						'引数が「要約」の場合、以下の手順で実行する。**このモードのみノートの新規作成・書き込みを許可する。**',
						'',
						'1. 現在の変更点を収集する',
						'',
						'   - `git log --oneline -20` で直近のコミットを確認する',
						'   - `git diff --stat` で未コミットの変更を確認する',
						'   - 会話の中で実施した作業内容を振り返る',
						'',
						'2. 次にやるべきことを整理する（未完了のタスク、保留事項、既知の問題）',
						'',
						'3. 新規ノートページを作成する',
						'',
						`   - ノートフォルダ: \`${dir}\``,
						'   - フォルダ内の `anytime-note-*.md` を Glob で検索し、最大番号 + 1 のファイル名で作成する',
						'',
						'4. 要約内容を書き出す（フロントマター + # 要約 (YYYY-MM-DD) / ## 変更点 / ## 次にやること の形式）',
						'',
						'   フロントマター:',
						'   ```',
						'   ---',
						'   title: "要約 (YYYY-MM-DD)"',
						'   date: "YYYY-MM-DD"',
						'   type: "summary"',
						'   ---',
						'   ```',
						'',
						'5. ユーザーに作成したページ番号と要約内容を報告する',
						'',
						'## 通常モード',
						'',
						'引数が「要約」「引継ぎ」以外の場合、以下の手順で実行する。',
						'',
						'1. 引数からページ番号を判定する',
						'',
						'   - 引数の先頭が数字の場合、その数字をページ番号として使用し、残りを作業内容とする',
						'   - 引数の先頭が数字でない場合、ページ番号は指定なし（最小番号を使用）',
						'   - 引数が空の場合もページ番号は指定なし',
						'',
						'2. Agent Note ファイルを読み込む',
						'',
						`   - ノートフォルダ: \`${dir}\``,
						`   - 画像フォルダ: \`${imagesDir}\``,
						'   - ページ番号が指定された場合: `anytime-note-{N}.md` を読み込む',
						'   - ページ番号が指定されない場合: フォルダ内の `anytime-note-*.md` を Glob で検索し、最小番号のファイルを読み込む',
						'   - 画像が参照されている場合は Read ツールで画像も読み込む',
						'',
						'3. ノート内容を確認し、ユーザーに概要を報告する',
						'',
						'4. 引数で指定された作業を、ノートの内容をコンテキストとして実行する',
						'',
						'   - 引数が空の場合はノート内容を要約し、何をすべきか提案する',
						'   - 引数がある場合はノートを踏まえて作業を実行する',
						'',
						'## 注意事項',
						'',
						'- 既存のノートを変更・削除しない（読み取り専用）',
						'- 「要約」モードの場合のみ、新規ページの作成と書き込みを許可する',
						'- 作業結果はノートではなく、通常のコードベースやドキュメントに出力する',
						'',
					].join('\n');
					fs.writeFileSync(skillPath, skillContent, { encoding: 'utf-8', flag: 'wx' });
				} catch {
					// EEXIST: ファイル既存は正常
				}
			}

			await openNoteFile(filePath);
		}
	);

	const openNoteSkill = vscode.commands.registerCommand(
		'anytime-trail.openNoteSkill',
		async () => {
			const skillPath = path.join(homeDir, '.claude', 'skills', 'anytime-note', 'SKILL.md');
			if (!fs.existsSync(skillPath)) {
				vscode.window.showWarningMessage('スキルファイルが見つかりません。先にノートを作成してください。');
				return;
			}
			await openNoteFile(skillPath);
		}
	);

	const copyContextPath = vscode.commands.registerCommand(
		'anytime-trail.copyContextPath',
		async () => {
			const filePath = path.join(noteStorageDir, 'anytime-context.md');
			await vscode.env.clipboard.writeText(filePath);
			vscode.window.showInformationMessage(`Copied: ${filePath}`);
		}
	);

	const clearContext = vscode.commands.registerCommand(
		'anytime-trail.clearContext',
		async () => {
			const answer = await vscode.window.showWarningMessage(
				'すべてのノートページと画像を削除しますか？',
				{ modal: true },
				'Delete'
			);
			if (answer !== 'Delete') { return; }
			if (fs.existsSync(noteStorageDir)) {
				for (const f of fs.readdirSync(noteStorageDir)) {
					if (f.startsWith('anytime-note') && f.endsWith('.md')) {
						fs.rmSync(path.join(noteStorageDir, f));
					}
				}
				const imagesDir = path.join(noteStorageDir, 'images');
				if (fs.existsSync(imagesDir)) {
					fs.rmSync(imagesDir, { recursive: true, force: true });
				}
			}
			aiNoteProvider.refresh();
			vscode.window.showInformationMessage('ノートをクリアしました。');
		}
	);

	const addNotePage = vscode.commands.registerCommand(
		'anytime-trail.addNotePage',
		async () => {
			const dir = noteStorageDir;
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			const existing = fs.existsSync(dir)
				? fs.readdirSync(dir)
					.filter(f => /^anytime-note-\d+\.md$/.test(f))
					.map(f => Number.parseInt(f.replace('anytime-note-', '').replace('.md', ''), 10))
				: [];
			const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
			const fileName = `anytime-note-${nextNum}.md`;
			const filePath = path.join(dir, fileName);
			fs.writeFileSync(filePath, '', { encoding: 'utf-8' });
			aiNoteProvider.refresh();
			await openNoteFile(filePath);
		}
	);

	const deleteNotePage = vscode.commands.registerCommand(
		'anytime-trail.deleteNotePage',
		async (item: AiNoteItem) => {
			const answer = await vscode.window.showWarningMessage(
				`"${item.label as string}" を削除しますか？`,
				{ modal: true },
				'Delete'
			);
			if (answer !== 'Delete') { return; }
			if (fs.existsSync(item.filePath)) {
				fs.rmSync(item.filePath);
			}
			aiNoteProvider.refresh();
		}
	);

	const openNotePage = vscode.commands.registerCommand(
		'anytime-trail.openNotePage',
		async (filePath: string) => {
			await openNoteFile(filePath);
		}
	);

	context.subscriptions.push(
		aiNoteTreeView,
		noteWatcher,
		openContext,
		openNoteSkill,
		copyContextPath,
		clearContext,
		addNotePage,
		deleteNotePage,
		openNotePage,
	);

	// --- コマンド登録 ---
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
	const dbStoragePathSetting = vscode.workspace.getConfiguration('anytimeTrail.database').get<string>('storagePath', '') || '.vscode';
	const wsRootForDb = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const dbStorageDir = path.isAbsolute(dbStoragePathSetting)
		? dbStoragePathSetting
		: wsRootForDb ? path.join(wsRootForDb, dbStoragePathSetting) : undefined;
	trailDb = new TrailDatabase(extensionDistPath, dbStorageDir);
	C4Panel.setTrailDatabase(trailDb);
	const gitRoot = wsRootForDb;
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

			// トークン予算設定を反映
			const budgetConfig = vscode.workspace.getConfiguration('anytimeTrail.budget');
			trailDataServer!.setTokenBudgetConfig({
				dailyLimitTokens: budgetConfig.get<number | null>('dailyLimitTokens', null),
				sessionLimitTokens: budgetConfig.get<number | null>('sessionLimitTokens', null),
				alertThresholdPct: budgetConfig.get<number>('alertThresholdPct', 80),
			});

			// 閾値超過時の VS Code 通知
			trailDataServer!.onTokenBudgetExceeded = (status) => {
				const sessionLabel = status.sessionId.slice(0, 8);
				const messages: string[] = [];
				if (status.dailyLimitTokens !== null && status.dailyTokens >= status.dailyLimitTokens * status.alertThresholdPct / 100) {
					messages.push(`[${sessionLabel}] 本日のトークン使用量が上限の ${status.alertThresholdPct}% を超えました（${status.dailyTokens.toLocaleString()} / ${status.dailyLimitTokens.toLocaleString()}）`);
				}
				if (status.sessionLimitTokens !== null && status.sessionTokens >= status.sessionLimitTokens * status.alertThresholdPct / 100) {
					messages.push(`[${sessionLabel}] 現セッションのトークン使用量が上限の ${status.alertThresholdPct}% を超えました（${status.sessionTokens.toLocaleString()} / ${status.sessionLimitTokens.toLocaleString()}）`);
				}
				for (const msg of messages) {
					void vscode.window.showWarningMessage(msg);
					TrailLogger.warn(msg);
				}
			};
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
						return trailDb!.importAll((message, increment) => {
							progress.report({ message, increment });
							TrailLogger.info(`Trail import [${repoName}]: ${message}`);
						}, gitRoot);
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
			if (e.affectsConfiguration('anytimeTrail.budget') && trailDataServer) {
				const budgetConfig = vscode.workspace.getConfiguration('anytimeTrail.budget');
				trailDataServer.setTokenBudgetConfig({
					dailyLimitTokens: budgetConfig.get<number | null>('dailyLimitTokens', null),
					sessionLimitTokens: budgetConfig.get<number | null>('sessionLimitTokens', null),
					alertThresholdPct: budgetConfig.get<number>('alertThresholdPct', 80),
				});
			}
		}),
	);

	// AI Memory ビュー
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
	C4Panel.disposeClaudeWatcher();
	TrailLogger.dispose();
}
