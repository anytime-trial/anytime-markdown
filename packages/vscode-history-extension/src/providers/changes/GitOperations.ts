import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';

import type { ChangesFileItem } from './types';
import { getChanges, getSyncInfo } from './GitStatusParser';
import { gitExec } from '../../utils/gitExec';

export interface GitOperationsHost {
	readonly primaryGitRoot: string | null;
	refresh(): void;
}

export async function stageFile(host: GitOperationsHost, item: ChangesFileItem): Promise<void> {
	try {
		await gitExec(['add', '--', item.filePath], { cwd: item.gitRoot });
		host.refresh();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		vscode.window.showErrorMessage(`Stage failed: ${msg}`);
	}
}

export async function unstageFile(host: GitOperationsHost, item: ChangesFileItem): Promise<void> {
	try {
		await gitExec(['reset', 'HEAD', '--', item.filePath], { cwd: item.gitRoot });
		host.refresh();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		vscode.window.showErrorMessage(`Unstage failed: ${msg}`);
	}
}

export async function stageAll(host: GitOperationsHost, gitRoot?: string): Promise<void> {
	const target = gitRoot ?? host.primaryGitRoot;
	if (!target) return;
	try {
		await gitExec(['add', '-A'], { cwd: target });
		host.refresh();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		vscode.window.showErrorMessage(`Stage all failed: ${msg}`);
	}
}

export async function unstageAll(host: GitOperationsHost, gitRoot?: string): Promise<void> {
	const target = gitRoot ?? host.primaryGitRoot;
	if (!target) return;
	try {
		await gitExec(['reset', 'HEAD'], { cwd: target });
		host.refresh();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		vscode.window.showErrorMessage(`Unstage all failed: ${msg}`);
	}
}

export async function discardAll(host: GitOperationsHost, gitRoot?: string): Promise<void> {
	const target = gitRoot ?? host.primaryGitRoot;
	if (!target) return;
	const answer = await vscode.window.showWarningMessage(
		'Discard all changes? This cannot be undone.',
		{ modal: true },
		'Discard All',
	);
	if (answer !== 'Discard All') return;
	try {
		await gitExec(['checkout', '--', '.'], { cwd: target });
		// 未追跡ファイルも削除
		await gitExec(['clean', '-fd'], { cwd: target });
		host.refresh();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		vscode.window.showErrorMessage(`Discard all failed: ${msg}`);
	}
}

export async function commit(host: GitOperationsHost, gitRoot?: string): Promise<void> {
	const target = gitRoot ?? host.primaryGitRoot;
	if (!target) {
		vscode.window.showWarningMessage('No Git repository found.');
		return;
	}
	const { staged } = await getChanges(target);
	if (staged.length === 0) {
		vscode.window.showWarningMessage('No staged changes to commit.');
		return;
	}
	const message = await vscode.window.showInputBox({
		prompt: 'Commit message',
		placeHolder: 'Enter commit message',
	});
	if (!message) return;
	try {
		await gitExec(['commit', '-m', message], { cwd: target });
		vscode.window.showInformationMessage(`Committed: ${message}`);
		host.refresh();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		vscode.window.showErrorMessage(`Commit failed: ${msg}`);
	}
}

export async function push(host: GitOperationsHost, gitRoot?: string): Promise<void> {
	const target = gitRoot ?? host.primaryGitRoot;
	if (!target) {
		vscode.window.showWarningMessage('No Git repository found.');
		return;
	}
	try {
		await gitExec(['push'], { cwd: target });
		vscode.window.showInformationMessage('Push completed.');
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		vscode.window.showErrorMessage(`Push failed: ${msg}`);
	}
}

export async function sync(host: GitOperationsHost, gitRoot?: string): Promise<void> {
	const target = gitRoot ?? host.primaryGitRoot;
	if (!target) { return; }
	try {
		const { ahead, behind } = await getSyncInfo(target);
		if (behind > 0) {
			await gitExec(['pull'], { cwd: target });
		}
		if (ahead > 0) {
			await gitExec(['push'], { cwd: target });
		}
		vscode.window.showInformationMessage('Sync completed.');
		host.refresh();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		vscode.window.showErrorMessage(`Sync failed: ${msg}`);
	}
}

export async function discardChanges(host: GitOperationsHost, item: ChangesFileItem): Promise<void> {
	const answer = await vscode.window.showWarningMessage(
		`Are you sure you want to discard changes in "${path.basename(item.filePath)}"?`,
		{ modal: true },
		'Discard',
	);
	if (answer !== 'Discard') { return; }
	try {
		// untracked ファイルは git 管理外なので直接削除
		let isUntracked = false;
		if (item.group === 'changes' && fs.existsSync(item.absPath)) {
			try {
				await gitExec(['ls-files', '--error-unmatch', '--', item.filePath], { cwd: item.gitRoot });
			} catch {
				isUntracked = true;
			}
		}
		if (isUntracked) {
			fs.unlinkSync(item.absPath);
		} else {
			await gitExec(['checkout', 'HEAD', '--', item.filePath], { cwd: item.gitRoot });
		}
		await closeTab(item.absPath);
		host.refresh();
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		vscode.window.showErrorMessage(`Discard failed: ${msg}`);
	}
}

/** 指定パスのファイルタブを閉じる */
export async function closeTab(absPath: string): Promise<void> {
	const uri = vscode.Uri.file(absPath);
	for (const group of vscode.window.tabGroups.all) {
		for (const tab of group.tabs) {
			const input = tab.input;
			if (input && typeof input === 'object' && 'uri' in input) {
				const tabUri = (input as { uri: vscode.Uri }).uri;
				if (tabUri.fsPath === uri.fsPath) {
					await vscode.window.tabGroups.close(tab);
					return;
				}
			}
		}
	}
}

/** 変更一覧から消えたファイルのタブを閉じる */
export async function closeRemovedTabs(currentPaths: Set<string>, previousPaths: Set<string>): Promise<void> {
	for (const p of previousPaths) {
		if (!currentPaths.has(p)) {
			await closeTab(p);
		}
	}
}
