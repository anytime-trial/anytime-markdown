import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const HEADING_ID_RE = /^#{1,6}\s+(.+)$/gm;

/**
 * Markdown ファイル内のリンクを検証し、壊れたリンクに Diagnostic を生成する。
 * - ローカルファイルリンク: ファイル存在チェック
 * - 見出しリンク（#anchor）: 同一ファイル内の見出し存在チェック
 * - 外部 URL: スキップ（http/https）
 */
export class LinkValidationProvider implements vscode.Disposable {
	private diagnosticCollection: vscode.DiagnosticCollection;
	private disposables: vscode.Disposable[] = [];

	constructor() {
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection('anytime-markdown-links');

		// ファイル保存時に検証
		this.disposables.push(
			vscode.workspace.onDidSaveTextDocument((doc) => {
				if (doc.languageId === 'markdown') {
					this.validate(doc);
				}
			}),
		);

		// ファイルを開いた時に検証
		this.disposables.push(
			vscode.workspace.onDidOpenTextDocument((doc) => {
				if (doc.languageId === 'markdown') {
					this.validate(doc);
				}
			}),
		);

		// ファイルを閉じた時に Diagnostic をクリア
		this.disposables.push(
			vscode.workspace.onDidCloseTextDocument((doc) => {
				this.diagnosticCollection.delete(doc.uri);
			}),
		);

		// 既に開いている Markdown ファイルを検証
		for (const doc of vscode.workspace.textDocuments) {
			if (doc.languageId === 'markdown') {
				this.validate(doc);
			}
		}
	}

	validate(document: vscode.TextDocument): void {
		// Workspace Trust チェック: 信頼されていないワークスペースではスキップ
		if (!vscode.workspace.isTrusted) {
			this.diagnosticCollection.delete(document.uri);
			return;
		}

		const text = document.getText();
		const docDir = path.dirname(document.uri.fsPath);
		const diagnostics: vscode.Diagnostic[] = [];

		// 同一ファイル内の見出しを収集
		const headings = new Set<string>();
		let headingMatch: RegExpExecArray | null;
		while ((headingMatch = HEADING_ID_RE.exec(text)) !== null) {
			const headingText = headingMatch[1].trim();
			// GitHub 風の anchor ID 生成
			const id = headingText
				.toLowerCase()
				.replace(/[^\w\s\u3000-\u9FFF\uF900-\uFAFF-]/g, '')
				.replace(/\s+/g, '-');
			headings.add(id);
			// 元のテキストもそのまま追加（完全一致用）
			headings.add(headingText.toLowerCase());
		}

		// コードブロック内のリンクを除外するためのフェンス位置を収集
		const codeRanges: { start: number; end: number }[] = [];
		const fenceRe = /^```[\s\S]*?^```/gm;
		let fenceMatch: RegExpExecArray | null;
		while ((fenceMatch = fenceRe.exec(text)) !== null) {
			codeRanges.push({ start: fenceMatch.index, end: fenceMatch.index + fenceMatch[0].length });
		}

		const isInCodeBlock = (pos: number): boolean => {
			return codeRanges.some(r => pos >= r.start && pos <= r.end);
		};

		// リンクを検証
		let match: RegExpExecArray | null;
		LINK_RE.lastIndex = 0;
		while ((match = LINK_RE.exec(text)) !== null) {
			if (isInCodeBlock(match.index)) continue;

			const href = match[2].trim();
			const linkStart = match.index + match[0].indexOf('(') + 1;
			const linkEnd = linkStart + href.length;

			// 外部 URL はスキップ
			if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) continue;
			// データ URL はスキップ
			if (href.startsWith('data:')) continue;
			// 空リンクはスキップ
			if (!href) continue;

			// パスとフラグメントを分離
			const [filePart, fragment] = href.split('#');

			if (filePart) {
				// ファイルリンクの検証
				const targetPath = path.resolve(docDir, filePart);
				if (!fs.existsSync(targetPath)) {
					const range = new vscode.Range(
						document.positionAt(linkStart),
						document.positionAt(linkEnd),
					);
					const diagnostic = new vscode.Diagnostic(
						range,
						`File not found: ${filePart}`,
						vscode.DiagnosticSeverity.Warning,
					);
					diagnostic.source = 'anytime-markdown';
					diagnostic.code = 'link-file-not-found';
					diagnostics.push(diagnostic);
				}
			} else if (fragment) {
				// 同一ファイル内の見出しリンクの検証
				const normalizedFragment = fragment.toLowerCase().replace(/\s+/g, '-');
				if (!headings.has(normalizedFragment) && !headings.has(fragment.toLowerCase())) {
					const range = new vscode.Range(
						document.positionAt(linkStart),
						document.positionAt(linkEnd),
					);
					const diagnostic = new vscode.Diagnostic(
						range,
						`Heading not found: #${fragment}`,
						vscode.DiagnosticSeverity.Warning,
					);
					diagnostic.source = 'anytime-markdown';
					diagnostic.code = 'link-heading-not-found';
					diagnostics.push(diagnostic);
				}
			}
		}

		this.diagnosticCollection.set(document.uri, diagnostics);
	}

	dispose(): void {
		this.diagnosticCollection.dispose();
		for (const d of this.disposables) d.dispose();
	}
}
