import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { showError } from '../../utils/errorHelpers';
import type { SpecDocsNode } from './types';
import { SpecDocsRootItem, SpecDocsItem } from './types';

export interface SpecDocsFileOpsHost {
	readonly roots: string[];
	readonly mdOnly: boolean;
	readonly context: vscode.ExtensionContext;
	refresh(): void;
	fireTreeDataChange(): void;
}

/** アイテムからドロップ先/作成先ディレクトリを解決する */
function resolveDestDir(host: SpecDocsFileOpsHost, item?: SpecDocsNode): string | undefined {
	if (item instanceof SpecDocsRootItem) return item.rootPath;
	if (item?.isDirectory) return item.resourceUri.fsPath;
	if (item) return path.dirname(item.resourceUri.fsPath);
	return host.roots[0];
}

export async function createFile(host: SpecDocsFileOpsHost, item?: SpecDocsNode): Promise<void> {
	const dir = resolveDestDir(host, item);
	if (!dir) return;
	const name = await vscode.window.showInputBox({ prompt: 'File name', placeHolder: 'newfile.md' });
	if (!name) return;
	const filePath = path.join(dir, name);
	try {
		fs.writeFileSync(filePath, '', 'utf-8');
		host.refresh();
	} catch (e: unknown) {
		showError('Create file failed', e);
	}
}

export async function deleteItem(host: SpecDocsFileOpsHost, item: SpecDocsItem): Promise<void> {
	const answer = await vscode.window.showWarningMessage(
		`"${item.label}" を削除しますか？`,
		{ modal: true },
		'Delete',
	);
	if (answer !== 'Delete') return;
	try {
		if (item.isDirectory) {
			fs.rmSync(item.resourceUri.fsPath, { recursive: true });
		} else {
			fs.unlinkSync(item.resourceUri.fsPath);
		}
		host.refresh();
	} catch (e: unknown) {
		showError('Delete failed', e);
	}
}

export async function renameItem(host: SpecDocsFileOpsHost, item: SpecDocsItem): Promise<void> {
	const oldName = path.basename(item.resourceUri.fsPath);
	const name = await vscode.window.showInputBox({ prompt: 'New name', value: oldName });
	if (!name || name === oldName) return;
	const newPath = path.join(path.dirname(item.resourceUri.fsPath), name);
	try {
		fs.renameSync(item.resourceUri.fsPath, newPath);
		host.refresh();
	} catch (e: unknown) {
		showError('Rename failed', e);
	}
}

export async function createFolder(host: SpecDocsFileOpsHost, item?: SpecDocsNode): Promise<void> {
	const dir = resolveDestDir(host, item);
	if (!dir) return;
	const name = await vscode.window.showInputBox({ prompt: 'Folder name', placeHolder: 'newfolder' });
	if (!name) return;
	const folderPath = path.join(dir, name);
	try {
		fs.mkdirSync(folderPath, { recursive: true });
		host.refresh();
	} catch (e: unknown) {
		showError('Create folder failed', e);
	}
}

export async function importFiles(host: SpecDocsFileOpsHost, item?: SpecDocsNode): Promise<void> {
	const destDir = resolveDestDir(host, item);
	if (!destDir) return;

	const uris = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectFolders: false,
		canSelectMany: true,
		openLabel: 'Import',
	});
	if (!uris || uris.length === 0) return;

	for (const uri of uris) {
		const name = path.basename(uri.fsPath);
		const dest = path.join(destDir, name);
		if (uri.fsPath === dest) continue;
		if (fs.existsSync(dest)) {
			const answer = await vscode.window.showWarningMessage(
				`"${name}" already exists. Overwrite?`,
				{ modal: true },
				'Overwrite',
			);
			if (answer !== 'Overwrite') continue;
		}
		try {
			fs.copyFileSync(uri.fsPath, dest);
		} catch (e: unknown) {
			showError('Import failed', e);
		}
	}
	host.refresh();
}

export interface Clipboard {
	paths: string[];
	isCut: boolean;
}

export function cut(item: SpecDocsItem): Clipboard {
	return { paths: [item.resourceUri.fsPath], isCut: true };
}

export function copy(item: SpecDocsItem): Clipboard {
	return { paths: [item.resourceUri.fsPath], isCut: false };
}

async function confirmOverwrite(name: string): Promise<boolean> {
	const answer = await vscode.window.showWarningMessage(
		`"${name}" already exists. Overwrite?`,
		{ modal: true },
		'Overwrite',
	);
	return answer === 'Overwrite';
}

function copyOrMoveFile(srcPath: string, dest: string, isCut: boolean): void {
	if (isCut) {
		fs.renameSync(srcPath, dest);
		return;
	}
	if (fs.statSync(srcPath).isDirectory()) {
		fs.cpSync(srcPath, dest, { recursive: true });
	} else {
		fs.copyFileSync(srcPath, dest);
	}
}

export async function paste(host: SpecDocsFileOpsHost, clipboard: Clipboard | null, item?: SpecDocsNode): Promise<Clipboard | null> {
	if (!clipboard || clipboard.paths.length === 0) return clipboard;

	const destDir = resolveDestDir(host, item);
	if (!destDir) return clipboard;

	for (const srcPath of clipboard.paths) {
		const name = path.basename(srcPath);
		const dest = path.join(destDir, name);
		if (srcPath === dest) continue;

		if (fs.existsSync(dest) && !(await confirmOverwrite(name))) continue;

		try {
			copyOrMoveFile(srcPath, dest, clipboard.isCut);
		} catch (e: unknown) {
			showError(clipboard.isCut ? 'Move failed' : 'Copy failed', e);
		}
	}

	const result = clipboard.isCut ? null : clipboard;
	host.refresh();
	return result;
}
