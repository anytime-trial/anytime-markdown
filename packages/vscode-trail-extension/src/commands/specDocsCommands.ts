import * as vscode from 'vscode';
import * as path from 'node:path';
import { SpecDocsProvider, SpecDocsItem, SpecDocsRootItem } from '../providers/SpecDocsProvider';
import { ChangesProvider } from '../providers/ChangesProvider';
import { TimelineProvider } from '../providers/TimelineProvider';

/** .md / .markdown ファイルかどうか判定する */
export function isMarkdownFile(filePath: string): boolean {
	const lower = filePath.toLowerCase();
	return lower.endsWith('.md') || lower.endsWith('.markdown');
}

export interface SpecDocsCommandsDeps {
	specDocsProvider: SpecDocsProvider;
	changesProvider: ChangesProvider | undefined;
	timelineProvider: TimelineProvider | undefined;
	setActiveRoot: (rootPath: string | null) => void;
}

export function registerSpecDocsCommands(
	context: vscode.ExtensionContext,
	deps: SpecDocsCommandsDeps,
): void {
	const { specDocsProvider, changesProvider, timelineProvider, setActiveRoot } = deps;

	// ダブルクリック検出用
	let lastSpecClickUri: string | null = null;
	let lastSpecClickTime = 0;

	const specDocsOpenFile = vscode.commands.registerCommand(
		'anytime-trail.specDocsOpenFile',
		async (uri: vscode.Uri) => {
			const now = Date.now();
			const isDoubleClick = lastSpecClickUri === uri.toString() && (now - lastSpecClickTime) < 500;
			lastSpecClickUri = uri.toString();
			lastSpecClickTime = now;

			if (isMarkdownFile(uri.fsPath)) {
				const commands = await vscode.commands.getCommands(true);
				if (commands.includes('anytime-markdown.openEditorWithFile')) {
					await vscode.commands.executeCommand('anytime-markdown.openEditorWithFile', uri);
				} else {
					await vscode.commands.executeCommand('vscode.open', uri, { preview: !isDoubleClick });
				}
			} else {
				await vscode.commands.executeCommand('vscode.open', uri, { preview: !isDoubleClick });
			}

			// ファイルのルートを判定して activeRoot を更新
			const fileRoot = specDocsProvider.findRootForPath(uri.fsPath);
			if (fileRoot) {
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
		'anytime-trail.specDocsOpenFolder', () => specDocsProvider.openFolder()
	);
	const specDocsCloneRepo = vscode.commands.registerCommand(
		'anytime-trail.specDocsCloneRepo', () => specDocsProvider.cloneRepository()
	);
	const specDocsClose = vscode.commands.registerCommand(
		'anytime-trail.specDocsClose', () => specDocsProvider.closeFolder()
	);
	const specDocsRefresh = vscode.commands.registerCommand(
		'anytime-trail.specDocsRefresh', () => specDocsProvider.refresh()
	);
	const switchBranch = vscode.commands.registerCommand(
		'anytime-trail.switchBranch', (item?: SpecDocsRootItem) => {
			specDocsProvider.switchBranch(item?.rootPath);
		}
	);
	const toggleMdOnly = vscode.commands.registerCommand(
		'anytime-trail.toggleMdOnly', () => {
			specDocsProvider.toggleMdOnly();
			changesProvider?.refresh();
		}
	);

	// ファイル/フォルダ操作
	const specDocsCreateFile = vscode.commands.registerCommand(
		'anytime-trail.specDocsCreateFile', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.createFile(item)
	);
	const specDocsCreateFolder = vscode.commands.registerCommand(
		'anytime-trail.specDocsCreateFolder', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.createFolder(item)
	);
	const specDocsDelete = vscode.commands.registerCommand(
		'anytime-trail.specDocsDelete', (item: SpecDocsItem) => specDocsProvider.deleteItem(item)
	);
	const specDocsRename = vscode.commands.registerCommand(
		'anytime-trail.specDocsRename', (item: SpecDocsItem) => specDocsProvider.renameItem(item)
	);
	const specDocsRemoveRoot = vscode.commands.registerCommand(
		'anytime-trail.specDocsRemoveRoot', (item: SpecDocsRootItem) => specDocsProvider.removeRoot(item.rootPath)
	);
	const specDocsCopyPath = vscode.commands.registerCommand(
		'anytime-trail.specDocsCopyPath', (item: SpecDocsItem) => {
			if (item?.resourceUri) {
				vscode.env.clipboard.writeText(item.resourceUri.fsPath);
			}
		}
	);
	const specDocsCopyFileName = vscode.commands.registerCommand(
		'anytime-trail.specDocsCopyFileName', (item: SpecDocsItem) => {
			if (item?.resourceUri) {
				vscode.env.clipboard.writeText(path.basename(item.resourceUri.fsPath));
			}
		}
	);
	const specDocsImportFiles = vscode.commands.registerCommand(
		'anytime-trail.specDocsImportFiles', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.importFiles(item)
	);
	const specDocsCut = vscode.commands.registerCommand(
		'anytime-trail.specDocsCut', (item: SpecDocsItem) => specDocsProvider.cut(item)
	);
	const specDocsCopy = vscode.commands.registerCommand(
		'anytime-trail.specDocsCopy', (item: SpecDocsItem) => specDocsProvider.copy(item)
	);
	const specDocsPaste = vscode.commands.registerCommand(
		'anytime-trail.specDocsPaste', (item?: SpecDocsRootItem | SpecDocsItem) => specDocsProvider.paste(item)
	);

	context.subscriptions.push(
		specDocsOpenFile, specDocsOpenFolder, specDocsCloneRepo, specDocsClose, specDocsRefresh,
		switchBranch, toggleMdOnly,
		specDocsCreateFile, specDocsCreateFolder, specDocsDelete, specDocsRename,
		specDocsRemoveRoot, specDocsCopyPath, specDocsCopyFileName,
		specDocsImportFiles, specDocsCut, specDocsCopy, specDocsPaste,
	);
}
