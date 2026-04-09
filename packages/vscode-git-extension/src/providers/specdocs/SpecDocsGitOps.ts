import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface SpecDocsGitOpsHost {
	readonly roots: string[];
	getRepoInfo(rootPath?: string): { repoName: string; branchName: string } | null;
	addRoot(dirPath: string): void;
	fireTreeDataChange(): void;
}

/** git リポジトリのルートディレクトリを返す */
export function findGitRoot(roots: string[], rootPath?: string): string | null {
	const target = rootPath ?? roots[0];
	if (!target) { return null; }
	let dir = target;
	while (dir !== path.dirname(dir)) {
		if (fs.existsSync(path.join(dir, '.git'))) { return dir; }
		dir = path.dirname(dir);
	}
	return null;
}

export async function switchBranch(host: SpecDocsGitOpsHost, rootPath?: string): Promise<void> {
	const gitRoot = findGitRoot(host.roots, rootPath);
	if (!gitRoot) {
		vscode.window.showWarningMessage('Git repository not found.');
		return;
	}

	const { execFileSync } = await import('node:child_process');

	// ローカル＋リモートブランチ一覧を取得
	let branches: string[];
	try {
		const output = execFileSync('git', ['branch', '-a', '--no-color'], { cwd: gitRoot, encoding: 'utf-8' });
		branches = output.split('\n')
			.map(b => b.replace(/^\*?\s+/, '').trim())
			.filter(b => b && !b.includes('HEAD'))
			.map(b => b.replace(/^remotes\/origin\//, ''))
			.filter((b, i, arr) => arr.indexOf(b) === i); // 重複排除
	} catch {
		vscode.window.showErrorMessage('Failed to list branches.');
		return;
	}

	// 現在のブランチ
	const info = host.getRepoInfo(rootPath);
	const currentBranch = info?.branchName ?? '';

	const items = branches.map(b => ({
		label: b,
		description: b === currentBranch ? '(current)' : '',
	}));

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: 'Select branch to checkout',
	});
	if (!selected || selected.label === currentBranch) { return; }

	try {
		execFileSync('git', ['checkout', selected.label], { cwd: gitRoot, encoding: 'utf-8' });
		host.fireTreeDataChange();
		vscode.window.showInformationMessage(`Switched to branch: ${selected.label}`);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		vscode.window.showErrorMessage(`Checkout failed: ${msg}`);
	}
}

export async function cloneRepository(host: SpecDocsGitOpsHost): Promise<void> {
	const url = await vscode.window.showInputBox({
		prompt: 'Git repository URL',
		placeHolder: 'https://github.com/user/repo.git',
	});
	if (!url) return;

	const targetDirs = await vscode.window.showOpenDialog({
		canSelectFolders: true,
		canSelectFiles: false,
		canSelectMany: false,
		openLabel: 'Select Clone Destination',
	});
	if (!targetDirs || targetDirs.length === 0) return;

	const repoName = path.basename(url, '.git').replace(/\.git$/, '') || 'repo';
	const clonePath = path.join(targetDirs[0].fsPath, repoName);

	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'Cloning repository...' },
		async () => {
			const { execFile } = await import('node:child_process');
			await new Promise<void>((resolve, reject) => {
				execFile('git', ['clone', url, clonePath], (error) => {
					if (error) {
						reject(error);
					} else {
						resolve();
					}
				});
			});
		}
	);

	host.addRoot(clonePath);
}
