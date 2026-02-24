import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './providers/MarkdownEditorProvider';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(MarkdownEditorProvider.register(context));

	const openEditor = vscode.commands.registerCommand(
		'anytime-markdown-editor.openEditor',
		() => {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor && activeEditor.document.languageId === 'markdown') {
				vscode.commands.executeCommand(
					'vscode.openWith',
					activeEditor.document.uri,
					MarkdownEditorProvider.viewType
				);
			}
		}
	);

	const openEditorWithFile = vscode.commands.registerCommand(
		'anytime-markdown-editor.openEditorWithFile',
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

	context.subscriptions.push(openEditor, openEditorWithFile);
}

export function deactivate() {}
