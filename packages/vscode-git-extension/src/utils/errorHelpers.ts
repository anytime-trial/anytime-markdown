import * as vscode from 'vscode';

/** エラーメッセージを抽出して VS Code に表示する */
export function showError(operation: string, e: unknown): void {
	const msg = e instanceof Error ? e.message : String(e);
	vscode.window.showErrorMessage(`${operation}: ${msg}`);
}
