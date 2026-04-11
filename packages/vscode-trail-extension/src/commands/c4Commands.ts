import * as vscode from 'vscode';
import { C4Panel } from '../c4/C4Panel';
import type { TrailDataServer } from '../server/TrailDataServer';

export interface C4CommandsDeps {
	getDataServer: () => TrailDataServer | undefined;
	startServer: () => Promise<void>;
}

async function ensureServerRunning(deps: C4CommandsDeps): Promise<boolean> {
	const server = deps.getDataServer();
	if (server?.isRunning) return true;

	const answer = await vscode.window.showInformationMessage(
		'C4 analysis requires the data server. Start it now?',
		'Start Server',
		'Cancel',
	);
	if (answer !== 'Start Server') return false;

	await deps.startServer();
	return true;
}

export function registerC4Commands(
	context: vscode.ExtensionContext,
	deps: C4CommandsDeps,
): void {
	const c4Import = vscode.commands.registerCommand('anytime-trail.c4Import', () =>
		C4Panel.importMermaid(),
	);

	const c4Analyze = vscode.commands.registerCommand('anytime-trail.c4Analyze', async () => {
		if (!await ensureServerRunning(deps)) return;
		await C4Panel.analyzeWorkspace();
	});

	const c4Export = vscode.commands.registerCommand('anytime-trail.c4Export', () =>
		C4Panel.exportData(),
	);

	const dsmAnalyze = vscode.commands.registerCommand('anytime-trail.dsmAnalyze', async () => {
		if (!await ensureServerRunning(deps)) return;
		await C4Panel.analyzeWorkspace();
	});

	const c4View = vscode.commands.registerCommand('anytime-trail.c4View', async () => {
		if (!await ensureServerRunning(deps)) return;
		C4Panel.restoreSavedModel();
		C4Panel.openViewer(true);
	});

	context.subscriptions.push(c4Import, c4Analyze, c4Export, dsmAnalyze, c4View);
}
