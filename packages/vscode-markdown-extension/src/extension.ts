import * as vscode from 'vscode';
import * as path from 'node:path';
import { MarkdownEditorProvider } from './providers/MarkdownEditorProvider';
import { LinkValidationProvider } from './providers/LinkValidationProvider';
import { ClaudeStatusWatcher, TimelineProvider, TimelineItem } from '@anytime-markdown/vscode-common';
import { WorkerStatusSource } from './claude/WorkerStatusSource';
import { McpMarkdownServerProvider } from './providers/McpMarkdownServerProvider';
import { registerMcpRegistrationCommand, autoRegisterMcpServerIfMissing } from './commands/mcpRegistrationCommand';
import { MarkdownLogger } from './utils/MarkdownLogger';
import { DocIngestRunner } from './docCore/DocIngestRunner';
import { resolveDocDbPath } from './docCore/docDbPath';
import { installSkills } from './claude/skillInstaller';

export function activate(context: vscode.ExtensionContext) {
	// 拡張全体のログ出力先（webview からのエディタエラー転送・Timeline 等で共有）
	const timelineOutput = vscode.window.createOutputChannel('Anytime Markdown');
	context.subscriptions.push(timelineOutput);
	MarkdownLogger.init(timelineOutput);

	// 同梱した mcp-markdown サーバーを VS Code ネイティブ MCP 探索へ登録し、
	// `.mcp.json` 書き出しコマンドも提供する（trail 拡張と同等の配線）。
	const extensionDistPath = path.join(context.extensionUri.fsPath, 'dist');
	const mcpMarkdownServerProvider = new McpMarkdownServerProvider(extensionDistPath);
	context.subscriptions.push(
		mcpMarkdownServerProvider,
		vscode.lm.registerMcpServerDefinitionProvider(
			'anytime-markdown.mcp',
			mcpMarkdownServerProvider,
		),
	);
	registerMcpRegistrationCommand(context, extensionDistPath);
	// Claude Code 向け .mcp.json への登録も activate 時に自動実施する（エントリ不在時のみ追加。
	// 既存エントリ・パース不能ファイルには触れない。スキル自動配置と同じ「インストールで完結」方針）。
	autoRegisterMcpServerIfMissing(extensionDistPath);

	// 同梱した Claude Code スキル（anytime-markdown-*・anytime-mermaid）を
	// ワークスペースの .claude/skills/ へ配置する（manifest のバージョン差分で上書き）。
	const installSkillsForWorkspace = (force: boolean): void => {
		const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!wsRoot) {
			MarkdownLogger.info('スキル配置スキップ: ワークスペース未オープン');
			return;
		}
		installSkills({
			extensionFsPath: context.extensionUri.fsPath,
			workspaceFsPath: wsRoot,
			force,
			log: (level, message) =>
				level === 'error' ? MarkdownLogger.error(message) : MarkdownLogger.info(message),
		});
	};
	installSkillsForWorkspace(false);
	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-markdown.reinstallSkills', () => {
			installSkillsForWorkspace(true);
			vscode.window.showInformationMessage('Anytime Markdown: スキルを再配置しました（.claude/skills/）。');
		}),
	);

	// doc-core: markdown 拡張専用 doc-core.db を ingest（検索は mcp-markdown が読む）。
	// docsRoot 未設定なら無効（既定オフ）。DB ドライバは node:sqlite（native 不要）。
	// 未信頼ワークスペースでは起動しない: 悪意ある `.vscode/settings.json` が docsRoot/dbPath を
	// 任意パスへ向けると、フォルダを開いただけでワークスペース外の再帰読取 + DB 書込が成立するため。
	const docCfg = vscode.workspace.getConfiguration('anytimeMarkdown.docSearch');
	const docsRoot = (vscode.workspace.getConfiguration('anytimeMarkdown').get<string>('docsRoot') ?? '').trim();
	const docWsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	let docIngestRunner: DocIngestRunner | undefined;

	// initialRun: 生成直後に ingest を 1 回流すか。コマンドハンドラから呼ぶ場合は false にする
	// （ハンドラ自身が直後に runOnce するため。初回実行を流すと running ガードに当たり
	// ハンドラ側の runOnce が空振りする）。
	const startDocIngest = (initialRun = true): void => {
		if (docIngestRunner) return; // 既に起動済み（trust 付与での再評価による二重起動を防止）
		if (!docsRoot || !docWsRoot) return;
		const dbPath = resolveDocDbPath(docWsRoot, docCfg.get<string>('dbPath'), (msg) => MarkdownLogger.warn(msg));
		const ingestScriptPath = path.join(extensionDistPath, 'doc-ingest.js');
		docIngestRunner = new DocIngestRunner(ingestScriptPath, docsRoot, dbPath);
		context.subscriptions.push(docIngestRunner);
		if (initialRun) { void docIngestRunner.runOnce(); }
		const intervalMin = docCfg.get<number>('intervalMinutes') ?? 30;
		if (intervalMin > 0) {
			const docIngestInterval = setInterval(() => void docIngestRunner?.runOnce(), intervalMin * 60 * 1000);
			context.subscriptions.push({ dispose: () => clearInterval(docIngestInterval) });
		}
	};

	if (vscode.workspace.isTrusted) {
		startDocIngest();
	} else if (docsRoot && docWsRoot) {
		MarkdownLogger.info('doc-core ingest スキップ: ワークスペース未信頼（信頼付与後に再評価）');
	}

	// 信頼が後から付与された場合（例: 「常に信頼する」を選択）に ingest を開始する。
	context.subscriptions.push(
		vscode.workspace.onDidGrantWorkspaceTrust(() => {
			startDocIngest();
		}),
	);

	/** doc 系コマンド共通の前提確認（信頼済みワークスペース + docsRoot 設定済み）。 */
	const ensureDocPreconditions = (): boolean => {
		if (!vscode.workspace.isTrusted) {
			vscode.window.showWarningMessage(
				'Anytime Markdown: ワークスペースが信頼されていないため doc index を実行できません。',
			);
			return false;
		}
		if (!docsRoot || !docWsRoot) {
			vscode.window.showWarningMessage(
				'Anytime Markdown: anytimeMarkdown.docsRoot が未設定です。設定後に再実行してください。',
			);
			return false;
		}
		return true;
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-markdown.rebuildDocIndex', () => {
			if (!ensureDocPreconditions()) { return; }
			startDocIngest(false);
			void docIngestRunner?.runOnce();
		}),
		// フォルダ索引（index.<lang>.md）の再生成のみ。検索 DB（rebuildDocIndex）とは別物。
		vscode.commands.registerCommand('anytime-markdown.regenerateDocIndexes', async () => {
			if (!ensureDocPreconditions()) { return; }
			startDocIngest(false);
			const result = await docIngestRunner?.runOnce('index-only');
			if (!result) {
				vscode.window.showWarningMessage(
					'Anytime Markdown: 索引再生成を開始できませんでした（実行中の可能性）。ログ（出力: Anytime Markdown）を確認してください。',
				);
				return;
			}
			if (result.docIndexesError || !result.docIndexes) {
				vscode.window.showErrorMessage(
					`Anytime Markdown: 索引再生成に失敗しました: ${result.docIndexesError ?? '結果不明'}`,
				);
				return;
			}
			vscode.window.showInformationMessage(
				`Anytime Markdown: フォルダ索引を再生成しました（更新 ${result.docIndexes.written} 件 / 変更なし ${result.docIndexes.unchanged} 件）。`,
			);
		}),
	);

	context.subscriptions.push(
		MarkdownEditorProvider.register(context, (line) => timelineOutput.appendLine(line)),
		// リンク検証（壊れたリンクの波線警告）
		new LinkValidationProvider(),
	);
	const timelineProvider = new TimelineProvider(
		'anytime-markdown.compareWithCommit',
		(msg, err) => {
			const ts = new Date().toISOString();
			const errStr = err instanceof Error
				? `${err.message}\n${err.stack ?? ''}`
				: String(err);
			timelineOutput.appendLine(`[${ts}] [ERROR] ${msg}: ${errStr}`);
		},
	);
	const timelineTreeView = vscode.window.createTreeView('anytimeMarkdown.timeline', {
		treeDataProvider: timelineProvider,
	});

	const updateTimelineForUri = (uri: vscode.Uri | null) => {
		timelineProvider.refresh(uri);
	};

	const isMarkdownPath = (uri: vscode.Uri): boolean => {
		const lower = uri.path.toLowerCase();
		return lower.endsWith('.md') || lower.endsWith('.markdown');
	};

	// 通常テキストエディタ経由の markdown
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor && editor.document.languageId === 'markdown') {
				updateTimelineForUri(editor.document.uri);
			} else if (editor) {
				updateTimelineForUri(null);
			}
			// editor が undefined のときはカスタムエディタ側の polling に任せる
		}),
	);

	// 初期表示: 現在アクティブなテキストエディタが markdown なら反映
	const initialEditor = vscode.window.activeTextEditor;
	if (initialEditor && initialEditor.document.languageId === 'markdown') {
		updateTimelineForUri(initialEditor.document.uri);
	}

	// コンテキストの初期値を設定（editor/title メニュー表示に必要）
	vscode.commands.executeCommand('setContext', 'anytimeMarkdown.autoReload', true);
	vscode.commands.executeCommand('setContext', 'anytimeMarkdown.editorMode', 'wysiwyg');

	// ステータスバーアイテム（右側、テキストエディタと同等の位置）
	const cursorStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	const charCountItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
	const lineCountItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
	const lineEndingItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);
	const encodingItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 96);
	const statusBarItems = [cursorStatusItem, charCountItem, lineCountItem, lineEndingItem, encodingItem];

	const updateStatusBar = (status: { line: number; col: number; charCount: number; lineCount: number; lineEnding: string; encoding: string }) => {
		cursorStatusItem.text = `Ln ${status.line}, Col ${status.col}`;
		cursorStatusItem.tooltip = 'Go to Line';
		charCountItem.text = `${status.charCount.toLocaleString()} chars`;
		lineCountItem.text = `${status.lineCount.toLocaleString()} lines`;
		lineEndingItem.text = status.lineEnding;
		encodingItem.text = status.encoding;
		statusBarItems.forEach(item => item.show());
	};

	const hideStatusBar = () => {
		statusBarItems.forEach(item => item.hide());
	};

	// Webview からの変更通知を反映
	const provider = MarkdownEditorProvider.getInstance();
	if (provider) {
		provider.onStatusChanged = (status) => {
			updateStatusBar(status);
		};
	}

	// カスタムエディタのアクティブ変更を監視
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => {
			// テキストエディタがアクティブになった場合、Anytime のステータスバーを非表示
			if (vscode.window.activeTextEditor) {
				hideStatusBar();
			}
		}),
	);

	// activeDocumentUri の変更を検出するためのポーリング
	let lastActiveUri: string | null = null;
	const intervalId = setInterval(() => {
		const p = MarkdownEditorProvider.getInstance();
		const currentUri = p?.activeDocumentUri?.toString() ?? null;
		if (currentUri !== lastActiveUri) {
			lastActiveUri = currentUri;
			if (!currentUri) {
				hideStatusBar();
				// カスタムエディタが閉じてテキストエディタも未選択なら Timeline をクリア
				if (!vscode.window.activeTextEditor) {
					updateTimelineForUri(null);
				}
			} else {
				const customUri = p?.activeDocumentUri;
				if (customUri && isMarkdownPath(customUri)) {
					updateTimelineForUri(customUri);
				}
			}
		}
		// コールバックの再設定（Provider 再生成時の対応）
		const currentProvider = MarkdownEditorProvider.getInstance();
		if (currentProvider && !currentProvider.onStatusChanged) {
			currentProvider.onStatusChanged = (status) => {
				updateStatusBar(status);
			};
		}
	}, 500);
	context.subscriptions.push({ dispose: () => clearInterval(intervalId) });

	const openEditorWithFile = vscode.commands.registerCommand(
		'anytime-markdown.openEditorWithFile',
		(uri?: vscode.Uri) => {
			const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
			if (fileUri) {
				vscode.commands.executeCommand(
					'vscode.openWith',
					fileUri,
					MarkdownEditorProvider.viewType
				);
			}
		}
	);

	const compareCmd = vscode.commands.registerCommand(
		'anytime-markdown.compareWithMarkdownEditor',
		async (uri?: vscode.Uri) => {
			const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
			if (!fileUri) { return; }
			const p = MarkdownEditorProvider.getInstance();
			if (!p) { return; }
			const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(fileUri));
			p.compareFileUri = fileUri;
			p.postMessageToActivePanel({
				type: 'loadCompareFile',
				content,
			});
		}
	);

	// Anytime Git 拡張機能からの比較モード連携コマンド
	const openCompareMode = vscode.commands.registerCommand(
		'anytime-markdown.openCompareMode',
		async (uri: vscode.Uri, originalContent: string) => {
			const p = MarkdownEditorProvider.getInstance();
			if (p) {
				p.skipDiffDetection = true;
				p.pendingCompareContent = originalContent;
			}
			await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownEditorProvider.viewType);
			// 既に開いているタブの場合、pendingCompareContent が消費されていない → 直接送信
			if (p && p.pendingCompareContent !== null) {
				p.pendingCompareContent = null;
				await p.waitForReady(uri);
				p.postMessageToPanel(uri, { type: 'loadCompareFile', content: originalContent });
			}
		}
	);

	// エディタモード切替（VS Code ツールバー）
	const switchToReview = vscode.commands.registerCommand(
		'anytime-markdown.switchToReview',
		() => { MarkdownEditorProvider.getInstance()?.switchMode('review'); }
	);
	const switchToWysiwyg = vscode.commands.registerCommand(
		'anytime-markdown.switchToWysiwyg',
		() => { MarkdownEditorProvider.getInstance()?.switchMode('wysiwyg'); }
	);
	const switchToSource = vscode.commands.registerCommand(
		'anytime-markdown.switchToSource',
		() => { MarkdownEditorProvider.getInstance()?.switchMode('source'); }
	);

	const compareWithCommit = vscode.commands.registerCommand(
		'anytime-markdown.compareWithCommit',
		async (item: TimelineItem) => {
			const content = await timelineProvider.getCommitContent(item);
			if (content === null) {
				vscode.window.showErrorMessage('Failed to load commit content.');
				return;
			}
			await vscode.commands.executeCommand(
				'anytime-markdown.openCompareMode',
				item.fileUri,
				content,
			);
		},
	);

	// Claude Code 編集通知: agent-status ワーカーを監視してエディタをロックする。
	// フック登録・ワーカー起動は agent 拡張が一元管理する。markdown 拡張は consumer として
	// ワーカー HTTP を読むだけ（SQLite 非依存）。ワーカー未起動時は editing 表示が出ない（欠落許容）。
	const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const claudeSubscriptions: vscode.Disposable[] = [];
	if (wsRoot) {
		const watcher = new ClaudeStatusWatcher(
			new WorkerStatusSource(wsRoot, undefined, (msg) => timelineOutput.appendLine(msg)),
		);
		watcher.onStatusChange((editing, filePath) => {
			const p = MarkdownEditorProvider.getInstance();
			if (!p) return;
			p.handleClaudeStatus(editing, filePath);
		});
		claudeSubscriptions.push(watcher);
	}

	context.subscriptions.push(
		...statusBarItems,
		openEditorWithFile, compareCmd, openCompareMode,
		switchToReview, switchToWysiwyg, switchToSource,
		timelineTreeView, compareWithCommit,
		...claudeSubscriptions,
	);
}

export function deactivate() {
  // Intentionally empty – VS Code requires this export but no cleanup is needed.
}
