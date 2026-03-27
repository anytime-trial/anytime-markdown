import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MarkdownEditorProvider } from './providers/MarkdownEditorProvider';
import { LinkValidationProvider } from './providers/LinkValidationProvider';
import { AiLogProvider, AiLogItem } from './providers/AiLogProvider';
import { AiMemoryProvider, AiMemoryItem } from './providers/AiMemoryProvider';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		MarkdownEditorProvider.register(context),
		// リンク検証（壊れたリンクの波線警告）
		new LinkValidationProvider(),
	);

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

	// Agent Note ビュー（空のツリーで Welcome Content を表示）
	vscode.window.createTreeView('anytimeMarkdown.aiNote', {
		treeDataProvider: { getTreeItem: (e: never) => e, getChildren: () => [] },
	});

	// Claude Code 連携（~/.claude/ が存在する場合のみ有効）
	const homeDir = process.env.HOME || process.env.USERPROFILE || '';
	const claudeDir = homeDir ? path.join(homeDir, '.claude') : '';
	const hasClaudeDir = claudeDir && fs.existsSync(claudeDir);

	const sessionsDir = hasClaudeDir ? path.join(claudeDir, 'projects') : '';
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
	const projectDirName = workspaceRoot.replace(/\//g, '-') || '-';
	const projectSessionsDir = sessionsDir ? path.join(sessionsDir, projectDirName) : '';

	const aiLogProvider = new AiLogProvider(projectSessionsDir);
	const aiLogTreeView = vscode.window.createTreeView('anytimeMarkdown.aiLog', {
		treeDataProvider: aiLogProvider,
	});

	const aiLogRefresh = vscode.commands.registerCommand(
		'anytime-markdown.aiLogRefresh', () => aiLogProvider.refresh()
	);

	const openAiLog = vscode.commands.registerCommand(
		'anytime-markdown.openAiLog',
		async (item: AiLogItem) => {
			const dir = context.globalStorageUri.fsPath;
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			const outPath = path.join(dir, `ai-log-${item.sessionId}.md`);

			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: 'Converting AI Log...' },
				async () => {
					const md = await AiLogProvider.convertToMarkdown(item.filePath);
					fs.writeFileSync(outPath, md, 'utf-8');
				}
			);

			const uri = vscode.Uri.file(outPath);
			await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownEditorProvider.viewType);
		}
	);

	// AI Memory ビュー
	const memoryDir = path.join(projectSessionsDir, 'memory');
	const aiMemoryProvider = new AiMemoryProvider(memoryDir);
	const aiMemoryTreeView = vscode.window.createTreeView('anytimeMarkdown.aiMemory', {
		treeDataProvider: aiMemoryProvider,
	});

	const aiMemoryRefresh = vscode.commands.registerCommand(
		'anytime-markdown.aiMemoryRefresh', () => aiMemoryProvider.refresh()
	);

	const openAiMemory = vscode.commands.registerCommand(
		'anytime-markdown.openAiMemory',
		async (item: AiMemoryItem) => {
			const uri = vscode.Uri.file(item.filePath);
			await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownEditorProvider.viewType);
		}
	);

	// Agent Note ファイルを開く
	const openContext = vscode.commands.registerCommand(
		'anytime-markdown.openContext',
		async () => {
			const dir = context.globalStorageUri.fsPath;
			const filePath = path.join(dir, 'anytime-context.md');
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			if (!fs.existsSync(filePath)) {
				fs.writeFileSync(filePath, '# Anytime Context\n\n', 'utf-8');
			}

			// ~/.claude/skills/anytime-note/SKILL.md を自動生成（未作成の場合のみ）
			if (hasClaudeDir) {
				const skillDir = path.join(claudeDir, 'skills', 'anytime-note');
				const skillPath = path.join(skillDir, 'SKILL.md');
				if (!fs.existsSync(skillPath)) {
					fs.mkdirSync(skillDir, { recursive: true });
					const imagesDir = path.join(dir, 'images');
					const skillContent = [
						'---',
						'name: anytime-note',
						'description: Agent Note（anytime-context.md）を読んで指示を実行する。「/anytime-note 対応内容」の形式で使用。ノートに書かれたコンテキスト（画像・テキスト・メモ）を参照し、指示された作業を行う。',
						'user_invocable: true',
						'argument: task',
						'---',
						'',
						'# Agent Note 連携',
						'',
						'## 手順',
						'',
						'1. Agent Note ファイルを読み込む',
						`   - パス: \`${filePath}\``,
						`   - 画像フォルダ: \`${imagesDir}\``,
						'   - 画像（`images/` 内の png 等）が参照されている場合は Read ツールで画像も読み込む',
						'',
						'2. ノート内容を確認し、ユーザーに概要を報告する',
						'   - テキスト・画像の有無を簡潔に伝える',
						'',
						'3. 引数（`task`）で指定された作業を、ノートの内容をコンテキストとして実行する',
						'   - 引数が空の場合はノート内容を要約し、何をすべきか提案する',
						'   - 引数がある場合はノートを踏まえて作業を実行する',
						'',
						'## 注意事項',
						'',
						'- ノートの内容を変更・削除しない（読み取り専用）',
						'- 作業結果はノートではなく、通常のコードベースやドキュメントに出力する',
						'',
					].join('\n');
					fs.writeFileSync(skillPath, skillContent, 'utf-8');
				}
			}

			const uri = vscode.Uri.file(filePath);
			await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownEditorProvider.viewType);
		}
	);

	// AI Note ファイルパスをクリップボードにコピー
	const copyContextPath = vscode.commands.registerCommand(
		'anytime-markdown.copyContextPath',
		async () => {
			const filePath = path.join(context.globalStorageUri.fsPath, 'anytime-context.md');
			await vscode.env.clipboard.writeText(filePath);
			vscode.window.showInformationMessage(`Copied: ${filePath}`);
		}
	);

	// Agent Note ストレージをクリア
	const clearContext = vscode.commands.registerCommand(
		'anytime-markdown.clearContext',
		async () => {
			const answer = await vscode.window.showWarningMessage(
				'Agent Note のファイルをすべて削除しますか？',
				{ modal: true },
				'Delete'
			);
			if (answer !== 'Delete') { return; }
			const dir = context.globalStorageUri.fsPath;
			const aiNotePath = path.join(dir, 'anytime-context.md');
			const imagesDir = path.join(dir, 'images');
			if (fs.existsSync(aiNotePath)) {
				fs.rmSync(aiNotePath);
			}
			if (fs.existsSync(imagesDir)) {
				fs.rmSync(imagesDir, { recursive: true, force: true });
			}
			vscode.window.showInformationMessage('Agent Note をクリアしました。');
		}
	);

	context.subscriptions.push(
		...statusBarItems,
		openEditorWithFile, compareCmd, openCompareMode,
		insertSectionNumbers, removeSectionNumbers,
		pasteAsMarkdown,
		openContext, copyContextPath, clearContext,
		aiLogTreeView, aiLogRefresh, openAiLog,
		aiMemoryTreeView, aiMemoryRefresh, openAiMemory,
	);
}

export function deactivate() {
  // Intentionally empty – VS Code requires this export but no cleanup is needed.
}
