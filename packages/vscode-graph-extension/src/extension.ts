import * as vscode from 'vscode';
import { GraphEditorProvider } from './providers/GraphEditorProvider';
import { TrailPanel } from './trail/TrailPanel';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(GraphEditorProvider.register(context));

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-graph.analyzeTypescript', async () => {
			const files = await vscode.workspace.findFiles('**/tsconfig.json', '**/node_modules/**', 10);
			if (files.length === 0) {
				vscode.window.showErrorMessage('No tsconfig.json found in workspace.');
				return;
			}

			let tsconfigPath: string;
			if (files.length === 1) {
				tsconfigPath = files[0].fsPath;
			} else {
				const items = files.map(f => ({
					label: vscode.workspace.asRelativePath(f),
					fsPath: f.fsPath,
				}));
				const picked = await vscode.window.showQuickPick(items, {
					placeHolder: 'Select tsconfig.json to analyze',
				});
				if (!picked) return;
				tsconfigPath = picked.fsPath;
			}

			await TrailPanel.create(context.extensionUri, tsconfigPath);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-graph.analyzeTypescriptSelect', async () => {
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				filters: { 'TypeScript Config': ['json'] },
				title: 'Select tsconfig.json',
			});
			if (!uris || uris.length === 0) return;
			await TrailPanel.create(context.extensionUri, uris[0].fsPath);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-graph.exportTrailJson', async () => {
			const data = TrailPanel.getLastResult();
			if (!data) {
				vscode.window.showWarningMessage('No analysis result to export. Run Analyze TypeScript first.');
				return;
			}
			const uri = await vscode.window.showSaveDialog({
				filters: { 'JSON': ['json'] },
				defaultUri: vscode.Uri.file('trail.json'),
			});
			if (!uri) return;
			await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(data, null, 2), 'utf-8'));
			vscode.window.showInformationMessage(`Trail JSON exported to ${uri.fsPath}`);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-graph.newGraph', async () => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('Please open a workspace first.');
				return;
			}

			const name = await vscode.window.showInputBox({
				prompt: 'Graph file name',
				value: 'untitled',
			});
			if (!name) return;

			const fileName = name.endsWith('.graph') ? name : `${name}.graph`;
			const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, fileName);

			const now = Date.now();
			const doc = {
				id: generateId(),
				name,
				nodes: [],
				edges: [],
				viewport: { offsetX: 0, offsetY: 0, scale: 1 },
				createdAt: now,
				updatedAt: now,
			};

			await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(doc, null, 2), 'utf-8'));
			await vscode.commands.executeCommand('vscode.openWith', uri, 'anytimeGraph');
		}),
	);
}

function generateId(): string {
	const bytes = new Uint8Array(16);
	for (let i = 0; i < 16; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}
	const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function deactivate() {}
