import * as vscode from 'vscode';
import { C4Panel } from '../c4/C4Panel';

export function registerC4Commands(
	context: vscode.ExtensionContext,
): void {
	const c4Import = vscode.commands.registerCommand('anytime-trail.c4Import', () =>
		C4Panel.importMermaid(),
	);

	const analyzeHandler = () => C4Panel.analyzeWorkspace();
	const c4Analyze = vscode.commands.registerCommand('anytime-trail.c4Analyze', analyzeHandler);

	const c4Export = vscode.commands.registerCommand('anytime-trail.c4Export', () =>
		C4Panel.exportData(),
	);

	const dsmAnalyze = vscode.commands.registerCommand('anytime-trail.dsmAnalyze', analyzeHandler);

	context.subscriptions.push(c4Import, c4Analyze, c4Export, dsmAnalyze);
}
