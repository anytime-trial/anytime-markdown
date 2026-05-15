import * as path from 'node:path';
import * as vscode from 'vscode';

function getTraceOutputDir(wsRoot: string): string {
	const trailHome = process.env['TRAIL_HOME'] ?? path.join(wsRoot, '.anytime', 'trail');
	return path.join(trailHome, 'trace');
}

function buildNodeOptions(): string {
	return '--require @anytime-markdown/trace-agent-node';
}

export function registerTraceCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'anytime-trail.runWithTrace',
			(filePath: string, lineOrScript: number | string) => {
				const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				if (!wsRoot) {
					vscode.window.showWarningMessage('ワークスペースフォルダが見つかりません。');
					return;
				}

				const traceDir = getTraceOutputDir(wsRoot);
				const envPrefix = `TRACE_OUTPUT_DIR="${traceDir}" NODE_OPTIONS="${buildNodeOptions()}"`;
				let cmd: string;

				if (typeof lineOrScript === 'string') {
					// TraceScriptLensProvider からの呼び出し: npm run <script>
					const pkgDir = path.dirname(filePath);
					const cdCmd = pkgDir !== wsRoot ? `cd "${pkgDir}" && ` : '';
					cmd = `${cdCmd}${envPrefix} npm run ${lineOrScript}`;
				} else {
					// TraceCodeLensProvider からの呼び出し: jest <testFile>
					const relPath = path.relative(wsRoot, filePath);
					cmd = `${envPrefix} npx jest "${relPath}" --maxWorkers=1`;
				}

				const terminal = vscode.window.createTerminal('Anytime Trace');
				terminal.show();
				terminal.sendText(cmd);
			},
		),
	);
}
