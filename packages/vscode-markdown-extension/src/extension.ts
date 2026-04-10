import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MarkdownEditorProvider } from './providers/MarkdownEditorProvider';
import { LinkValidationProvider } from './providers/LinkValidationProvider';
import { AiNoteProvider, AiNoteItem } from './providers/AiNoteProvider';
import { setupClaudeHooks } from './utils/claudeHookSetup';
import { ClaudeStatusWatcher } from './utils/claudeStatusWatcher';

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

	// Agent Note ビュー
	const noteStorageDir = context.globalStorageUri.fsPath;
	const aiNoteProvider = new AiNoteProvider(noteStorageDir);
	const aiNoteTreeView = vscode.window.createTreeView('anytimeMarkdown.aiNote', {
		treeDataProvider: aiNoteProvider,
	});

	// Claude Code 連携（~/.claude/ が存在する場合のみ有効）
	const homeDir = process.env.HOME || process.env.USERPROFILE || '';
	const claudeDir = homeDir ? path.join(homeDir, '.claude') : '';
	const hasClaudeDir = claudeDir && fs.existsSync(claudeDir);

	const sessionsDir = hasClaudeDir ? path.join(claudeDir, 'projects') : '';
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
	const projectDirName = workspaceRoot.replace(/\//g, '-') || '-';
	const projectSessionsDir = sessionsDir ? path.join(sessionsDir, projectDirName) : '';

	// Agent Note ファイルを開く（デフォルトページ）
	const openContext = vscode.commands.registerCommand(
		'anytime-markdown.openContext',
		async () => {
			const dir = context.globalStorageUri.fsPath;
			const filePath = path.join(dir, 'anytime-context.md');
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			try {
				fs.writeFileSync(filePath, '# Anytime Context\n\n', { encoding: 'utf-8', flag: 'wx' });
			} catch {
				// EEXIST: ファイル既存は正常
			}
			aiNoteProvider.refresh();

			// ~/.claude/skills/anytime-note/SKILL.md を自動生成（未作成の場合のみ）
			if (hasClaudeDir) {
				const skillDir = path.join(claudeDir, 'skills', 'anytime-note');
				const skillPath = path.join(skillDir, 'SKILL.md');
				try {
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
					// wx: 排他作成（既存ファイルがあれば EEXIST で失敗）
					fs.writeFileSync(skillPath, skillContent, { encoding: 'utf-8', flag: 'wx' });
				} catch {
					// EEXIST: ファイル既存は正常
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

	// Agent Note ストレージをクリア（全ページ削除）
	const clearContext = vscode.commands.registerCommand(
		'anytime-markdown.clearContext',
		async () => {
			const answer = await vscode.window.showWarningMessage(
				'すべてのノートページと画像を削除しますか？',
				{ modal: true },
				'Delete'
			);
			if (answer !== 'Delete') { return; }
			const dir = context.globalStorageUri.fsPath;
			if (fs.existsSync(dir)) {
				for (const f of fs.readdirSync(dir)) {
					if (f.startsWith('anytime-note') && f.endsWith('.md')) {
						fs.rmSync(path.join(dir, f));
					}
				}
				const imagesDir = path.join(dir, 'images');
				if (fs.existsSync(imagesDir)) {
					fs.rmSync(imagesDir, { recursive: true, force: true });
				}
			}
			aiNoteProvider.refresh();
			vscode.window.showInformationMessage('ノートをクリアしました。');
		}
	);

	// ノートページを新規追加（ファイル名: anytime-note-{N}.md）
	const addNotePage = vscode.commands.registerCommand(
		'anytime-markdown.addNotePage',
		async () => {
			const dir = context.globalStorageUri.fsPath;
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			// 次のページ番号を決定
			const existing = fs.existsSync(dir)
				? fs.readdirSync(dir)
					.filter(f => /^anytime-note-\d+\.md$/.test(f))
					.map(f => Number.parseInt(f.replace('anytime-note-', '').replace('.md', ''), 10))
				: [];
			const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
			const fileName = `anytime-note-${nextNum}.md`;
			const filePath = path.join(dir, fileName);
			fs.writeFileSync(filePath, `# anytime-note-${nextNum}\n\n`, { encoding: 'utf-8' });
			aiNoteProvider.refresh();
			const uri = vscode.Uri.file(filePath);
			await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownEditorProvider.viewType);
		}
	);

	// ノートページをコンテキストメニューから削除
	const deleteNotePage = vscode.commands.registerCommand(
		'anytime-markdown.deleteNotePage',
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

	// ノートページを開く（ツリーアイテムクリック）
	const openNotePage = vscode.commands.registerCommand(
		'anytime-markdown.openNotePage',
		async (filePath: string) => {
			const uri = vscode.Uri.file(filePath);
			await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownEditorProvider.viewType);
		}
	);

	// Claude Code 編集通知: ステータスファイル監視 + エディタロック
	const claudeEnabled = setupClaudeHooks();
	const claudeSubscriptions: vscode.Disposable[] = [];
	if (claudeEnabled) {
		const watcher = new ClaudeStatusWatcher();
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
		openContext, copyContextPath, clearContext,
		addNotePage, deleteNotePage, openNotePage,
		aiNoteTreeView,
		...claudeSubscriptions,
	);
}

export function deactivate() {
  // Intentionally empty – VS Code requires this export but no cleanup is needed.
}
