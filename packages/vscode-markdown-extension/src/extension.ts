import * as vscode from 'vscode';
import * as path from 'node:path';
import { MarkdownEditorProvider } from './providers/MarkdownEditorProvider';
import { LinkValidationProvider } from './providers/LinkValidationProvider';
import { ClaudeStatusWatcher, TimelineProvider, TimelineItem } from '@anytime-markdown/vscode-common';
import { WorkerStatusSource } from './claude/WorkerStatusSource';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		MarkdownEditorProvider.register(context),
		// リンク検証（壊れたリンクの波線警告）
		new LinkValidationProvider(),
	);

	// Timeline view: アクティブな markdown ファイルの git 履歴を表示
	const timelineOutput = vscode.window.createOutputChannel('Anytime Markdown');
	context.subscriptions.push(timelineOutput);
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
