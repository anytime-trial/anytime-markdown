import * as vscode from 'vscode';
import * as path from 'node:path';
import { MarkdownEditorProvider } from './providers/MarkdownEditorProvider';
import { LinkValidationProvider } from './providers/LinkValidationProvider';
import { ClaudeStatusWatcher } from '@anytime-markdown/vscode-common';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		MarkdownEditorProvider.register(context),
		// リンク検証（壊れたリンクの波線警告）
		new LinkValidationProvider(),
	);

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

	const insertSectionNumbers = vscode.commands.registerCommand(
		'anytime-markdown.insertSectionNumbers',
		() => {
			const p = MarkdownEditorProvider.getInstance();
			p?.postMessageToActivePanel({ type: 'toggleSectionNumbers', show: true });
		}
	);

	const removeSectionNumbers = vscode.commands.registerCommand(
		'anytime-markdown.removeSectionNumbers',
		() => {
			const p = MarkdownEditorProvider.getInstance();
			p?.postMessageToActivePanel({ type: 'toggleSectionNumbers', show: false });
		}
	);

	// Markdown で貼り付け
	const pasteAsMarkdown = vscode.commands.registerCommand(
		'anytime-markdown.pasteAsMarkdown', async () => {
			const p = MarkdownEditorProvider.getInstance();
			if (!p) return;
			const text = await vscode.env.clipboard.readText();
			if (text) {
				p.postMessageToActivePanel({ type: 'pasteMarkdown', text });
			}
		}
	);

	// 自動再読込トグル（VS Code ツールバー）
	const toggleAutoReloadOff = vscode.commands.registerCommand(
		'anytime-markdown.toggleAutoReloadOff',
		() => { MarkdownEditorProvider.getInstance()?.toggleAutoReload(); }
	);
	const toggleAutoReloadOn = vscode.commands.registerCommand(
		'anytime-markdown.toggleAutoReloadOn',
		() => { MarkdownEditorProvider.getInstance()?.toggleAutoReload(); }
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

	// Claude Code 編集通知: ステータスファイル監視 + エディタロック
	// フック登録は trail 拡張で一元管理する。markdown 拡張はステータスファイルの読み取りのみ。
	const storagePathSetting = vscode.workspace.getConfiguration('anytimeMarkdown.claudeStatus').get<string>('directory', '') || '.vscode';
	const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const statusDir = path.isAbsolute(storagePathSetting)
		? storagePathSetting
		: wsRoot ? path.join(wsRoot, storagePathSetting) : storagePathSetting;
	const claudeSubscriptions: vscode.Disposable[] = [];
	{
		const watcher = new ClaudeStatusWatcher(wsRoot, statusDir);
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
		insertSectionNumbers, removeSectionNumbers,
		pasteAsMarkdown,
		toggleAutoReloadOff, toggleAutoReloadOn,
		switchToReview, switchToWysiwyg, switchToSource,
		...claudeSubscriptions,
	);
}

export function deactivate() {
  // Intentionally empty – VS Code requires this export but no cleanup is needed.
}
