import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * trace 出力/読み取りディレクトリを解決する。writer (本コマンド) と reader (daemon の
 * TrailDataServer) で同一の値を使うため export する。`TRAIL_HOME` 優先、未設定時は
 * `<wsRoot>/.anytime/trail/trace`。
 */
export function getTraceOutputDir(wsRoot: string): string {
	const trailHome = process.env['TRAIL_HOME'] ?? path.join(wsRoot, '.anytime', 'trail');
	return path.join(trailHome, 'trace');
}

function buildNodeOptions(): string {
	return '--require @anytime-markdown/trace-agent-node';
}

/**
 * 'Anytime Trace' ターミナルをモジュールスコープで使い回す。毎回 createTerminal
 * すると同名タブが累積し、PTY/プロセスリソースが Extension Host にリークするため、
 * 生きているターミナルがあれば再利用し、閉じられたら onDidCloseTerminal でクリアする。
 */
let traceTerminal: vscode.Terminal | undefined;

function getTraceTerminal(): vscode.Terminal {
	if (!traceTerminal) {
		traceTerminal = vscode.window.createTerminal('Anytime Trace');
	}
	return traceTerminal;
}

export function registerTraceCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.window.onDidCloseTerminal((closed) => {
			if (closed === traceTerminal) {
				traceTerminal = undefined;
			}
		}),
	);
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

				const terminal = getTraceTerminal();
				terminal.show();
				terminal.sendText(cmd);
			},
		),
	);
}
