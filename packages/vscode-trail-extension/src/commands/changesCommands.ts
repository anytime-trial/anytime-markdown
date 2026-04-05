import * as vscode from 'vscode';
import * as path from 'node:path';
import { ChangesProvider, ChangesFileItem } from '../providers/ChangesProvider';
import { TimelineProvider, TimelineItem } from '../providers/TimelineProvider';
import { isMarkdownFile } from './specDocsCommands';

/** git の元コンテンツを提供する TextDocumentContentProvider */
export class GitOriginalContentProvider implements vscode.TextDocumentContentProvider {
	private contentMap = new Map<string, string>();

	setContent(uriString: string, content: string): void {
		this.contentMap.set(uriString, content);
	}

	provideTextDocumentContent(uri: vscode.Uri): string {
		return this.contentMap.get(uri.toString()) ?? '';
	}
}

/** Anytime Markdown の比較モードでファイルを開く（利用可能な場合） */
async function openWithMarkdownCompare(uri: vscode.Uri, originalContent: string): Promise<boolean> {
	const commands = await vscode.commands.getCommands(true);
	if (commands.includes('anytime-markdown.openCompareMode')) {
		await vscode.commands.executeCommand('anytime-markdown.openCompareMode', uri, originalContent);
		return true;
	}
	return false;
}

/** vscode.diff を使用して差分を表示する */
async function openWithVsCodeDiff(
	gitContentProvider: GitOriginalContentProvider,
	filePath: string,
	currentUri: vscode.Uri,
	originalContent: string,
	diffLabel: string,
): Promise<void> {
	const originalUri = vscode.Uri.parse(`anytime-trail-original:${encodeURIComponent(filePath)}?ts=${Date.now()}`);
	gitContentProvider.setContent(originalUri.toString(), originalContent);
	await vscode.commands.executeCommand('vscode.diff', originalUri, currentUri, diffLabel);
}

export interface ChangesCommandsDeps {
	changesProvider: ChangesProvider | undefined;
	timelineProvider: TimelineProvider | undefined;
	gitContentProvider: GitOriginalContentProvider;
}

export function registerChangesCommands(
	context: vscode.ExtensionContext,
	deps: ChangesCommandsDeps,
): void {
	const { changesProvider, timelineProvider, gitContentProvider } = deps;

	const changesRefresh = vscode.commands.registerCommand(
		'anytime-trail.changesRefresh', () => changesProvider?.refresh()
	);
	const stageFile = vscode.commands.registerCommand(
		'anytime-trail.stageFile', (item: ChangesFileItem) => changesProvider?.stageFile(item)
	);
	const unstageFile = vscode.commands.registerCommand(
		'anytime-trail.unstageFile', (item: ChangesFileItem) => changesProvider?.unstageFile(item)
	);
	const stageAll = vscode.commands.registerCommand(
		'anytime-trail.stageAll', (gitRoot?: string) => changesProvider?.stageAll(gitRoot)
	);
	const unstageAll = vscode.commands.registerCommand(
		'anytime-trail.unstageAll', (gitRoot?: string) => changesProvider?.unstageAll(gitRoot)
	);
	const discardAll = vscode.commands.registerCommand(
		'anytime-trail.discardAll', (gitRoot?: string) => changesProvider?.discardAll(gitRoot)
	);
	const discardChanges = vscode.commands.registerCommand(
		'anytime-trail.discardChanges', (item: ChangesFileItem) => changesProvider?.discardChanges(item)
	);

	// 変更: シングルクリックでプレビュー、ダブルクリックで固定タブ
	let lastChangesClickUri: string | null = null;
	let lastChangesClickTime = 0;
	const changesOpenFile = vscode.commands.registerCommand(
		'anytime-trail.changesOpenFile',
		async (gitRoot: string, filePath: string, group: 'staged' | 'changes', currentUri: vscode.Uri, isMd: boolean, diffLabel: string) => {
			const now = Date.now();
			const uriStr = currentUri.toString();
			const _isDoubleClick = lastChangesClickUri === uriStr && (now - lastChangesClickTime) < 500;
			lastChangesClickUri = uriStr;
			lastChangesClickTime = now;

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

			if (isMd && isMarkdownFile(currentUri.fsPath)) {
				const opened = await openWithMarkdownCompare(currentUri, originalContent);
				if (!opened) {
					await openWithVsCodeDiff(gitContentProvider, filePath, currentUri, originalContent, diffLabel);
				}
			} else {
				await openWithVsCodeDiff(gitContentProvider, filePath, currentUri, originalContent, diffLabel);
			}

			// git history を更新
			if (gitRoot) {
				timelineProvider?.refreshWithGitRoot(currentUri.fsPath, gitRoot);
			}
		}
	);

	const commitChanges = vscode.commands.registerCommand(
		'anytime-trail.commitChanges', () => changesProvider?.commit()
	);
	const syncChanges = vscode.commands.registerCommand(
		'anytime-trail.syncChanges', (gitRoot?: string) => changesProvider?.sync(gitRoot)
	);
	const pushChanges = vscode.commands.registerCommand(
		'anytime-trail.pushChanges', () => changesProvider?.push()
	);

	// Timeline: コミットとの比較
	const compareWithCommit = vscode.commands.registerCommand(
		'anytime-trail.compareWithCommit',
		async (item: TimelineItem) => {
			const content = await timelineProvider?.getCommitContent(item);
			if (content == null) {
				vscode.window.showWarningMessage('Could not load file content for this commit.');
				return;
			}

			if (isMarkdownFile(item.fileUri.fsPath)) {
				const opened = await openWithMarkdownCompare(item.fileUri, content);
				if (!opened) {
					const shortHash = item.commit.hash.substring(0, 7);
					const label = `${path.basename(item.fileUri.fsPath)} (${shortHash} vs Working)`;
					await openWithVsCodeDiff(gitContentProvider, item.fileUri.fsPath, item.fileUri, content, label);
				}
			} else {
				const shortHash = item.commit.hash.substring(0, 7);
				const label = `${path.basename(item.fileUri.fsPath)} (${shortHash} vs Working)`;
				await openWithVsCodeDiff(gitContentProvider, item.fileUri.fsPath, item.fileUri, content, label);
			}
		}
	);

	context.subscriptions.push(
		changesRefresh, stageFile, unstageFile, stageAll, unstageAll,
		discardAll, discardChanges, changesOpenFile,
		commitChanges, syncChanges, pushChanges,
		compareWithCommit,
	);
}
