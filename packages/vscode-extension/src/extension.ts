import * as vscode from 'vscode';
import * as path from 'path';
import { MarkdownEditorProvider } from './providers/MarkdownEditorProvider';

interface GitExtension {
	getAPI(version: 1): GitAPI;
}
interface GitAPI {
	getRepository(uri: vscode.Uri): Repository | null;
}
interface Repository {
	rootUri: vscode.Uri;
	show(ref: string, path: string): Promise<string>;
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(MarkdownEditorProvider.register(context));

	const openEditor = vscode.commands.registerCommand(
		'anytime-markdown.openEditor',
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

	const compareWithGitHead = vscode.commands.registerCommand(
		'anytime-markdown.compareWithGitHead',
		async (resourceState?: { resourceUri: vscode.Uri }) => {
			const provider = MarkdownEditorProvider.getInstance();
			if (!provider) { return; }

			const fileUri = resourceState?.resourceUri ?? provider.activeDocumentUri;
			if (!fileUri) {
				vscode.window.showWarningMessage('No markdown file selected.');
				return;
			}

			const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
			if (!gitExtension) {
				vscode.window.showErrorMessage('Git extension is not available.');
				return;
			}
			if (!gitExtension.isActive) {
				await gitExtension.activate();
			}
			const git = gitExtension.exports.getAPI(1);
			const repo = git.getRepository(fileUri);
			if (!repo) {
				vscode.window.showErrorMessage('No Git repository found for this file.');
				return;
			}

			const relativePath = path.relative(repo.rootUri.fsPath, fileUri.fsPath).replace(/\\/g, '/');
			let headContent: string;
			try {
				headContent = await repo.show('HEAD', relativePath);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				vscode.window.showWarningMessage(`Cannot load HEAD version: ${msg}`);
				return;
			}

			await vscode.commands.executeCommand(
				'vscode.openWith',
				fileUri,
				MarkdownEditorProvider.viewType
			);

			await provider.waitForReady(fileUri);
			await new Promise(resolve => setTimeout(resolve, 500));

			provider.compareFileUri = null;
			provider.postMessageToPanel(fileUri, { type: 'loadCompareFile', content: headContent });
		}
	);

	context.subscriptions.push(openEditor, openEditorWithFile, compareCmd, compareWithGitHead);
}

export function deactivate() {}
