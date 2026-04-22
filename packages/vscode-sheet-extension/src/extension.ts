import * as vscode from 'vscode';
import { SheetEditorProvider } from './providers/SheetEditorProvider';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(...SheetEditorProvider.register(context));

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-sheet.newSheet', async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('Please open a workspace first.');
				return;
			}

			const name = await vscode.window.showInputBox({
				prompt: 'Sheet file name',
				value: 'untitled',
			});
			if (!name) return;

			const fileName = name.endsWith('.sheet') ? name : `${name}.sheet`;
			const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, fileName);
			const empty = { cells: [['']], alignments: [[null]], range: { rows: 1, cols: 1 } };

			await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(empty, null, 2), 'utf-8'));
			await vscode.commands.executeCommand('vscode.openWith', uri, 'anytimeSheet');
		}),
	);
}

export function deactivate() {}
