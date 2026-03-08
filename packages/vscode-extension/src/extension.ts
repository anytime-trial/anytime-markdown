import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './providers/MarkdownEditorProvider';
import { GitHistoryProvider, GitHistoryItem } from './providers/GitHistoryProvider';
import { OutlineProvider } from './providers/OutlineProvider';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(MarkdownEditorProvider.register(context));

	// Git 履歴パネル
	const gitHistoryProvider = new GitHistoryProvider();
	const gitTreeView = vscode.window.createTreeView('anytimeMarkdown.gitHistory', {
		treeDataProvider: gitHistoryProvider,
	});

	// アウトラインパネル
	const outlineProvider = new OutlineProvider();
	const outlineTreeView = vscode.window.createTreeView('anytimeMarkdown.outline', {
		treeDataProvider: outlineProvider,
		showCollapseAll: true,
	});

	// Webview からの見出し変更通知をアウトラインに反映
	const provider = MarkdownEditorProvider.getInstance();
	if (provider) {
		provider.onHeadingsChanged = (headings) => {
			outlineProvider.update(headings as Array<{ level: number; text: string; pos: number; kind: string }>);
		};
	}

	// アクティブドキュメント変更時に履歴を更新
	const updateGitHistory = () => {
		const p = MarkdownEditorProvider.getInstance();
		gitHistoryProvider.refresh(p?.activeDocumentUri ?? null);
	};

	// カスタムエディタのアクティブ変更を監視
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => updateGitHistory()),
	);

	// activeDocumentUri の変更を検出するためのポーリング
	let lastActiveUri: string | null = null;
	const intervalId = setInterval(() => {
		const p = MarkdownEditorProvider.getInstance();
		const currentUri = p?.activeDocumentUri?.toString() ?? null;
		if (currentUri !== lastActiveUri) {
			lastActiveUri = currentUri;
			updateGitHistory();
			// アクティブドキュメントが変わったらアウトラインをクリア（新しい見出しが来るまで）
			if (!currentUri) {
				outlineProvider.clear();
			}
		}
		// onHeadingsChanged コールバックの再設定（Provider 再生成時の対応）
		const currentProvider = MarkdownEditorProvider.getInstance();
		if (currentProvider && !currentProvider.onHeadingsChanged) {
			currentProvider.onHeadingsChanged = (headings) => {
				outlineProvider.update(headings as Array<{ level: number; text: string; pos: number; kind: string }>);
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
			p.compareFileUri = null;
			p.postMessageToActivePanel({
				type: 'loadCompareFile',
				content,
			});
		}
	);

	const scrollToHeading = vscode.commands.registerCommand(
		'anytime-markdown.scrollToHeading',
		(pos: number) => {
			const p = MarkdownEditorProvider.getInstance();
			p?.postMessageToActivePanel({ type: 'scrollToHeading', pos });
		}
	);

	const toggleSectionNumbers = vscode.commands.registerCommand(
		'anytime-markdown.toggleSectionNumbers',
		() => {
			outlineProvider.toggleSectionNumbers();
			const p = MarkdownEditorProvider.getInstance();
			p?.postMessageToActivePanel({
				type: 'toggleSectionNumbers',
				show: outlineProvider.showSectionNumbers,
			});
		}
	);

	const toggleBlockElements = vscode.commands.registerCommand(
		'anytime-markdown.toggleBlockElements',
		() => {
			outlineProvider.toggleBlockElements();
		}
	);

	context.subscriptions.push(
		gitTreeView, outlineTreeView,
		openEditorWithFile, compareCmd, compareWithCommit, scrollToHeading,
		toggleSectionNumbers, toggleBlockElements,
	);
}

export function deactivate() {}
