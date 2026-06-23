import * as fs from 'node:fs';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { registerMcpRegistrationCommand } from './commands/mcpRegistrationCommand';
import { getTraceOutputDir, registerTraceCommands } from './commands/traceCommands';
import {
	installBundledSkills,
	installStaticSkillDir,
} from '@anytime-markdown/vscode-common';
import { McpTrailServerProvider } from './providers/McpTrailServerProvider';
import { PipelineProvider } from './providers/PipelineProvider';
import { TraceCodeLensProvider } from './providers/TraceCodeLensProvider';
import { TraceScriptLensProvider } from './providers/TraceScriptLensProvider';
import { findTsconfigCandidates, hasPythonFiles } from '@anytime-markdown/trail-server/analyze-utils';
import { checkLlmAvailability } from '@anytime-markdown/trail-server/llm';
import { createFetchGitHubReviewClient } from '@anytime-markdown/trail-server/github';
import {
	loadLepConfig,
	migrateConfigJsonIntoLepJson,
	ensureLepConfigFile,
	DEFAULT_LEP_CONFIG,
	disabledAnalyzerIds,
	resolveGitHubSource,
	resolveExcludeRoot,
	resolveWorkspaceConfigPath,
} from '@anytime-markdown/trail-server/config';
import type { AnalyzeAllPipelineResult, AnalyzeAllRunnerOptions, LepConfig, LepLogLevel } from '@anytime-markdown/trail-server';
import { resolveOllamaBaseUrl } from '@anytime-markdown/agent-core';
import { TrailDatabase } from '@anytime-markdown/trail-db';
import { seedAnalyzeExclude } from '@anytime-markdown/trail-core/analyzeExclude';
import { getMemoryCoreDbPath, getTrailHome, type LepStage } from '@anytime-markdown/memory-core';
import { DaemonClient } from './trail/DaemonClient';
import { TrailPanel } from './trail/TrailPanel';
import { resolveWatchedRepos } from './utils/resolveWatchedRepos';
import { TrailLogger } from './utils/TrailLogger';
import { DaemonSinkLogger } from './utils/DaemonSinkLogger';
// AnalyzeAllRunner / MemoryCoreService / TrailDataServer / CodeGraphService は
// trail-daemon child process が hosting する。
// extension は各 IPC client (IPC proxy) 経由で操作し、typescript を引かない。
import {
	AnalyzeAllRunnerClient,
	TrailDaemonHost,
	TrailDaemonHttpClient,
	AnalyzeCommandClient,
	type SerializableAnalyzeAllConfig,
} from '@anytime-markdown/trail-server/daemon';

let httpClient: TrailDaemonHttpClient | undefined;
let analyzeCmdClient: AnalyzeCommandClient | undefined;
let trailDb: TrailDatabase | undefined;
let pipelineProvider: PipelineProvider | undefined;
let trailDaemonHost: TrailDaemonHost | null = null;
let analyzeAllRunner: AnalyzeAllRunnerClient | null = null;
let extensionDistPath = '';
// C4 ドキュメントリンク用ドキュメントディレクトリ (lep.json workspace.docsPath)。
// 旧 VS Code 設定 anytimeTrail.workspace.docsPath は廃止。activate で lepConfig から解決する。
let lepWorkspaceDocsPath = '';

