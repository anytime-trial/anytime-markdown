import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const homeDir = os.homedir();

import * as vscode from 'vscode';

import { registerMcpRegistrationCommand } from './commands/mcpRegistrationCommand';
import { registerTraceCommands } from './commands/traceCommands';
import { installBundledSkills } from './installBundledSkills';
import { AiNoteItem,AiNoteProvider } from './providers/AiNoteProvider';
import { McpTrailServerProvider } from './providers/McpTrailServerProvider';
import { PipelineProvider } from './providers/PipelineProvider';
import { TraceCodeLensProvider } from './providers/TraceCodeLensProvider';
import { TraceScriptLensProvider } from './providers/TraceScriptLensProvider';
import {
	TrailDataServer,
	CodeGraphService,
	findTsconfigCandidates,
	runAnalyzeCurrentCodePipeline,
	runAnalyzeReleaseCodePipeline,
	loadConfig,
	LogService,
} from '@anytime-markdown/trail-server';
import { TrailDatabase } from '@anytime-markdown/trail-db';
import { analyze } from '@anytime-markdown/trail-core/analyze';
import {
	CREATE_EXTENSION_LOGS,
	CREATE_EXTENSION_LOGS_INDEXES,
} from '@anytime-markdown/trail-core/domain/schema';
import { BetterSqlite3MemoryDb, getMemoryCoreDbPath, getTrailHome } from '@anytime-markdown/memory-core';
import { DaemonClient } from './trail/DaemonClient';
import { TrailPanel } from './trail/TrailPanel';
import { resolveWatchedRepos } from './utils/resolveWatchedRepos';
import { TrailLogger } from './utils/TrailLogger';
import { DaemonSinkLogger } from './utils/DaemonSinkLogger';
import { AnalyzeAllRunner, MemoryCoreService } from '@anytime-markdown/trail-server';

let trailDataServer: TrailDataServer | undefined;
let trailDb: TrailDatabase | undefined;
let pipelineProvider: PipelineProvider | undefined;
let memoryCoreService: MemoryCoreService | null = null;
let analyzeAllRunner: AnalyzeAllRunner | null = null;
let extensionDistPath = '';

function getEffectiveWorkspacePath(): string | undefined {
	const configured = vscode.workspace.getConfiguration('anytimeTrail.workspace').get<string>('path', '').trim();
	return configured || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * commit 監視対象 repo を解決する。
 * - anytimeTrail.workspace.path（主リポジトリ）
 * - <workspaceFolder>/.anytime/anytime-history.json の specDocsRoots（history 拡張が管理）
 * の union を、git working tree 検証してから返す。
 */
function getWatchedGitRoots(): string[] {
	const resolved = resolveWatchedRepos({
		workspacePath: getEffectiveWorkspacePath(),
		workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
		logger: { warn: (msg) => TrailLogger.warn(msg) },
	});
	return resolved.map((r) => r.gitRoot);
}

function applyDocsPathConfig(): void {
	const docsPath = vscode.workspace.getConfiguration('anytimeTrail.workspace').get<string>('docsPath', '');
	trailDataServer?.setDocsPath(docsPath || undefined);
}

function wireDaemonLogSink(daemonUrl: string, context: vscode.ExtensionContext): void {
	const cfg = vscode.workspace.getConfiguration('anytimeTrail.logs');
	const minLevel = cfg.get<'debug' | 'info' | 'warn' | 'error'>('minLevel') ?? 'debug';
	const sink = new DaemonSinkLogger({ baseUrl: daemonUrl, component: 'TrailLogger', minLevel });
	TrailLogger.addSink(sink);
	context.subscriptions.push({
		dispose: (): void => {
			TrailLogger.removeSink(sink);
			void sink.dispose();
		},
	});
	TrailLogger.info(`[DaemonSinkLogger] wired url=${daemonUrl} minLevel=${minLevel}`);
}

function setupServerCallbacks(server: TrailDataServer): void {
	applyDocsPathConfig();
	server.onOpenDocLink = (docPath) => {
		const docsDir = vscode.workspace.getConfiguration('anytimeTrail.workspace').get<string>('docsPath', '');
		if (!docsDir) {
			TrailLogger.warn(`[open-doc-link] docsPath is not configured (anytimeTrail.workspace.docsPath). Cannot open: ${docPath}`);
			vscode.window.showWarningMessage('Set anytimeTrail.workspace.docsPath to open document links.');
			return;
		}
		const fsPath = path.join(docsDir, docPath);
		if (!fs.existsSync(fsPath)) {
			TrailLogger.warn(`[open-doc-link] file not found: ${fsPath}`);
			vscode.window.showWarningMessage(`File not found: ${fsPath}`);
			return;
		}
		const uri = vscode.Uri.file(fsPath);
		TrailLogger.info(`[open-doc-link] opening ${fsPath}`);
		vscode.commands.executeCommand('vscode.openWith', uri, 'anytimeMarkdown').then(
			undefined,
			(err) => {
				TrailLogger.warn(`[open-doc-link] vscode.openWith(anytimeMarkdown) failed, falling back to text editor: ${String(err)}`);
				vscode.workspace.openTextDocument(uri).then(
					(doc) => vscode.window.showTextDocument(doc),
					(err2) => {
						TrailLogger.error(`[open-doc-link] openTextDocument fallback failed: ${String(err2)}`);
						vscode.window.showWarningMessage(`Failed to open: ${fsPath}`);
					},
				);
			},
		);
	};
	server.onOpenFile = (filePath) => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) return;
		const uri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, filePath));
		vscode.workspace.openTextDocument(uri).then(
			(doc) => vscode.window.showTextDocument(doc),
			() => vscode.window.showWarningMessage(`File not found: ${uri.fsPath}`),
		);
	};
}

