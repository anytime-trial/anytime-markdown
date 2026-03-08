import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './providers/MarkdownEditorProvider';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(MarkdownEditorProvider.register(context));

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
			const provider = MarkdownEditorProvider.getInstance();
			if (!provider) { return; }
			const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(fileUri));
			provider.compareFileUri = fileUri;
			provider.postMessageToActivePanel({
				type: 'loadCompareFile',
				content,
			});
		}
	);

	context.subscriptions.push(openEditorWithFile, compareCmd);
}

export function deactivate() {}
