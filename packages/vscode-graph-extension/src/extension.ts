import * as vscode from 'vscode';
import { parseCoocFile, serializeCoocFile, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { CooccurrenceEditorProvider } from './providers/CooccurrenceEditorProvider';
import { GraphMigrationProvider } from './providers/GraphMigrationProvider';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(CooccurrenceEditorProvider.register(context));
	context.subscriptions.push(GraphMigrationProvider.register(context));

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-graph.newCooccurrence', async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('Please open a workspace first.');
				return;
			}

			const name = await vscode.window.showInputBox({
				prompt: 'Co-occurrence network file name',
				value: 'untitled.cooc.json',
			});
			if (!name) return;

			const fileName = name.endsWith('.cooc.json') ? name : `${name}.cooc.json`;
			const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, fileName);

			const doc: CooccurrenceFile = {
				meta: {
					schemaVersion: 1,
					generatedAt: new Date().toISOString(),
					origin: 'manual',
				},
				spec: {
					nodes: [],
					links: [],
				},
			};
			const text = serializeCoocFile(doc);
			parseCoocFile(text);

			await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf-8'));
			await vscode.commands.executeCommand('vscode.openWith', uri, CooccurrenceEditorProvider.viewType);
		}),
	);
}

export function deactivate() {}