function getEffectiveWorkspacePath(): string | undefined {
	const configured = vscode.workspace.getConfiguration('anytimeTrail.workspace').get<string>('path', '').trim();
	return configured || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * commit 監視対象 repo を解決する。
 * - lep.json の gitRoots（拡張・デーモン共通の監視対象）
 * - anytimeTrail.workspace.path（拡張のみ追加する主リポジトリ）
 * の union を、git working tree 検証してから返す。
 */
function getWatchedGitRoots(lepGitRoots: readonly string[]): string[] {
	const resolved = resolveWatchedRepos({
		gitRoots: lepGitRoots,
		workspacePath: getEffectiveWorkspacePath(),
		logger: { warn: (msg) => TrailLogger.warn(msg) },
	});
	return resolved.map((r) => r.gitRoot);
}

function applyDocsPathConfig(): void {
	if (httpClient) {
		httpClient.setDocsPath(lepWorkspaceDocsPath || undefined).catch((err) => {
			TrailLogger.error('[applyDocsPathConfig] setDocsPath failed', err);
		});
	}
}

function isAnalyzeAllEnabled(): boolean {
	return vscode.workspace
		.getConfiguration('anytimeTrail.analyzeAll')
		.get<boolean>('enabled', false);
}

function wireDaemonLogSink(
	daemonUrl: string,
	context: vscode.ExtensionContext,
	minLevel: LepLogLevel,
): void {
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

// setupServerCallbacks は削除 — openDocLink / openFile は TrailDaemonHttpClient
// の IPC イベントリスナーとして activate 内で直接 wire する。

export async function activate(context: vscode.ExtensionContext) {
	extensionDistPath = path.join(context.extensionUri.fsPath, 'dist');

	// OutputChannel を早期に確定し、TrailLogger.asLogger() で Logger IF を提供する。
	const trailOutputChannel = vscode.window.createOutputChannel('Anytime Trail');
	TrailLogger.init(trailOutputChannel);
	context.subscriptions.push(trailOutputChannel);

	// AnalyzeAll enable フラグ: Pipelines ツリービューの when 条件 + runner 構築の
	// ゲートに使う。Pipelines view は package.json の when="anytimeTrail.analyzeAllEnabled"
	// により context key で表示/非表示が切り替わる。
	void vscode.commands.executeCommand(
		'setContext',
		'anytimeTrail.analyzeAllEnabled',
		isAnalyzeAllEnabled(),
	);

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

	// anytime-reverse-spec は静的リファレンス。activate 時に同梱 dir を展開する。
	if (hasClaudeDir && fs.existsSync(claudeDir)) {
		try {
			installStaticSkillDir({
				claudeDir,
				extensionPath: context.extensionUri.fsPath,
				skillName: 'anytime-reverse-spec',
				oldSkillNames: ['anytime-basic-design'],
				logger: {
					info: (m) => TrailLogger.info(m),
					warn: (m) => TrailLogger.warn(m),
					error: (m) => TrailLogger.error(m),
				},
			});
		} catch (err) {
			TrailLogger.warn(`[install-skills] unexpected failure for anytime-reverse-spec: ${String(err)}`);
		}
	}

	// anytime-dev-health は SKILL.md + grounding.cjs の複数ファイル構成。dir 丸ごと展開する。
	if (hasClaudeDir && fs.existsSync(claudeDir)) {
		try {
			installStaticSkillDir({
				claudeDir,
				extensionPath: context.extensionUri.fsPath,
				skillName: 'anytime-dev-health',
				logger: {
					info: (m) => TrailLogger.info(m),
					warn: (m) => TrailLogger.warn(m),
					error: (m) => TrailLogger.error(m),
				},
			});
		} catch (err) {
			TrailLogger.warn(`[install-skills] unexpected failure for anytime-dev-health: ${String(err)}`);
		}
	}

	// anytime-cross-review は SKILL.md + codex-review.cjs の複数ファイル構成。dir 丸ごと展開する。
	if (hasClaudeDir && fs.existsSync(claudeDir)) {
		try {
			installStaticSkillDir({
				claudeDir,
				extensionPath: context.extensionUri.fsPath,
				skillName: 'anytime-cross-review',
				logger: {
					info: (m) => TrailLogger.info(m),
					warn: (m) => TrailLogger.warn(m),
					error: (m) => TrailLogger.error(m),
				},
			});
		} catch (err) {
			TrailLogger.warn(`[install-skills] unexpected failure for anytime-cross-review: ${String(err)}`);
		}
	}

	// anytime-token-budget は SKILL.md + grounding.cjs の複数ファイル構成。dir 丸ごと展開する。
	if (hasClaudeDir && fs.existsSync(claudeDir)) {
		try {
			installStaticSkillDir({
				claudeDir,
				extensionPath: context.extensionUri.fsPath,
				skillName: 'anytime-token-budget',
				logger: {
					info: (m) => TrailLogger.info(m),
					warn: (m) => TrailLogger.warn(m),
					error: (m) => TrailLogger.error(m),
				},
			});
		} catch (err) {
			TrailLogger.warn(`[install-skills] unexpected failure for anytime-token-budget: ${String(err)}`);
		}
	}

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
		reinstallSkills,
	);

	// Trail Database + Data Server (non-blocking initialization)
	const wsRootForDb = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	// LEP 設定 (lep.json) — 唯一の設定ソース (設計書 13 章)。storagePath / docsPath /
	// logs.minLevel も lep.json に集約したため、TrailDatabase 構築・docsPath 適用・
	// DaemonSinkLogger より前にロードする。旧 config.json は migrateConfigJsonIntoLepJson
	// で一度きり lep.json へ移行し、以後読まない。
	const lepLogger = { warn: (m: string) => TrailLogger.warn(m), info: (m: string) => TrailLogger.info(m) };
	let lepConfig: LepConfig = DEFAULT_LEP_CONFIG;
	let lepStage: LepStage = isAnalyzeAllEnabled() ? 'primary+memory' : 'disabled';
	let lepDisabledAnalyzers: readonly string[] = [];
	let githubPrReview: AnalyzeAllRunnerOptions['githubPrReview'] | undefined;
	if (wsRootForDb) {
		try {
			// 旧 config.json → lep.json 一度きり移行 (欠落セクションのみ gap-fill、完了後 rename)。
			migrateConfigJsonIntoLepJson({
				workspaceRoot: wsRootForDb,
				analyzeAllEnabled: isAnalyzeAllEnabled(),
				logger: lepLogger,
			});
			// lep.json が無ければ初期設定 (DEFAULT_LEP_CONFIG + 現在の analyzeAll 設定) で生成する。
			// config.json からの移行で既に生成済みなら flag:'wx' により no-op。
			ensureLepConfigFile({
				workspaceRoot: wsRootForDb,
				legacy: { analyzeAllEnabled: isAnalyzeAllEnabled() },
				logger: lepLogger,
			});
			const lepConfigPathOverride = vscode.workspace
				.getConfiguration('anytimeTrail.lep')
				.get<string>('configPath', '')
				.trim();
			const lep = loadLepConfig({
				workspaceRoot: wsRootForDb,
				configPathOverride: lepConfigPathOverride || undefined,
				logger: lepLogger,
			});
			lepConfig = lep.config;
			lepStage = lep.config.stage;
			lepDisabledAnalyzers = disabledAnalyzerIds(lep.config);
			TrailLogger.info(
				`[LepConfig] resolved stage=${lepStage} (loaded ${lep.loadedPaths.length} file(s))`,
			);

			// 新ソース参照実装 (Step 4b): GitHub PR review。opt-in (sources.github.enabled)。
			const ghSource = resolveGitHubSource(lep.config);
			if (ghSource.enabled) {
				githubPrReview = {
					client: ghSource.token
						? createFetchGitHubReviewClient({
								token: ghSource.token,
								logger: { info: (m) => TrailLogger.info(m), warn: (m) => TrailLogger.warn(m) },
							})
						: null,
					since: ghSource.since,
					maxPrs: ghSource.maxPrs,
				};
				TrailLogger.info(
					`[LepConfig] GitHub PR review source enabled (hasToken=${Boolean(ghSource.token)})`,
				);
			}
		} catch (err) {
			// version / stage 不正 (LepConfigError) は起動を止めず warn に留め、旧 boolean 由来の
			// fallback stage で続行する (extension の activate を壊さないため)。
			TrailLogger.warn(
				`[LepConfig] failed to load lep.json: ${err instanceof Error ? err.message : String(err)}. ` +
					`fallback stage=${lepStage}`,
			);
		}
	}
	// docsPath は lep.json workspace.docsPath で一元管理する (旧 anytimeTrail.workspace.docsPath は廃止)。
	lepWorkspaceDocsPath = lepConfig.workspace.docsPath;
	// code graph / C4 解析の除外ルートは lep.json workspace.excludeRoot で一元管理する。
	// どのフォルダを開いていても指定ディレクトリの .anytime/trail/analyze-exclude を全解析経路に適用する
	// (空なら undefined → 解析対象リポ自身にフォールバック)。相対は wsRootForDb 起点で絶対化。
	const analyzeExcludeRoot = resolveExcludeRoot(lepConfig, wsRootForDb);
	// trail.db 保存先は lep.json database.storagePath (旧 anytimeTrail.database.storagePath は廃止)。
	const dbStoragePathSetting = lepConfig.database.storagePath || '.anytime/trail/db';

	// `.anytime/trail/analyze-exclude` を activate 時に seed する。analyze pipeline
	// (analyzeCurrentCode / analyzeReleaseCode) でも seed されるが、AnalyzeAll が
	// OFF のままだとそちらが走らないため、ここで初期生成を保証する。flag:'wx' で
	// 既存ファイルは上書きされない (EEXIST → false 返却で no-op)。
	if (wsRootForDb) {
		try {
			if (seedAnalyzeExclude(wsRootForDb)) {
				TrailLogger.info(`[analyzeExclude] seeded .anytime/trail/analyze-exclude at ${wsRootForDb}`);
			}
		} catch (err) {
			TrailLogger.warn(
				`[analyzeExclude] failed to seed at ${wsRootForDb}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

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
		wireDaemonLogSink(externalDaemonInfo.url, context, lepConfig.logs.minLevel);
	} else if (useExternalDaemon) {
		TrailLogger.warn('[DaemonClient] anytimeTrail.daemon.useExternalDaemon=true but no live daemon found; falling back to local server mode');
	}
	// --- 外部デーモン検出ここまで ---

	const gitRoot = wsRootForDb;
	const memoryDbPathForServer = wsRootForDb ? getMemoryCoreDbPath(wsRootForDb) : undefined;

	// TRAIL_HOME (trace dir 等の解決に使用)。
	const trailHomeForConfig = wsRootForDb ? getTrailHome(wsRootForDb) : getTrailHome();

	// lep.json から ingest / chat / health で共有する LLM 値を解決する。
	// baseUrl は resolveOllamaBaseUrl で env / Dev Container 検出を畳み込み、
	// health-check と実取込で同一値を使う (split-brain 防止)。
	const lepOllama = lepConfig.llm.providers.ollama;
	const resolvedOllamaBaseUrl = resolveOllamaBaseUrl(lepOllama.baseUrl);
	// ingest 生成モデルは env MEMORY_CORE_GEN_MODEL を最優先 (エスケープハッチ維持)。
	const ingestGenModel = process.env['MEMORY_CORE_GEN_MODEL'] || lepOllama.models.chat;

	// MemoryCoreService — ingest pipeline を周期実行する長寿命サービス。
	// useExternalDaemon=true かつ daemon が見つかった場合は二重実行防止のため
	// 拡張側では起動しない (daemon が hosting する)。
	// useExternalDaemon=true でも daemon 未検出時は fallback として拡張側で
	// service を起動する (TrailPanel が local server URL を使うのと同じ paradigm)。
	const hostMemoryCoreLocally = !(useExternalDaemon && externalDaemonInfo);
	if (hostMemoryCoreLocally && dbStorageDir && wsRootForDb) {
		// MemoryCoreService / ChatBridge / RebuildScheduler は trail-daemon child process が
		// AnalyzeAllRunner と一体構築する (startHttpServer opts で設定を渡す)。
		// extension 側ではここで instance を作らない (typescript を引かないため)。
		TrailLogger.info('[MemoryCore] will be hosted by trail-daemon child process (orchestrated by AnalyzeAllRunner)');
	} else if (useExternalDaemon && externalDaemonInfo) {
		TrailLogger.info('[MemoryCore] hosted by external daemon, skipping local service');
	}

	// TrailDaemonHttpClient — daemon 内の TrailDataServer を起動・操作する IPC プロキシ。
	// AnalyzeCommandClient — daemon 内の analyze pipeline を呼び出す IPC プロキシ。
	// これらは trailDaemonHost (spawn 後の IPC チャネル) を wrap する薄いクライアントであり、
	// typescript / TypeScript compiler API を引かない。
	// (trailDaemonHost は下の async IIFE 内で作成するが、clients 自体はここで宣言する)

	// loadFromDb() は trailDb.init() 完了後に下の async IIFE 内で呼ぶ。
	// ここで呼ぶと DB 未初期化のまま ensureDb() が throw → null が返るため。

	// analyzeCurrentCode 系コマンドの本体。pickTsconfig=false (default) は HTTP/MCP 経路と
	// 揃えて candidates[0] (浅さ順=root 優先) を自動採用する。true ならコマンドパレットから
	// 明示的に切り替えたいケース向けに QuickPick を表示する。
	const runAnalyzeCurrentCommand = async (opts: { pickTsconfig: boolean }): Promise<void> => {
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
		let tsconfigPath: string | undefined;
		if (tsconfigFiles.length === 0) {
			if (hasPythonFiles(analysisRoot)) {
				tsconfigPath = undefined; // Python-only 解析
				TrailLogger.info(`C4 analysis [${repoName}]: no tsconfig.json, analyzing Python sources`);
			} else {
				TrailLogger.warn(`C4 analysis [${repoName}]: no tsconfig.json or Python files found under ${analysisRoot}`);
				vscode.window.showWarningMessage(`No tsconfig.json or Python files found under ${analysisRoot}`);
				return;
			}
		} else if (tsconfigFiles.length === 1 || !opts.pickTsconfig) {
			tsconfigPath = tsconfigFiles[0].fsPath;
			if (tsconfigFiles.length > 1 && !opts.pickTsconfig) {
				vscode.window.showInformationMessage(
					`Analyzing with ${tsconfigFiles[0].rel} (${tsconfigFiles.length} tsconfig.json found; auto-picked shallowest). Use "Anytime Trail: Analyze Code (Pick Tsconfig)" to choose another.`,
				);
			}
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

		TrailLogger.info(`C4 analysis [${repoName}]: starting for ${tsconfigPath ?? '(Python-only)'}`);
		TrailPanel.openViewer(true);

		if (!analyzeCmdClient) {
			vscode.window.showErrorMessage('Trail daemon is not initialized. AnalyzeAll must be enabled and the daemon must be running.');
			return;
		}

		try {
			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: 'C4 Analysis', cancellable: false },
				async () => {
					// onProgress は daemon 内で実行されるため extension 側から直接 progress.report は
					// 呼べない。daemon の 'progress' IPC イベントは trailDaemonHost.on('progress') で
					// ログ出力のみ行う (withProgress のスピナーは継続表示)。
					const result = await analyzeCmdClient!.analyzeCurrentCode({
						analysisRoot,
						excludeRoot: analyzeExcludeRoot,
						tsconfigPath,
						analyzeChildPath: path.join(extensionDistPath, 'analyze-child.js'),
					}) as { durationMs: number } | undefined;
					TrailLogger.info(`C4 analysis [${repoName}]: completed${result ? ` in ${result.durationMs}ms` : ''}`);
				},
			);
			vscode.window.showInformationMessage('C4 analysis completed.');
		} catch (err) {
			TrailLogger.error(`C4 analysis [${repoName}] failed`, err);
			vscode.window.showErrorMessage(`C4 analysis failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.analyzeCurrentCode', () => runAnalyzeCurrentCommand({ pickTsconfig: false })),
		vscode.commands.registerCommand('anytime-trail.analyzeCurrentCodePickTsconfig', () => runAnalyzeCurrentCommand({ pickTsconfig: true })),
	);

	const trailPort = vscode.workspace.getConfiguration('anytimeTrail.viewer').get<number>('port', 19841);

	// Initialize DB and start daemon HTTP server in background — do not block activate
	void (async () => {
		try {
			TrailLogger.info(`Trail DB: initializing with distPath=${extensionDistPath}`);
			await trailDb!.init();
			TrailLogger.info('Trail DB: initialized');
			// daemon 側が loadFromDb() を担うため、extension 側からは呼ばない。
		} catch (err) {
			TrailLogger.error('Failed to initialize trail database', err);
			return; // DB 初期化失敗時はサーバー起動もスキップ
		}

		// trail-daemon child process を spawn する。
		// AnalyzeAllRunner + TrailDataServer + CodeGraphService + ChatBridge + LogService +
		// RebuildScheduler はすべて daemon 内で構築する。extension 側は IPC client のみを使う。
		if (!externalDaemonInfo && trailDb && hostMemoryCoreLocally && dbStorageDir && wsRootForDb) {
			const daemonPath = path.join(extensionDistPath, 'trail-daemon.js');
			trailDaemonHost = new TrailDaemonHost(daemonPath);
			trailDaemonHost.start();

			// IPC イベント: ログ・進捗・インポートフェーズ
			trailDaemonHost.on('log', (p) => {
				memoryCoreOutputChannel.appendLine(`[${p.level}] ${p.message}`);
			});
			trailDaemonHost.on('progress', (p) => TrailLogger.info(`[daemon] ${p.message}`));
			trailDaemonHost.on('phase', (e) =>
				pipelineProvider?.setImportAllPhase(e.phase, e.action, {
					count: e.count,
					message: e.message,
				}),
			);
			trailDaemonHost.on('afterRun', () => {
				// daemon 側で sessions が更新されたら TrailPanel の WebSocket 経由でフロントに通知する。
				// TrailPanel は daemonUrl 経由で直接 HTTP を叩くため、ここでは HTTP 通知不要。
				TrailLogger.info('[daemon] afterRun received');
			});

			// trail.db パスは import パイプライン (configure) と Data Server (startHttpServer) の
			// 双方が同一ファイルを指す必要があるため、両者で参照できるよう 1 箇所で導出する。
			// dbStorageDir はこのブロックの if 条件 (498行) で非 null 保証済み。
			const trailDbPath = path.join(dbStorageDir, 'trail.db');

			// AnalyzeAllRunner (lep.json stage !== 'disabled' の場合のみ)
			if (lepStage !== 'disabled') {
				const cfg: SerializableAnalyzeAllConfig = {
					trailDbPath,
					gitRoot: wsRootForDb,
					gitRoots: getWatchedGitRoots(lepConfig.sources.gitRoots),
					claudeProjectsDir: lepConfig.sources.claude.projectsDir || undefined,
					codexSessionsDir: lepConfig.sources.codex.sessionsDir || undefined,
					stage: lepStage,
					ollamaBaseUrl: resolvedOllamaBaseUrl,
					disabledMemoryAnalyzers: lepDisabledAnalyzers,
					disabledAggregators: lepDisabledAnalyzers,
					importAllStatusFilePath: path.join(dbStorageDir, 'importall-phase-status.json'),
					pipelineStatusFilePath: path.join(dbStorageDir, 'pipeline-status.json'),
					memoryCore: hostMemoryCoreLocally
						? {
								trailDbPath,
								dbPath: getMemoryCoreDbPath(wsRootForDb),
								nativeBinding: memoryCoreNativeBinding,
								gitRoot: wsRootForDb,
								backfillDays: lepConfig.memory.conversation.backfillDays,
								llm: {
									baseUrl: lepOllama.baseUrl,
									chatModel: ingestGenModel,
									embedModel: lepOllama.models.embedding,
								},
								backupGenerations,
								backupIntervalDays,
							}
						: null,
					// doc-core: ドキュメント検索 DB ingest。docsRoot 空=無効 (既定オフ)。daemon 側で
					// trail.db と同じ DB ディレクトリに doc-core.db を生成する。
					...(lepConfig.sources.docs.root.trim()
						? {
								docCore: {
									docsRoot: lepConfig.sources.docs.root,
									embedModel: lepOllama.models.embedding,
								},
							}
						: {}),
				};
				analyzeAllRunner = new AnalyzeAllRunnerClient(trailDaemonHost, cfg);
				await analyzeAllRunner.configure();
				TrailLogger.info(`[AnalyzeAllRunner] wired via trail-daemon (stage=${lepStage})`);
			}

			// TrailDaemonHttpClient — daemon 内の TrailDataServer を操作する IPC プロキシ。
			httpClient = new TrailDaemonHttpClient(trailDaemonHost);
			analyzeCmdClient = new AnalyzeCommandClient(trailDaemonHost);

			// IPC イベント: httpReady → TrailPanel.setDaemonUrl + DaemonSinkLogger 配線
			httpClient.onHttpReady(({ url }) => {
				TrailLogger.info(`[TrailDaemonHttpClient] httpReady: ${url}`);
				TrailPanel.setDaemonUrl(url);
				wireDaemonLogSink(url, context, lepConfig.logs.minLevel);
			});

			// IPC イベント: openDocLink → VS Code でドキュメントを開く
			httpClient.onOpenDocLink(({ docPath }) => {
				const docsDir = lepWorkspaceDocsPath;
				if (!docsDir) {
					TrailLogger.warn(`[open-doc-link] docsPath is not configured (lep.json workspace.docsPath). Cannot open: ${docPath}`);
					void vscode.window.showWarningMessage('Set workspace.docsPath in lep.json to open document links.');
					return;
				}
				const fsPath = path.join(docsDir, docPath);
				if (!fs.existsSync(fsPath)) {
					TrailLogger.warn(`[open-doc-link] file not found: ${fsPath}`);
					void vscode.window.showWarningMessage(`File not found: ${fsPath}`);
					return;
				}
				const uri = vscode.Uri.file(fsPath);
				TrailLogger.info(`[open-doc-link] opening ${fsPath}`);
				vscode.commands.executeCommand('vscode.openWith', uri, 'anytimeMarkdown').then(
					undefined,
					(err) => {
						TrailLogger.warn(`[open-doc-link] vscode.openWith(anytimeMarkdown) failed, falling back: ${String(err)}`);
						vscode.workspace.openTextDocument(uri).then(
							(doc) => vscode.window.showTextDocument(doc),
							(err2) => {
								TrailLogger.error(`[open-doc-link] openTextDocument fallback failed: ${String(err2)}`);
								void vscode.window.showWarningMessage(`Failed to open: ${fsPath}`);
							},
						);
					},
				);
			});

			// IPC イベント: openFile → VS Code でファイルを開く
			httpClient.onOpenFile(({ filePath }) => {
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
				if (!workspaceFolder) return;
				const uri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, filePath));
				vscode.workspace.openTextDocument(uri).then(
					(doc) => vscode.window.showTextDocument(doc),
					() => void vscode.window.showWarningMessage(`File not found: ${uri.fsPath}`),
				);
			});

			// IPC イベント: tokenBudgetExceeded → VS Code 警告通知
			httpClient.onTokenBudgetExceeded((status) => {
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
			});

			// daemon 内で TrailDataServer + CodeGraphService + ChatBridge + LogService +
			// RebuildScheduler を起動する。httpReady イベントで URL を受け取る。
			const budgetConfig = vscode.workspace.getConfiguration('anytimeAgent.budget');
			const extensionLogsDbPath = dbStorageDir ? path.join(dbStorageDir, 'extension-logs.db') : undefined;
			const rebuildIntervalMin = lepConfig.memory.fts.rebuildIntervalMinutes;
			try {
				await httpClient.start({
					distPath: extensionDistPath,
					// HTTP サーバ (Data Server) は import パイプライン (configure) 非依存で起動する。
					// trail.db パスを直接渡すことで stage='disabled' でも起動できる (上で導出した定数を共有)。
					trailDbPath,
					gitRoot: wsRootForDb,
					memoryDbPath: memoryDbPathForServer,
					preferredPort: trailPort,
					pythonWasmPath: path.join(extensionDistPath, 'wasm', 'tree-sitter-python.wasm'),
					chatBridge: memoryDbPathForServer
						? {
								memoryDbPath: memoryDbPathForServer,
								memoryNativeBinding: memoryCoreNativeBinding,
								staticConfig: {
									baseUrl: resolvedOllamaBaseUrl,
									chatModel: lepConfig.llm.providers.ollama.models.chat,
									embedModel: lepConfig.llm.providers.ollama.models.embedding,
									bm25Limit: lepConfig.memory.rag.bm25Limit,
									vecLimit: lepConfig.memory.rag.vecLimit,
									finalLimit: lepConfig.memory.rag.finalLimit,
									rrfK: lepConfig.memory.rag.rrfK,
								},
							}
						: undefined,
					logService: extensionLogsDbPath
						? {
								extensionLogsDbPath,
								nativeBinding: memoryCoreNativeBinding,
							}
						: undefined,
					rebuildScheduler: memoryDbPathForServer
						? {
								memoryDbPath: memoryDbPathForServer,
								memoryNativeBinding: memoryCoreNativeBinding,
								intervalMs: rebuildIntervalMin * 60 * 1000,
							}
						: undefined,
					tokenBudgetConfig: {
						dailyLimitTokens: budgetConfig.get<number | null>('dailyLimitTokens', null),
						sessionLimitTokens: budgetConfig.get<number | null>('sessionLimitTokens', null),
						alertThresholdPct: budgetConfig.get<number>('alertThresholdPct', 80),
					},
					docsPath: lepWorkspaceDocsPath || undefined,
						// lep.json workspace.configPaths を絶対パス化して渡す (categories / metrics を gitRoot 非依存で読む)。
						configPaths: {
						commitCategories: resolveWorkspaceConfigPath(lepConfig, 'commitCategories', wsRootForDb),
						toolCategories: resolveWorkspaceConfigPath(lepConfig, 'toolCategories', wsRootForDb),
						skillCategories: resolveWorkspaceConfigPath(lepConfig, 'skillCategories', wsRootForDb),
						metricsThresholds: resolveWorkspaceConfigPath(lepConfig, 'metricsThresholds', wsRootForDb),
						},
						// 表示のデフォルト repo 名を明示注入 (gitRoots は複数あり得るため単一 gitRoot basename 導出を避ける)。
						defaultRepoName: wsRootForDb ? path.basename(wsRootForDb) : undefined,
						// trace dir を writer (traceCommands) と同一ロジックで解決し注入 (daemon の gitRoot/cwd 非依存)。
						traceDir: wsRootForDb ? getTraceOutputDir(wsRootForDb) : undefined,
						// lep.json workspace.excludeRoot を表示側 CodeGraphService にも反映 (従来 daemon は gitRoot 固定だった)。
						excludeRoot: analyzeExcludeRoot,
				});
				TrailLogger.info('[TrailDaemonHttpClient] startHttpServer called successfully');
			} catch (err) {
				TrailLogger.error('Trail Data Server (daemon) failed to start', err);
				const message = err instanceof Error ? err.message : String(err);
				const isPortConflict = /EADDRINUSE|already in use/i.test(message);
				const userMsg = isPortConflict
					? `Trail Data Server failed to bind port ${trailPort} (already in use). 別の VS Code ウィンドウが同じポートを掴んでいる可能性が高いです。古いウィンドウを閉じるか anytimeTrail.viewer.port 設定で別ポートに変更してください。`
					: `Trail Data Server failed to start: ${message}`;
				void vscode.window.showErrorMessage(userMsg);
			}

			// rebuildIndex コマンドを登録 (daemon IPC 経由で rebuildScheduler.runManual に相当する
			// 機能は Phase 3-4 以降で追加予定。現時点は UI のみ登録し機能は no-op)。
			context.subscriptions.push(
				vscode.commands.registerCommand('anytime-trail.memory.rebuildIndex', () => {
					void vscode.window.showInformationMessage('Memory index rebuild is managed by the trail-daemon process.');
				}),
			);
		} else if (externalDaemonInfo) {
			TrailLogger.info('[DaemonClient] Skipping daemon spawn — using external daemon');
		}

		// 起動時自動実行 + 周期実行は AnalyzeAllRunner が一元管理する。
		// pipelineProvider の per-phase 進捗は onImportPhase コールバック経由で発火。
		if (analyzeAllRunner) {
			pipelineProvider?.resetImportAllPhases();
			analyzeAllRunner.start(lepConfig.schedule.intervalSec * 1000, {
				runOnStart: lepConfig.schedule.runOnStart,
				startupDelayMs: lepConfig.schedule.startupDelaySec * 1000,
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
				TrailLogger.warn(`Trail import [${repoName}] skipped: AnalyzeAll is disabled`);
				void vscode.window.showWarningMessage(
					'AnalyzeAll is disabled. Enable anytimeTrail.analyzeAll.enabled in settings and reload the window.',
				);
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
				const status = await analyzeAllRunner.getStatus();
				const rawResult = await analyzeAllRunner.getLastImportResult();
				const result = rawResult as { imported?: number; skipped?: number; commitsResolved?: number; releasesResolved?: number; releasesAnalyzed?: number; coverageImported?: number } | null;
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
			// 通常時は deactivate() 側で trailDaemonHost.dispose() を await するので、
			// ここはセーフティネット。trailDaemonHost.dispose() が child process を kill する。
			// async dispose だが Disposable は await できないため明示的に fire-and-forget。
			void trailDaemonHost?.dispose();
			trailDb?.close();
		},
	});

	// AnalyzeAll > Status コマンド。拡張側で runner をホストしている場合は直接呼ぶ。
	// daemon 委譲中は daemon の HTTP API (TrailPanel.getDaemonUrl) を叩く。
	// pause/resume は HTTP API のみで提供（CLI/daemon 用途）、VS Code コマンドからは削除済み。
	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.analyzeAll.status', async () => {
			try {
				if (analyzeAllRunner) {
					const s = await analyzeAllRunner.getStatus();
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
				// daemon.json 由来の URL を localhost に限定 (CodeQL `js/file-access-to-http`)
				let parsedDaemonUrl: URL;
				try {
					parsedDaemonUrl = new URL(daemonUrl);
				} catch {
					vscode.window.showErrorMessage(`Invalid daemon URL: ${daemonUrl}`);
					return;
				}
				if (parsedDaemonUrl.hostname !== '127.0.0.1' && parsedDaemonUrl.hostname !== 'localhost') {
					vscode.window.showErrorMessage(`Refusing to call non-localhost daemon URL: ${parsedDaemonUrl.hostname}`);
					return;
				}
				const res = await fetch(`${parsedDaemonUrl.origin}/api/analyze-all/status`);
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
			// docsPath は lep.json (workspace.docsPath) へ移行。lep.json 変更は Reload Window で反映する。
			if (e.affectsConfiguration('anytimeAgent.budget') && httpClient) {
				const budgetConfig = vscode.workspace.getConfiguration('anytimeAgent.budget');
				httpClient.setTokenBudgetConfig({
					dailyLimitTokens: budgetConfig.get<number | null>('dailyLimitTokens', null),
					sessionLimitTokens: budgetConfig.get<number | null>('sessionLimitTokens', null),
					alertThresholdPct: budgetConfig.get<number>('alertThresholdPct', 80),
				}).catch((err) => {
					TrailLogger.error('[config change] setTokenBudgetConfig failed', err);
				});
			}
			if (e.affectsConfiguration('anytimeTrail.analyzeAll.enabled')) {
				// view の when 条件は context key で即時切替。runner の構築/破棄は
				// extension reload が必要 (toast で誘導)。
				const enabled = isAnalyzeAllEnabled();
				void vscode.commands.executeCommand(
					'setContext',
					'anytimeTrail.analyzeAllEnabled',
					enabled,
				);
				const matchesRunner = enabled === (analyzeAllRunner !== null);
				if (!matchesRunner) {
					void vscode.window.showInformationMessage(
						`AnalyzeAll setting changed to ${enabled ? 'enabled' : 'disabled'}. ` +
							'Reload the window to apply (Command Palette → "Developer: Reload Window").',
					);
				}
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
	const memoryDbFilePathForPanel = wsRootForDb ? getMemoryCoreDbPath(wsRootForDb) : undefined;
	pipelineProvider = new PipelineProvider({
		statusFilePath: pipelineStatusPath,
		dbFilePath,
		memoryDbFilePath: memoryDbFilePathForPanel,
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
	// TrailDataServer は daemon child process が hosting するため、
	// trailDaemonHost.dispose() が child process を kill して暗黙的に stop する。
	// httpClient には独立した dispose は不要 (host.dispose で完結する)。
	try {
		await analyzeAllRunner?.dispose();
	} catch (err) {
		TrailLogger.error('Failed to dispose analyze-all runner client', err);
	}
	try {
		// SIGTERM → (未終了なら) SIGKILL のエスカレーションを待ち、child の孤児化を防ぐ。
		await trailDaemonHost?.dispose();
	} catch (err) {
		TrailLogger.error('Failed to dispose trail-daemon host', err);
	}
	trailDb?.close();
	TrailLogger.dispose();
}
