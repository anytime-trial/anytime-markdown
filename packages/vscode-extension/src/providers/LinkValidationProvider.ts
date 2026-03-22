import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';

const LINK_RE = /\[([^\]]{0,500})\]\(([^)\s]{1,2000})\)/g;
const HEADING_ID_RE = /^#{1,6}\s+([^\n]+)$/gm;

/** Markdown テキストから見出し ID のセットを収集する */
function collectHeadings(text: string): Set<string> {
	const headings = new Set<string>();
	let headingMatch: RegExpExecArray | null;
	while ((headingMatch = HEADING_ID_RE.exec(text)) !== null) {
		const headingText = headingMatch[1].trim();
		// GitHub 風の anchor ID 生成
		const id = headingText
			.toLowerCase()
			.replaceAll(/[^\w\s\u3000-\u9FFF\uF900-\uFAFF-]/g, '')
			.replaceAll(/\s+/g, '-');
		headings.add(id);
		// 元のテキストもそのまま追加（完全一致用）
		headings.add(headingText.toLowerCase());
	}
	return headings;
}

/** コードブロック（フェンス）の範囲を収集する */
function collectCodeRanges(text: string): { start: number; end: number }[] {
	const codeRanges: { start: number; end: number }[] = [];
	const fenceRe = /^```[\s\S]*?^```/gm;
	let fenceMatch: RegExpExecArray | null;
	while ((fenceMatch = fenceRe.exec(text)) !== null) {
		codeRanges.push({ start: fenceMatch.index, end: fenceMatch.index + fenceMatch[0].length });
	}
	return codeRanges;
}

/** href が検証対象外（外部URL, data URL, 空）かどうか */
function shouldSkipHref(href: string): boolean {
	if (!href) return true;
	if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) return true;
	if (href.startsWith('data:')) return true;
	return false;
}

/** ファイルリンクの Diagnostic を生成する */
function validateFileLink(
	filePart: string, docDir: string, document: vscode.TextDocument,
	linkStart: number, linkEnd: number,
): vscode.Diagnostic | null {
	const targetPath = path.resolve(docDir, filePart);
	if (fs.existsSync(targetPath)) return null;
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
	return diagnostic;
}

/** 見出しリンクの Diagnostic を生成する */
function validateHeadingLink(
	fragment: string, headings: Set<string>, document: vscode.TextDocument,
	linkStart: number, linkEnd: number,
): vscode.Diagnostic | null {
	const normalizedFragment = fragment.toLowerCase().replaceAll(/\s+/g, '-');
	if (headings.has(normalizedFragment) || headings.has(fragment.toLowerCase())) return null;
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
	return diagnostic;
}

/**
 * Markdown ファイル内のリンクを検証し、壊れたリンクに Diagnostic を生成する。
 * - ローカルファイルリンク: ファイル存在チェック
 * - 見出しリンク（#anchor）: 同一ファイル内の見出し存在チェック
 * - 外部 URL: スキップ（http/https）
 */
export class LinkValidationProvider implements vscode.Disposable {
	private readonly diagnosticCollection: vscode.DiagnosticCollection;
	private readonly disposables: vscode.Disposable[] = [];

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

		// ファイルを開いた時に検証、閉じた時に Diagnostic をクリア
		this.disposables.push(
			vscode.workspace.onDidOpenTextDocument((doc) => {
				if (doc.languageId === 'markdown') {
					this.validate(doc);
				}
			}),
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

		const headings = collectHeadings(text);
		const codeRanges = collectCodeRanges(text);

		const isInCodeBlock = (pos: number): boolean => {
			return codeRanges.some(r => pos >= r.start && pos <= r.end);
		};

		// リンクを検証
		let match: RegExpExecArray | null;
		LINK_RE.lastIndex = 0;
		while ((match = LINK_RE.exec(text)) !== null) {
			if (isInCodeBlock(match.index)) continue;

			const href = match[2].trim();
			if (shouldSkipHref(href)) continue;

			const linkStart = match.index + match[0].indexOf('(') + 1;
			const linkEnd = linkStart + href.length;

			// パスとフラグメントを分離
			const [filePart, fragment] = href.split('#');

			if (filePart) {
				const diag = validateFileLink(filePart, docDir, document, linkStart, linkEnd);
				if (diag) diagnostics.push(diag);
			} else if (fragment) {
				const diag = validateHeadingLink(fragment, headings, document, linkStart, linkEnd);
				if (diag) diagnostics.push(diag);
			}
		}

		this.diagnosticCollection.set(document.uri, diagnostics);
	}

	dispose(): void {
		this.diagnosticCollection.dispose();
		for (const d of this.disposables) d.dispose();
	}
}
