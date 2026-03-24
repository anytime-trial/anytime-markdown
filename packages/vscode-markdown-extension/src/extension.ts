import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MarkdownEditorProvider } from './providers/MarkdownEditorProvider';
import { TimelineProvider, TimelineItem } from './providers/TimelineProvider';
import { GraphProvider } from './providers/GraphProvider';
import { ChangesProvider, ChangesFileItem } from './providers/ChangesProvider';
import { SpecDocsProvider, SpecDocsItem, SpecDocsRootItem, SpecDocsDragAndDrop } from './providers/SpecDocsProvider';
import { LinkValidationProvider } from './providers/LinkValidationProvider';
import { AiLogProvider, AiLogItem } from './providers/AiLogProvider';
import { AiMemoryProvider, AiMemoryItem } from './providers/AiMemoryProvider';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		MarkdownEditorProvider.register(context),
		// リンク検証（壊れたリンクの波線警告）
		new LinkValidationProvider(),
	);

	// Git 関連パネル（ワークスペースが開かれている場合のみ初期化）
	const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;

	let changesProvider: ChangesProvider | undefined;
	let changesTreeView: vscode.TreeView<vscode.TreeItem> | undefined;
	let timelineProvider: TimelineProvider | undefined;
	let timelineTreeView: vscode.TreeView<TimelineItem> | undefined;
	let graphProvider: GraphProvider | undefined;
	let graphTreeView: vscode.TreeView<vscode.TreeItem> | undefined;

	if (hasWorkspace) {
		changesProvider = new ChangesProvider();
		changesTreeView = vscode.window.createTreeView('anytimeMarkdown.changes', {
			treeDataProvider: changesProvider,
		});

		// 変更ファイル数をサイドバーバッジに表示 + 消えたファイルのタブを閉じる
		let previousChangedPaths = new Set<string>();
		const updateChangesBadge = () => {
			const count = changesProvider!.getChangesCount();
			changesTreeView!.badge = count > 0
				? { value: count, tooltip: `${count} changes` }
				: undefined;
			changesProvider!.closeRemovedTabs(previousChangedPaths);
			previousChangedPaths = changesProvider!.getChangedPaths();
		};
		changesProvider.onDidChangeTreeData(updateChangesBadge);
		setTimeout(() => {
			updateChangesBadge();
			previousChangedPaths = changesProvider!.getChangedPaths();
		}, 2000);

		timelineProvider = new TimelineProvider();
		timelineTreeView = vscode.window.createTreeView('anytimeMarkdown.timeline', {
			treeDataProvider: timelineProvider,
		});

		graphProvider = new GraphProvider(context);
		graphTreeView = vscode.window.createTreeView('anytimeMarkdown.graph', {
			treeDataProvider: graphProvider,
		});
	}

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

	// アクティブドキュメント変更時に履歴を更新（外部リポジトリモード中はスキップ）
	const updateTimeline = () => {
		if (!timelineProvider || timelineProvider.isExternalMode) return;
		const p = MarkdownEditorProvider.getInstance();
		timelineProvider.refresh(p?.activeDocumentUri ?? null);
	};

	// カスタムエディタのアクティブ変更を監視
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => {
			updateTimeline();
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
			updateTimeline();
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
		async (item: TimelineItem) => {
			const p = MarkdownEditorProvider.getInstance();
			if (!p) { return; }
			const content = await timelineProvider?.getCommitContent(item);
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

	// マークダウン管理パネル
	const specDocsProvider = new SpecDocsProvider(context);
	const specDocsDragAndDrop = new SpecDocsDragAndDrop(specDocsProvider);
	const specDocsTreeView = vscode.window.createTreeView('anytimeMarkdown.specDocs', {
		treeDataProvider: specDocsProvider,
		dragAndDropController: specDocsDragAndDrop,
	});

	// アクティブルート追跡
	let activeRoot: string | null = specDocsProvider.roots[0] ?? null;

	const updateSpecDocsTitle = () => {
		// ツリーのトップは常にリポジトリノードを表示するため、タイトルはデフォルトのまま
		specDocsTreeView.description = '';
	};

	const setActiveRoot = (rootPath: string | null) => {
		activeRoot = rootPath;
		changesProvider?.setPrimaryRoot(rootPath);
		graphProvider?.setTargetRoot(rootPath);
	};

	let previousRoots: string[] = [];
	specDocsProvider.onDidChangeTreeData(() => {
		updateSpecDocsTitle();
		const roots = specDocsProvider.roots;
		// ルート一覧が変わった場合のみ changesProvider を更新
		if (JSON.stringify(roots) !== JSON.stringify(previousRoots)) {
			previousRoots = roots;
			changesProvider?.setTargetRoots(roots);
		}
		if (roots.length === 0) {
			setActiveRoot(null);
		} else if (activeRoot && !roots.includes(activeRoot)) {
			// activeRoot が削除された場合: 最初のルートにフォールバック
			setActiveRoot(roots[0]);
		} else if (!activeRoot) {
			setActiveRoot(roots[0]);
		}
	});
	updateSpecDocsTitle();
	// 初回: git 初期化を待ってからターゲットを設定
	if (changesProvider) {
		setTimeout(() => {
			changesProvider!.setTargetRoots(specDocsProvider.roots);
			previousRoots = specDocsProvider.roots;
			setActiveRoot(activeRoot);
		}, 2000);
	}

	// マークダウン管理: シングルクリックでプレビュー、ダブルクリックで固定タブ（常に通常モード）
	let lastSpecClickUri: string | null = null;
	let lastSpecClickTime = 0;
	const specDocsOpenFile = vscode.commands.registerCommand(
		'anytime-markdown.specDocsOpenFile',
		async (uri: vscode.Uri) => {
			const now = Date.now();
			const isDoubleClick = lastSpecClickUri === uri.toString() && (now - lastSpecClickTime) < 500;
			lastSpecClickUri = uri.toString();
			lastSpecClickTime = now;

			const p = MarkdownEditorProvider.getInstance();
			if (p) {
				p.skipDiffDetection = true;
				p.pendingCompareContent = null; // 通常モードで開く
			}

			await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownEditorProvider.viewType, { preview: !isDoubleClick });

			// 既に開いているタブが比較モードの場合、通常モードに戻す
			if (p?.compareModeActive) {
				await p.waitForReady(uri);
				p.postMessageToPanel(uri, { type: 'exitCompareMode' });
			}

			// ファイルのルートを判定して activeRoot を更新
			const fileRoot = specDocsProvider.findRootForPath(uri.fsPath);
			if (fileRoot && fileRoot !== activeRoot) {
				setActiveRoot(fileRoot);
			}

			// git history を更新
			const fileGitRoot = changesProvider?.findGitRootForPath(uri.fsPath);
			if (fileGitRoot) {
				timelineProvider?.refreshWithGitRoot(uri.fsPath, fileGitRoot);
			}
		}
	);

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
	const switchBranch = vscode.commands.registerCommand(
		'anytime-markdown.switchBranch', (item?: SpecDocsRootItem) => {
			specDocsProvider.switchBranch(item?.rootPath);
		}
	);
	const graphRefresh = vscode.commands.registerCommand(
		'anytime-markdown.graphRefresh', () => graphProvider?.refresh()
	);
	const toggleMdOnly = vscode.commands.registerCommand(
		'anytime-markdown.toggleMdOnly', () => {
			specDocsProvider.toggleMdOnly();
			changesProvider?.refresh();
		}
	);
	changesProvider?.setMdOnlyGetter(() => specDocsProvider.mdOnly);

	// マークダウン管理: ファイル/フォルダ操作
	const specDocsCreateFile = vscode.commands.registerCommand(
		'anytime-markdown.specDocsCreateFile', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.createFile(item)
	);
	const specDocsCreateFolder = vscode.commands.registerCommand(
		'anytime-markdown.specDocsCreateFolder', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.createFolder(item)
	);
	const specDocsDelete = vscode.commands.registerCommand(
		'anytime-markdown.specDocsDelete', (item: SpecDocsItem) => specDocsProvider.deleteItem(item)
	);
	const specDocsRename = vscode.commands.registerCommand(
		'anytime-markdown.specDocsRename', (item: SpecDocsItem) => specDocsProvider.renameItem(item)
	);
	const specDocsRemoveRoot = vscode.commands.registerCommand(
		'anytime-markdown.specDocsRemoveRoot', (item: SpecDocsRootItem) => specDocsProvider.removeRoot(item.rootPath)
	);
	const specDocsCopyPath = vscode.commands.registerCommand(
		'anytime-markdown.specDocsCopyPath', (item: SpecDocsItem) => {
			if (item?.resourceUri) {
				vscode.env.clipboard.writeText(item.resourceUri.fsPath);
			}
		}
	);
	const specDocsCopyFileName = vscode.commands.registerCommand(
		'anytime-markdown.specDocsCopyFileName', (item: SpecDocsItem) => {
			if (item?.resourceUri) {
				vscode.env.clipboard.writeText(path.basename(item.resourceUri.fsPath));
			}
		}
	);
	const specDocsImportFiles = vscode.commands.registerCommand(
		'anytime-markdown.specDocsImportFiles', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.importFiles(item)
	);
	const specDocsCut = vscode.commands.registerCommand(
		'anytime-markdown.specDocsCut', (item: SpecDocsItem) => specDocsProvider.cut(item)
	);
	const specDocsCopy = vscode.commands.registerCommand(
		'anytime-markdown.specDocsCopy', (item: SpecDocsItem) => specDocsProvider.copy(item)
	);
	const specDocsPaste = vscode.commands.registerCommand(
		'anytime-markdown.specDocsPaste', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.paste(item)
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

	// Git 変更コマンド
	const changesRefresh = vscode.commands.registerCommand(
		'anytime-markdown.changesRefresh', () => changesProvider?.refresh()
	);
	const stageFile = vscode.commands.registerCommand(
		'anytime-markdown.stageFile', (item: ChangesFileItem) => changesProvider?.stageFile(item)
	);
	const unstageFile = vscode.commands.registerCommand(
		'anytime-markdown.unstageFile', (item: ChangesFileItem) => changesProvider?.unstageFile(item)
	);
	const stageAll = vscode.commands.registerCommand(
		'anytime-markdown.stageAll', (gitRoot?: string) => changesProvider?.stageAll(gitRoot)
	);
	const unstageAll = vscode.commands.registerCommand(
		'anytime-markdown.unstageAll', (gitRoot?: string) => changesProvider?.unstageAll(gitRoot)
	);
	const discardAll = vscode.commands.registerCommand(
		'anytime-markdown.discardAll', (gitRoot?: string) => changesProvider?.discardAll(gitRoot)
	);
	const discardChanges = vscode.commands.registerCommand(
		'anytime-markdown.discardChanges', (item: ChangesFileItem) => changesProvider?.discardChanges(item)
	);
	// 変更: シングルクリックでプレビュー、ダブルクリックで固定タブ
	let lastChangesClickUri: string | null = null;
	let lastChangesClickTime = 0;
	const changesOpenFile = vscode.commands.registerCommand(
		'anytime-markdown.changesOpenFile',
		async (gitRoot: string, filePath: string, group: 'staged' | 'changes', currentUri: vscode.Uri, isMd: boolean, diffLabel: string) => {
			const now = Date.now();
			const uriStr = currentUri.toString();
			const isDoubleClick = lastChangesClickUri === uriStr && (now - lastChangesClickTime) < 500;
			lastChangesClickUri = uriStr;
			lastChangesClickTime = now;

			if (isMd) {
				const p = MarkdownEditorProvider.getInstance();
				if (p) { p.skipDiffDetection = true; }
				// git コマンドで変更前コンテンツを取得
				let originalContent: string;
				try {
					const { execFileSync } = await import('node:child_process');
					originalContent = group === 'staged'
						? execFileSync('git', ['show', `HEAD:${filePath}`], { cwd: gitRoot, encoding: 'utf-8' })
						: execFileSync('git', ['show', `:${filePath}`], { cwd: gitRoot, encoding: 'utf-8' });
				} catch {
					originalContent = '';
				}
				if (p) { p.pendingCompareContent = originalContent; }
				await vscode.commands.executeCommand('vscode.openWith', currentUri, MarkdownEditorProvider.viewType, { preview: !isDoubleClick });
				// 既に開いているタブの場合、pendingCompareContent が消費されていない → 直接送信
				if (p && p.pendingCompareContent !== null) {
					p.pendingCompareContent = null;
					await p.waitForReady(currentUri);
					p.postMessageToPanel(currentUri, { type: 'loadCompareFile', content: originalContent });
				}
			} else {
				await vscode.commands.executeCommand('vscode.diff', currentUri, currentUri, diffLabel);
			}

			// git history を更新
			if (gitRoot) {
				timelineProvider?.refreshWithGitRoot(currentUri.fsPath, gitRoot);
			}
		}
	);

	const commitChanges = vscode.commands.registerCommand(
		'anytime-markdown.commitChanges', () => changesProvider?.commit()
	);
	const syncChanges = vscode.commands.registerCommand(
		'anytime-markdown.syncChanges', (gitRoot?: string) => changesProvider?.sync(gitRoot)
	);
	const pushChanges = vscode.commands.registerCommand(
		'anytime-markdown.pushChanges', () => changesProvider?.push()
	);
	const openChangeDiff = vscode.commands.registerCommand(
		'anytime-markdown.openChangeDiff',
		async (gitRoot: string, filePath: string, group: 'staged' | 'changes', currentUri: vscode.Uri) => {
			// git コマンドで変更前コンテンツを取得
			let originalContent: string;
			try {
				const { execFileSync } = await import('node:child_process');
				if (group === 'staged') {
					// ステージ済み: HEAD のコンテンツ
					originalContent = execFileSync('git', ['show', `HEAD:${filePath}`], { cwd: gitRoot, encoding: 'utf-8' });
				} else {
					// 未ステージ: インデックス（ステージ済み or HEAD）のコンテンツ
					originalContent = execFileSync('git', ['show', `:${filePath}`], { cwd: gitRoot, encoding: 'utf-8' });
				}
			} catch {
				originalContent = '';
			}
			const p = MarkdownEditorProvider.getInstance();
			if (p) {
				p.skipDiffDetection = true;
				p.pendingCompareContent = originalContent;
			}
			await vscode.commands.executeCommand(
				'vscode.openWith',
				currentUri,
				MarkdownEditorProvider.viewType,
			);
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

	// ファイル保存時にリフレッシュ
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(() => changesProvider?.refresh()),
		specDocsTreeView,
		...(changesProvider ? [changesTreeView!, { dispose: () => changesProvider!.dispose() }] : []),
		...(timelineTreeView ? [timelineTreeView] : []),
		...statusBarItems,
		openEditorWithFile, compareCmd, compareWithCommit,
		insertSectionNumbers, removeSectionNumbers,
		changesRefresh, stageFile, unstageFile, stageAll, unstageAll, discardAll, discardChanges, commitChanges, pushChanges, syncChanges, changesOpenFile, openChangeDiff,
		specDocsOpenFile, specDocsOpenFolder, specDocsCloneRepo, specDocsClose, specDocsRefresh, switchBranch, toggleMdOnly,
		specDocsCreateFile, specDocsCreateFolder, specDocsDelete, specDocsRename, specDocsRemoveRoot, specDocsCopyPath, specDocsCopyFileName, specDocsImportFiles, specDocsCut, specDocsCopy, specDocsPaste, pasteAsMarkdown,
		...(graphTreeView ? [graphTreeView] : []), graphRefresh,
		openContext, copyContextPath, clearContext,
		aiLogTreeView, aiLogRefresh, openAiLog,
		aiMemoryTreeView, aiMemoryRefresh, openAiMemory,
	);
}

export function deactivate() {
  // Intentionally empty – VS Code requires this export but no cleanup is needed.
}
