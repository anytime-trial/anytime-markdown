import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './providers/MarkdownEditorProvider';
import { GitHistoryProvider, GitHistoryItem } from './providers/GitHistoryProvider';
import { SpecDocsProvider } from './providers/SpecDocsProvider';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(MarkdownEditorProvider.register(context));

	// Git 履歴パネル
	const gitHistoryProvider = new GitHistoryProvider();
	const gitTreeView = vscode.window.createTreeView('anytimeMarkdown.gitHistory', {
		treeDataProvider: gitHistoryProvider,
	});

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

	// アクティブドキュメント変更時に履歴を更新
	const updateGitHistory = () => {
		const p = MarkdownEditorProvider.getInstance();
		gitHistoryProvider.refresh(p?.activeDocumentUri ?? null);
	};

	// カスタムエディタのアクティブ変更を監視
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => {
			updateGitHistory();
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
			updateGitHistory();
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

	const compareWithCommit = vscode.commands.registerCommand(
		'anytime-markdown.compareWithCommit',
		async (item: GitHistoryItem) => {
			const p = MarkdownEditorProvider.getInstance();
			if (!p) { return; }
			const content = await gitHistoryProvider.getCommitContent(item);
			if (content == null) {
				vscode.window.showWarningMessage('Could not load file content for this commit.');
				return;
			}
			if (p.compareModeActive) {
				p.compareFileUri = null;
				p.postMessageToActivePanel({
					type: 'loadCompareFile',
					content,
				});
			} else {
				p.postMessageToActivePanel({
					type: 'loadHistoryContent',
					content,
				});
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

	// 仕様書管理パネル
	const specDocsProvider = new SpecDocsProvider(context);
	const specDocsTreeView = vscode.window.createTreeView('anytimeMarkdown.specDocs', {
		treeDataProvider: specDocsProvider,
	});
	const specDocsOpenFolder = vscode.commands.registerCommand(
		'anytime-markdown.specDocsOpenFolder', () => specDocsProvider.openFolder()
	);
	const specDocsCloneRepo = vscode.commands.registerCommand(
		'anytime-markdown.specDocsCloneRepo', () => specDocsProvider.cloneRepository()
	);
	const specDocsClose = vscode.commands.registerCommand(
		'anytime-markdown.specDocsClose', () => specDocsProvider.closeFolder()
	);
	const specDocsRefresh = vscode.commands.registerCommand(
		'anytime-markdown.specDocsRefresh', () => specDocsProvider.refresh()
	);
	const toggleMdOnly = vscode.commands.registerCommand(
		'anytime-markdown.toggleMdOnly', () => specDocsProvider.toggleMdOnly()
	);

	context.subscriptions.push(
		gitTreeView, specDocsTreeView,
		...statusBarItems,
		openEditorWithFile, compareCmd, compareWithCommit,
		insertSectionNumbers, removeSectionNumbers,
		specDocsOpenFolder, specDocsCloneRepo, specDocsClose, specDocsRefresh, toggleMdOnly,
	);
}

export function deactivate() {}