export async function activate(context: vscode.ExtensionContext) {
	extensionDistPath = path.join(context.extensionUri.fsPath, 'dist');

	// OutputChannel を早期に確定し、TrailLogger.asLogger() で Logger IF を提供する。
	const trailOutputChannel = vscode.window.createOutputChannel('Anytime Trail');
	TrailLogger.init(trailOutputChannel);
	context.subscriptions.push(trailOutputChannel);

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

	// スキル展開先はワークスペース直下の .claude/。ワークスペース未開時は何もしない。
	// .claude ディレクトリが無い場合は新規作成して展開する（リポジトリ毎にスキルを同梱可能にする）。
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const claudeDir = workspaceRoot ? path.join(workspaceRoot, '.claude') : '';
	const hasClaudeDir = Boolean(claudeDir);
	if (claudeDir && !fs.existsSync(claudeDir)) {
		try {
			fs.mkdirSync(claudeDir, { recursive: true });
		} catch (err) {
			TrailLogger.warn(`[install-skills] failed to create ${claudeDir}: ${String(err)}`);
		}
	}

	// 同梱スキルを <workspace>/.claude/skills/ に展開（初回 activate 時 / 旧 build-code-graph cleanup）
	if (hasClaudeDir && fs.existsSync(claudeDir)) {
		try {
			installBundledSkills({
				claudeDir,
				extensionPath: context.extensionUri.fsPath,
				logger: {
					info: (m) => TrailLogger.info(m),
					warn: (m) => TrailLogger.warn(m),
					error: (m) => TrailLogger.error(m),
				},
			});
		} catch (err) {
			TrailLogger.warn(`[install-skills] unexpected failure: ${String(err)}`);
		}
	}

	const openAiNote = vscode.commands.registerCommand(
		'anytime-trail.openAiNote',
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

	const openAiNoteSkill = vscode.commands.registerCommand(
		'anytime-trail.openAiNoteSkill',
		async () => {
			const skillPath = path.join(homeDir, '.claude', 'skills', 'anytime-note', 'SKILL.md');
			if (!fs.existsSync(skillPath)) {
				vscode.window.showWarningMessage('スキルファイルが見つかりません。先にノートを作成してください。');
				return;
			}
			await openNoteFile(skillPath);
		}
	);

	const copyAiNotePath = vscode.commands.registerCommand(
		'anytime-trail.copyAiNotePath',
		async () => {
			const filePath = path.join(noteStorageDir, 'anytime-context.md');
			await vscode.env.clipboard.writeText(filePath);
			vscode.window.showInformationMessage(`Copied: ${filePath}`);
		}
	);

	const clearAiNote = vscode.commands.registerCommand(
		'anytime-trail.clearAiNote',
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

	const addAiNotePage = vscode.commands.registerCommand(
		'anytime-trail.addAiNotePage',
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

	const deleteAiNotePage = vscode.commands.registerCommand(
		'anytime-trail.deleteAiNotePage',
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

	const openAiNotePage = vscode.commands.registerCommand(
		'anytime-trail.openAiNotePage',
		async (filePath: string) => {
			await openNoteFile(filePath);
		}
	);

	const reinstallSkills = vscode.commands.registerCommand(
		'anytime-trail.reinstallSkills',
		async () => {
			if (!hasClaudeDir) {
				vscode.window.showWarningMessage('ワークスペースが開かれていないためスキルの再インストールができません。');
				return;
			}
			const result = installBundledSkills({
				claudeDir,
				extensionPath: context.extensionUri.fsPath,
				force: true,
				logger: {
					info: (m) => TrailLogger.info(m),
					warn: (m) => TrailLogger.warn(m),
					error: (m) => TrailLogger.error(m),
				},
			});
			if (result.installed) {
				vscode.window.showInformationMessage('Anytime Trail のスキルを再インストールしました。');
			} else {
				vscode.window.showWarningMessage('スキルの再インストールに失敗しました。Output パネルでログを確認してください。');
			}
		}
	);

	context.subscriptions.push(
		aiNoteTreeView,
		noteWatcher,
		openAiNote,
		openAiNoteSkill,
		copyAiNotePath,
		clearAiNote,
		addAiNotePage,
		deleteAiNotePage,
		openAiNotePage,
		reinstallSkills,
	);

	// Trail Database + Data Server (non-blocking initialization)
	const dbStoragePathSetting = vscode.workspace.getConfiguration('anytimeTrail.database').get<string>('storagePath', '.anytime/trail/db') || '.anytime/trail/db';
	const wsRootForDb = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const dbStorageDir = path.isAbsolute(dbStoragePathSetting)
		? dbStoragePathSetting
		: wsRootForDb ? path.join(wsRootForDb, dbStoragePathSetting) : undefined;
	// バックアップ設定は anytime-database 拡張が所有する (anytimeDatabase.backup.*)。
	// バックアップトリガは trail 拡張のみが担うため、ここで読んで TrailDatabase に渡す。
	const backupConfig = vscode.workspace.getConfiguration('anytimeDatabase.backup');
	const backupGenerations = backupConfig.get<number>('generations', 1);
	const backupIntervalDays = backupConfig.get<number>('intervalDays', 1);
	trailDb = new TrailDatabase(extensionDistPath, dbStorageDir, backupGenerations, TrailLogger, backupIntervalDays);

	// Anytime Memory output channel + native binding paths are needed by:
	//   - MemoryCoreService (ingest pipeline ホスト)
	//   - memory chat (ChatBridge / RebuildScheduler)
	// なので拡張側の責務として早期に解決しておく。
	const memoryCoreOutputChannel = vscode.window.createOutputChannel('Anytime Memory');
	const memoryCoreNativeBinding = path.join(
		extensionDistPath,
		'node_modules',
		'better-sqlite3',
		'build',
		'Release',
		'better_sqlite3.node',
	);
	trailDb.setIntegrityAlertHandler((alerts) => {
		for (const a of alerts) {
			TrailLogger.warn(
				`[DatabaseIntegrity] Suspicious data loss in "${a.table}": ${a.previous} → ${a.current} rows ` +
					`(loss rate ${(a.lossRate * 100).toFixed(1)}%). Inspect write history immediately.`,
			);
		}
	});
	// --- 外部デーモン検出 (Milestone C-2) ---
	const useExternalDaemon = vscode.workspace
		.getConfiguration('anytimeTrail.daemon')
		.get<boolean>('useExternalDaemon', false);
	const daemonClient = new DaemonClient({ logger: TrailLogger.asLogger(), workspaceRoot: wsRootForDb });
	const externalDaemonInfo = useExternalDaemon ? daemonClient.detect() : undefined;
	if (externalDaemonInfo) {
		TrailLogger.info(`[DaemonClient] Using external daemon at ${externalDaemonInfo.url} (pid=${externalDaemonInfo.pid})`);
		TrailPanel.setDaemonUrl(externalDaemonInfo.url);
		wireDaemonLogSink(externalDaemonInfo.url, context);
	} else if (useExternalDaemon) {
		TrailLogger.warn('[DaemonClient] anytimeTrail.daemon.useExternalDaemon=true but no live daemon found; falling back to local server mode');
	}
	// --- 外部デーモン検出ここまで ---

	const gitRoot = wsRootForDb;
	const memoryDbPathForServer = wsRootForDb ? getMemoryCoreDbPath(wsRootForDb) : undefined;
	trailDataServer = new TrailDataServer(extensionDistPath, trailDb, TrailLogger.asLogger(), gitRoot, memoryDbPathForServer);
	TrailPanel.setDataServer(trailDataServer);
	setupServerCallbacks(trailDataServer);

	// trail config — daemon と extension で共通の設定ソース。
	// 旧 anytimeTrail.memory.* (~v0.18) は config.json (memory.*) に統合された。
	const trailHomeForConfig = wsRootForDb ? getTrailHome(wsRootForDb) : getTrailHome();
	const trailConfigPath = path.join(trailHomeForConfig, 'config.json');
	const trailConfig = loadConfig(trailConfigPath, {
		warn: (msg: string) => TrailLogger.warn(msg),
	});

	// MemoryCoreService — ingest pipeline を周期実行する長寿命サービス。
	// useExternalDaemon=true かつ daemon が見つかった場合は二重実行防止のため
	// 拡張側では起動しない (daemon が hosting する)。
	// useExternalDaemon=true でも daemon 未検出時は fallback として拡張側で
	// service を起動する (TrailPanel が local server URL を使うのと同じ paradigm)。
	const hostMemoryCoreLocally = !(useExternalDaemon && externalDaemonInfo);
	if (hostMemoryCoreLocally && dbStorageDir && wsRootForDb) {
		const intervalSec = trailConfig.analyzeAll.intervalSec;
		const runOnStart = trailConfig.analyzeAll.runOnStart;
		const startupDelaySec = trailConfig.analyzeAll.startupDelaySec;
		const trailDbPath = path.join(dbStorageDir, 'trail.db');
		// MemoryCoreService は AnalyzeAllRunner の内部実行ユニット。
		// 自前 scheduler は持たず、AnalyzeAllRunner.runOnce 経由でのみ起動される
		// (二重発火回避のため start() は呼ばない)。
		memoryCoreService = new MemoryCoreService({
			logSink: memoryCoreOutputChannel,
			trailDbPath,
			dbPath: getMemoryCoreDbPath(wsRootForDb),
			nativeBinding: memoryCoreNativeBinding,
			gitRoot: wsRootForDb,
			backfillDays: trailConfig.memory.conversation.backfillDays,
		});
		trailDataServer.setMemoryCoreService(memoryCoreService);
		TrailLogger.info('[MemoryCore] service constructed (orchestrated by AnalyzeAllRunner)');
	} else if (useExternalDaemon && externalDaemonInfo) {
		TrailLogger.info('[MemoryCore] hosted by external daemon, skipping local service');
	}

	// Memory chat (MEMORY > Chat タブ) — Ollama 経由の RAG チャット。
	// activate のクリティカルパスを伸ばさないよう、初期化は全て setImmediate に
	// 非同期で逃がす。何らかの理由 (native binding 失敗、memory-core.db 破損等) で
	// 初期化が失敗しても拡張全体の起動が止まらないよう try/catch でガード。
	// wsRootForDb 未取得時 (workspace folder 未オープン) は memory-core DB 初期化をスキップ。
	// process.cwd() フォールバックは VS Code Server バイナリパス等を返す可能性があり、
	// EACCES エラーで初期化が失敗するため。
	const memoryDbPath = wsRootForDb ? getMemoryCoreDbPath(wsRootForDb) : undefined;
	const memoryNativeBinding = memoryCoreNativeBinding;
	const memoryLogger = {
		info: (msg: string, ctx?: Record<string, unknown>): void =>
			TrailLogger.info(ctx ? `${msg} ${JSON.stringify(ctx)}` : msg),
		error: (msg: string, err?: unknown): void => TrailLogger.error(msg, err),
	};
	setImmediate(() => {
		void (async () => {
			if (!hostMemoryCoreLocally) {
				TrailLogger.info('[memory-chat] hosted by external daemon, skipping local ChatBridge/RebuildScheduler');
				return;
			}
			if (!memoryDbPath) {
				TrailLogger.warn('[memory-chat] no workspace folder open, skipping ChatBridge/RebuildScheduler init');
				return;
			}
			try {
				const { ChatBridge } = await import('@anytime-markdown/trail-server');
				const chatBridge = new ChatBridge({
					memoryDbPath,
					memoryNativeBinding,
					getConfig: () => ({
						baseUrl: trailConfig.memory.ollama.baseUrl,
						chatModel: trailConfig.memory.chat.model,
						embedModel: trailConfig.memory.embedding.model,
						bm25Limit: trailConfig.memory.rag.bm25Limit,
						vecLimit: trailConfig.memory.rag.vecLimit,
						finalLimit: trailConfig.memory.rag.finalLimit,
						rrfK: trailConfig.memory.rag.rrfK,
					}),
					logger: memoryLogger,
				});
				trailDataServer!.setChatBridge(chatBridge);
				context.subscriptions.push({ dispose: () => void chatBridge.dispose() });

				const { RebuildScheduler } = await import('@anytime-markdown/trail-server');
				const rebuildIntervalMin = trailConfig.memory.fts.rebuildIntervalMinutes;
				const rebuildScheduler = new RebuildScheduler({
					memoryDbPath,
					memoryNativeBinding,
					logger: memoryLogger,
				});
				context.subscriptions.push(rebuildScheduler.start(rebuildIntervalMin * 60 * 1000));
				context.subscriptions.push(
					vscode.commands.registerCommand('anytime-trail.memory.rebuildIndex', () =>
						rebuildScheduler.runManual(),
					),
				);
				TrailLogger.info('[memory-chat] initialized');
			} catch (error) {
				TrailLogger.error('[memory-chat] init failed', error);
			}
		})();
	});

	// Code graph service
	const codeGraphRepos: { id: string; label: string; path: string }[] = [];
	const analysisWorkspacePath = getEffectiveWorkspacePath();
	if (analysisWorkspacePath) {
		const workspaceLabel = path.basename(analysisWorkspacePath) || 'Workspace';
		codeGraphRepos.push({ id: workspaceLabel, label: workspaceLabel, path: analysisWorkspacePath });
	}

	const docsPathForCodeGraph = vscode.workspace.getConfiguration('anytimeTrail.workspace').get<string>('docsPath', '').trim();
	if (docsPathForCodeGraph && !codeGraphRepos.some((r) => r.path === docsPathForCodeGraph)) {
		const docsLabel = path.basename(docsPathForCodeGraph) || 'Docs';
		const uniqueDocsLabel = codeGraphRepos.some((r) => r.id === docsLabel) ? `${docsLabel}-docs` : docsLabel;
		codeGraphRepos.push({ id: uniqueDocsLabel, label: uniqueDocsLabel, path: docsPathForCodeGraph });
	}

	const codeGraphService = new CodeGraphService({
		repositories: codeGraphRepos,
		trailDb: trailDb!,
	});
	trailDataServer.setCodeGraphService(codeGraphService);

	// HTTP 経由（mcp-trail 等）から解析パイプラインを起動するためのハンドラ登録
	trailDataServer.onAnalyzeCurrentCode = async ({ workspacePath, tsconfigPath }) => {
		const analysisRoot = workspacePath ?? getEffectiveWorkspacePath();
		if (!analysisRoot) {
			throw new Error('No workspace path. Set anytimeTrail.workspace.path or open a workspace.');
		}
		let rootStat: fs.Stats;
		try {
			rootStat = fs.statSync(analysisRoot);
		} catch {
			throw new Error(`workspace path does not exist: ${analysisRoot}`);
		}
		if (!rootStat.isDirectory()) {
			throw new Error(`workspace path is not a directory: ${analysisRoot}`);
		}

		let resolvedTsconfig = tsconfigPath;
		if (!resolvedTsconfig) {
			const candidates = findTsconfigCandidates(analysisRoot);
			if (candidates.length === 0) {
				throw new Error(`No tsconfig.json found under ${analysisRoot}`);
			}
			resolvedTsconfig = candidates[0].fsPath;
		}

		if (!trailDb) throw new Error('Trail DB not initialized');
		return runAnalyzeCurrentCodePipeline({
			analysisRoot,
			tsconfigPath: resolvedTsconfig,
			trailDb,
			callbacks: trailDataServer!,
			codeGraphService,
		});
	};

	trailDataServer.onAnalyzeReleaseCode = async () => {
		if (!trailDb) throw new Error('Trail DB not initialized');
		if (!gitRoot) throw new Error('No workspace folder for release analysis');
		return runAnalyzeReleaseCodePipeline({
			trailDb,
			codeGraphService,
			gitRoot,
		});
	};

	trailDataServer.onAnalyzeAll = async () => {
		if (!analyzeAllRunner) throw new Error('AnalyzeAllRunner not initialized');
		const startedAt = Date.now();
		pipelineProvider?.resetImportAllPhases();
		await analyzeAllRunner.runOnce('import');
		const result = analyzeAllRunner.getLastImportResult();
		if (!result) {
			throw new Error('importAll did not produce a result');
		}
		return { ...result, durationMs: Date.now() - startedAt };
	};

	// loadFromDb() は trailDb.init() 完了後に下の async IIFE 内で呼ぶ。
	// ここで呼ぶと DB 未初期化のまま ensureDb() が throw → null が返るため。

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.analyzeCurrentCode', async () => {
			const analysisRoot = getEffectiveWorkspacePath();
			if (!analysisRoot) {
				vscode.window.showErrorMessage('解析対象のワークスペースが指定されていません。anytimeTrail.workspace.path を設定するか、ワークスペースを開いてください。');
				return;
			}
			let rootStat: fs.Stats;
			try {
				rootStat = fs.statSync(analysisRoot);
			} catch {
				vscode.window.showErrorMessage(`anytimeTrail.workspace.path のパスが存在しません: ${analysisRoot}`);
				return;
			}
			if (!rootStat.isDirectory()) {
				vscode.window.showErrorMessage(`anytimeTrail.workspace.path はディレクトリではありません: ${analysisRoot}`);
				return;
			}
			const repoName = path.basename(analysisRoot);
			TrailLogger.info(`C4 analysis [${repoName}]: searching tsconfig.json under ${analysisRoot}`);
			const tsconfigFiles = findTsconfigCandidates(analysisRoot);
			if (tsconfigFiles.length === 0) {
				TrailLogger.warn(`C4 analysis [${repoName}]: no tsconfig.json found under ${analysisRoot}`);
				vscode.window.showWarningMessage(`No tsconfig.json found under ${analysisRoot}`);
				return;
			}

			let tsconfigPath: string;
			if (tsconfigFiles.length === 1) {
				tsconfigPath = tsconfigFiles[0].fsPath;
			} else {
				const items = tsconfigFiles.map(f => ({
					label: f.rel,
					description: f.rel === 'tsconfig.json' ? '(workspace root — analyzes all packages)' : undefined,
					fsPath: f.fsPath,
				}));
				const picked = await vscode.window.showQuickPick(items, {
					placeHolder: 'Select tsconfig.json to analyze',
					matchOnDescription: true,
				});
				if (!picked) {
					TrailLogger.info(`C4 analysis [${repoName}]: cancelled at tsconfig selection`);
					return;
				}
				tsconfigPath = picked.fsPath;
			}

			TrailLogger.info(`C4 analysis [${repoName}]: starting for ${tsconfigPath}`);
			TrailPanel.openViewer(true);

			if (!trailDb || !trailDataServer) {
				vscode.window.showErrorMessage('Trail DB or server is not initialized.');
				return;
			}

			try {
				await vscode.window.withProgress(
					{ location: vscode.ProgressLocation.Notification, title: 'C4 Analysis', cancellable: false },
					async (progress) => {
						const result = await runAnalyzeCurrentCodePipeline({
							analysisRoot,
							tsconfigPath,
							trailDb: trailDb!,
							callbacks: trailDataServer!,
							codeGraphService,
							onProgress: (phase) => progress.report({ message: phase }),
						});
						TrailLogger.info(`C4 analysis [${repoName}]: completed in ${result.durationMs}ms`);
					},
				);
				vscode.window.showInformationMessage('C4 analysis completed.');
			} catch (err) {
				TrailLogger.error(`C4 analysis [${repoName}] failed`, err);
				vscode.window.showErrorMessage(`C4 analysis failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}),
		vscode.commands.registerCommand('anytime-trail.analyzeReleaseCode', async () => {
			if (!trailDb) {
				vscode.window.showErrorMessage('Trail DB is not initialized.');
				return;
			}
			if (!gitRoot) {
				vscode.window.showErrorMessage('No workspace folder found.');
				return;
			}
			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: 'Trail: Analyze Release Code', cancellable: false },
				async (progress) => {
					try {
						const result = await runAnalyzeReleaseCodePipeline({
							trailDb: trailDb!,
							codeGraphService,
							gitRoot: gitRoot!,
							onProgress: (msg) => progress.report({ message: msg }),
						});
						vscode.window.showInformationMessage(`Release code analyzed (${result.releaseCount} releases).`);
					} catch (err) {
						TrailLogger.error('Failed to analyze release code', err);
						vscode.window.showErrorMessage(`Analyze release code failed: ${err instanceof Error ? err.message : String(err)}`);
					}
				},
			);
		}),
	);

	const trailPort = vscode.workspace.getConfiguration('anytimeTrail.viewer').get<number>('port', 19841);

	// Initialize DB and start server in background — do not block activate
	void (async () => {
		try {
			TrailLogger.info(`Trail DB: initializing with distPath=${extensionDistPath}`);
			await trailDb!.init();
			TrailLogger.info('Trail DB: initialized');
			// DB 初期化完了後に loadFromDb() を実行（初期化前に呼ぶと ensureDb が throw するため）
			const dbGraph = await codeGraphService!.loadFromDb();
			if (dbGraph) {
				trailDataServer?.notifyCodeGraphUpdated();
			}
		} catch (err) {
			TrailLogger.error('Failed to initialize trail database', err);
			return; // DB 初期化失敗時はサーバー起動もスキップ
		}

		// AnalyzeAllRunner — importAll → memory-core runOnce の唯一の orchestrator。
		// trailDb.init() 完了後に構築する (init 前の getWatchedGitRoots は意味を持たない)。
		// memoryCoreService が null (useExternalDaemon) でも runner は構築する (importAll のみ走る)。
		if (trailDb && hostMemoryCoreLocally && dbStorageDir) {
			analyzeAllRunner = new AnalyzeAllRunner({
				logSink: memoryCoreOutputChannel,
				gitRoot: wsRootForDb,
				trailDb,
				gitRoots: getWatchedGitRoots(),
				memoryCoreService: memoryCoreService ?? undefined,
				importAllStatusFilePath: path.join(dbStorageDir, 'importall-phase-status.json'),
				onImportProgress: (message) => TrailLogger.info(`[analyzeAll] ${message}`),
				analyzeReleaseFn: analyze,
				onImportPhase: (event) =>
					pipelineProvider?.setImportAllPhase(event.phase, event.action, {
						count: event.count,
						message: event.message,
					}),
				onAfterRun: () => trailDataServer?.notifySessionsUpdated(),
			});
			trailDataServer?.setAnalyzeAllRunner(analyzeAllRunner);
			TrailLogger.info('[AnalyzeAllRunner] wired');
		}
		// 外部デーモンが有効な場合はローカルサーバー起動をスキップ。
		// ブラウザは TrailPanel.daemonUrl 経由でデーモンに直接アクセスする。
		if (externalDaemonInfo) {
			TrailLogger.info('[DaemonClient] Skipping local TrailDataServer.start — using external daemon');
		} else {
			try {
				// LogService 配線: extension_logs テーブルへの永続化と WS broadcast を有効化する。
				// cli.ts (外部 daemon) と同等の wiring をローカルサーバーモードでも実施。
				// dbStorageDir 未確定時は logs タブが空のまま動作する (OutputChannel は健在)。
				if (dbStorageDir) {
					const extensionLogsDbPath = path.join(dbStorageDir, 'extension-logs.db');
					const extensionLogsDb = new BetterSqlite3MemoryDb({
						filePath: extensionLogsDbPath,
						nativeBinding: memoryCoreNativeBinding,
					});
					extensionLogsDb.run(CREATE_EXTENSION_LOGS);
					for (const idx of CREATE_EXTENSION_LOGS_INDEXES) extensionLogsDb.run(idx);
					extensionLogsDb.run('PRAGMA journal_mode=WAL');
					const logService = new LogService(extensionLogsDb, trailDataServer!);
					trailDataServer!.setLogService(logService);
					context.subscriptions.push({ dispose: (): void => extensionLogsDb.close() });
					TrailLogger.info(`[LogService] wired: ${extensionLogsDbPath}`);
				} else {
					TrailLogger.warn('[LogService] dbStorageDir not resolved; logs tab will remain empty');
				}

				TrailLogger.info(`Trail Data Server: starting on port ${trailPort}...`);
				await trailDataServer!.start(trailPort);
				const actualPort = trailDataServer!.port;
				TrailLogger.info(`Trail Data Server started on port ${actualPort}`);
				wireDaemonLogSink(`http://127.0.0.1:${actualPort}`, context);

				// トークン予算設定を反映
				const budgetConfig = vscode.workspace.getConfiguration('anytimeAgent.budget');
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
				const message = err instanceof Error ? err.message : String(err);
				// EADDRINUSE は別 VS Code ウィンドウが同じポートを掴んでいるケースが圧倒的に多いので、
				// OutputChannel のみだとユーザーが trail viewer 不通の原因に気付けない。
				// 通知でポートと回復策を示す。
				const isPortConflict = /EADDRINUSE|already in use/i.test(message);
				const userMsg = isPortConflict
					? `Trail Data Server failed to bind port ${trailPort} (already in use). 別の VS Code ウィンドウが同じポートを掴んでいる可能性が高いです。古いウィンドウを閉じるか anytimeTrail.viewer.port 設定で別ポートに変更してください。`
					: `Trail Data Server failed to start: ${message}`;
				void vscode.window.showErrorMessage(userMsg);
			}
		}

		// 起動時自動実行 + 周期実行は AnalyzeAllRunner が一元管理する。
		// pipelineProvider の per-phase 進捗は onImportPhase コールバック経由で発火。
		if (analyzeAllRunner) {
			pipelineProvider?.resetImportAllPhases();
			analyzeAllRunner.start(trailConfig.analyzeAll.intervalSec * 1000, {
				runOnStart: trailConfig.analyzeAll.runOnStart,
				startupDelayMs: trailConfig.analyzeAll.startupDelaySec * 1000,
			});
		}
	})().catch((err) => {
		TrailLogger.error('Unexpected error during initialization', err);
		void vscode.window.showErrorMessage(`Anytime Trail initialization failed: ${err instanceof Error ? err.message : String(err)}`);
	});

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.openTrailViewer', () => {
			TrailPanel.openViewer(true);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.analyzeAll', async () => {
			const repoName = vscode.workspace.workspaceFolders?.[0]?.name ?? '(no workspace)';
			if (!analyzeAllRunner) {
				TrailLogger.error(`Trail import [${repoName}] skipped: AnalyzeAllRunner not initialized`);
				return;
			}
			TrailLogger.info(`Trail DB [${repoName}]: import started`);
			pipelineProvider?.resetImportAllPhases();
			try {
				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Trail: Refreshing Trail Data',
						cancellable: false,
					},
					async () => {
						await analyzeAllRunner!.runOnce('manual');
					},
				);
				const status = analyzeAllRunner.getStatus();
				const result = analyzeAllRunner.getLastImportResult();
				if (status.lastError) {
					TrailLogger.error(`Trail DB [${repoName}]: import failed - ${status.lastError}`);
					vscode.window.showWarningMessage(`Trail: refresh failed - ${status.lastError}`);
				} else if (result) {
					TrailLogger.info(`Trail DB [${repoName}]: import complete - imported=${result.imported}, skipped=${result.skipped}, commits=${result.commitsResolved}, releases=${result.releasesResolved}, analyzed=${result.releasesAnalyzed}`);
					vscode.window.showInformationMessage(
						`Trail: imported ${result.imported} sessions, ${result.commitsResolved} commits linked, ${result.releasesResolved} releases resolved, ${result.releasesAnalyzed} releases analyzed, ${result.coverageImported} coverage entries (${result.skipped} skipped)`,
					);
				} else {
					TrailLogger.info(`Trail DB [${repoName}]: import complete (no result)`);
				}
			} catch (err) {
				TrailLogger.error(`Trail import [${repoName}] failed`, err);
			}
		}),
	);

	context.subscriptions.push({
		dispose: () => {
			// VS Code の Disposable は async dispose を await しないため fire-and-forget。
			// 通常時は deactivate() 側で stop を await するので、ここはセーフティネット
			// (stop() は idempotent)。エラーはログのみ確保する。
			trailDataServer?.stop().catch((err) => {
				TrailLogger.error('Failed to stop trail data server (dispose)', err);
			});
			memoryCoreService?.dispose().catch((err) => {
				TrailLogger.error('Failed to dispose memory-core service', err);
			});
			trailDb?.close();
		},
	});

	// AnalyzeAll > Pause/Resume/Status コマンド (旧 Memory Ingest コマンドを置換)。
	// 拡張側で runner をホストしている場合は直接呼ぶ。daemon 委譲中は
	// daemon の HTTP API (TrailPanel.getDaemonUrl) を叩く。
	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.analyzeAll.pause', async () => {
			try {
				if (analyzeAllRunner) {
					const status = await analyzeAllRunner.pause('vscode-command');
					vscode.window.showInformationMessage(
						`AnalyzeAll: paused (by=${status.pausedBy})`,
					);
					return;
				}
				const daemonUrl = TrailPanel.getDaemonUrl();
				if (!daemonUrl) {
					vscode.window.showWarningMessage('AnalyzeAll: no local runner and no daemon URL available');
					return;
				}
				const res = await fetch(`${daemonUrl}/api/analyze-all/pause`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ by: 'vscode-command' }),
				});
				if (!res.ok) {
					vscode.window.showErrorMessage(`AnalyzeAll pause failed: HTTP ${res.status}`);
					return;
				}
				vscode.window.showInformationMessage('AnalyzeAll: paused on daemon');
			} catch (err) {
				TrailLogger.error('analyzeAll.pause failed', err);
				vscode.window.showErrorMessage(
					`AnalyzeAll pause failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}),
		vscode.commands.registerCommand('anytime-trail.analyzeAll.resume', async () => {
			try {
				if (analyzeAllRunner) {
					await analyzeAllRunner.resume();
					vscode.window.showInformationMessage('AnalyzeAll: resumed');
					return;
				}
				const daemonUrl = TrailPanel.getDaemonUrl();
				if (!daemonUrl) {
					vscode.window.showWarningMessage('AnalyzeAll: no local runner and no daemon URL available');
					return;
				}
				const res = await fetch(`${daemonUrl}/api/analyze-all/resume`, { method: 'POST' });
				if (!res.ok) {
					vscode.window.showErrorMessage(`AnalyzeAll resume failed: HTTP ${res.status}`);
					return;
				}
				vscode.window.showInformationMessage('AnalyzeAll: resumed on daemon');
			} catch (err) {
				TrailLogger.error('analyzeAll.resume failed', err);
				vscode.window.showErrorMessage(
					`AnalyzeAll resume failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}),
		vscode.commands.registerCommand('anytime-trail.analyzeAll.status', async () => {
			try {
				if (analyzeAllRunner) {
					const s = analyzeAllRunner.getStatus();
					vscode.window.showInformationMessage(
						`AnalyzeAll (local): paused=${s.paused}, ticksRun=${s.ticksRun}, ticksSkipped=${s.ticksSkipped}, ` +
							`lastRunAt=${s.lastRunAt ?? '—'}, lastError=${s.lastError ?? '—'}`,
					);
					return;
				}
				const daemonUrl = TrailPanel.getDaemonUrl();
				if (!daemonUrl) {
					vscode.window.showWarningMessage('AnalyzeAll: no local runner and no daemon URL available');
					return;
				}
				const res = await fetch(`${daemonUrl}/api/analyze-all/status`);
				if (!res.ok) {
					vscode.window.showErrorMessage(`AnalyzeAll status failed: HTTP ${res.status}`);
					return;
				}
				const s = await res.json() as { paused: boolean; ticksRun: number; ticksSkipped: number; lastRunAt: string | null; lastError: string | null };
				vscode.window.showInformationMessage(
					`AnalyzeAll (daemon): paused=${s.paused}, ticksRun=${s.ticksRun}, ticksSkipped=${s.ticksSkipped}, ` +
						`lastRunAt=${s.lastRunAt ?? '—'}, lastError=${s.lastError ?? '—'}`,
				);
			} catch (err) {
				TrailLogger.error('analyzeAll.status failed', err);
				vscode.window.showErrorMessage(
					`AnalyzeAll status failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}),
	);

	// Watch for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('anytimeTrail.workspace.docsPath')) {
				applyDocsPathConfig();
			}
			if (e.affectsConfiguration('anytimeAgent.budget') && trailDataServer) {
				const budgetConfig = vscode.workspace.getConfiguration('anytimeAgent.budget');
				trailDataServer.setTokenBudgetConfig({
					dailyLimitTokens: budgetConfig.get<number | null>('dailyLimitTokens', null),
					sessionLimitTokens: budgetConfig.get<number | null>('sessionLimitTokens', null),
					alertThresholdPct: budgetConfig.get<number>('alertThresholdPct', 80),
				});
			}
		}),
	);

	// Trace CodeLens providers
	const testSelector: vscode.DocumentSelector = [
		{ language: 'typescript', scheme: 'file' },
		{ language: 'javascript', scheme: 'file' },
	];
	const jsonSelector: vscode.DocumentSelector = { language: 'json', scheme: 'file' };
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(testSelector, new TraceCodeLensProvider()),
		vscode.languages.registerCodeLensProvider(jsonSelector, new TraceScriptLensProvider()),
	);

	// Trace run command
	registerTraceCommands(context);

	// .vscode/trace/ watcher: notify when a new trace file is created
	if (wsRootForDb) {
		const traceDir = vscode.Uri.file(path.join(trailHomeForConfig, 'trace'));
		const traceWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(traceDir, '*.json'),
		);
		traceWatcher.onDidCreate((uri) => {
			const fileName = path.basename(uri.fsPath);
			void vscode.window.showInformationMessage(
				`トレースファイルを保存しました: ${fileName}`,
				'Trail Viewer で開く',
			).then((action) => {
				if (action === 'Trail Viewer で開く') {
					void vscode.commands.executeCommand('anytime-trail.openTrailViewer');
				}
			});
		});
		context.subscriptions.push(traceWatcher);
	}

	// AGENT マッピングパネルは vscode-agent-extension に移動済み (Phase 6/7)

	// MCP server registration: VS Code Copilot/Chat 向けに mcp-trail を提供
	const mcpTrailProvider = new McpTrailServerProvider(extensionDistPath);
	context.subscriptions.push(
		mcpTrailProvider,
		vscode.lm.registerMcpServerDefinitionProvider('anytime-trail.mcp', mcpTrailProvider),
	);

	// Claude Code (CLI) 向け登録ヘルパー
	registerMcpRegistrationCommand(context, extensionDistPath);

	// Ollama ステータスパネルは vscode-agent-extension に移動済み (Phase 6/7)
	// pipeline-status.json は DB と同じディレクトリ (${TRAIL_HOME}/db/) に置く。
	// 書き手 (memory-core/defaultMemoryCorePipelineRunner.ts) が trailDbPath と
	// 同じ dirname に出力するので、reader 側もそれに合わせる。
	const pipelineStatusPath = dbStorageDir ? path.join(dbStorageDir, 'pipeline-status.json') : undefined;
	const dbFilePath = dbStorageDir ? path.join(dbStorageDir, 'trail.db') : undefined;
	const importAllStatusFilePath = dbStorageDir
		? path.join(dbStorageDir, 'importall-phase-status.json')
		: undefined;

	// Pipelines パネル (backup / importAll 8 phases / memory-core pipelines)
	pipelineProvider = new PipelineProvider({
		statusFilePath: pipelineStatusPath,
		dbFilePath,
		importAllStatusFilePath,
	});
	vscode.window.createTreeView('anytimeTrail.pipelines', {
		treeDataProvider: pipelineProvider,
	});
	context.subscriptions.push(pipelineProvider);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.killExtensionHost', async () => {
			const answer = await vscode.window.showWarningMessage(
				'Extension Host を kill しますか? VS Code が自動的に再起動します。',
				{ modal: true, detail: `現プロセス pid=${process.pid} を終了します。Trail Data Server (port 19841) が hang した場合の最終手段です。` },
				'Kill',
			);
			if (answer !== 'Kill') return;
			TrailLogger.warn(`Extension Host kill requested by user (pid=${process.pid}). Exiting in 100ms.`);
			// OutputChannel フラッシュ猶予を確保してから exit
			setTimeout(() => process.exit(0), 100);
		}),
	);
}

export async function deactivate(): Promise<void> {
	try {
		await trailDataServer?.stop();
	} catch (err) {
		TrailLogger.error('Failed to stop trail data server', err);
	}
	try {
		await analyzeAllRunner?.dispose();
	} catch (err) {
		TrailLogger.error('Failed to dispose analyze-all runner', err);
	}
	try {
		await memoryCoreService?.dispose();
	} catch (err) {
		TrailLogger.error('Failed to dispose memory-core service', err);
	}
	trailDb?.close();
	TrailLogger.dispose();
}
