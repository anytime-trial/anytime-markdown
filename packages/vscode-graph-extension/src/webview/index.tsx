import { mountCooccurrenceViewer, type CooccurrenceViewerHandle } from '@anytime-markdown/cooccurrence-viewer';
import type { CooccurrenceFile } from '@anytime-markdown/graph-core';

type ThemeMode = 'dark' | 'light';

interface VSCodeApi {
	postMessage(message: unknown): void;
}

declare const acquireVsCodeApi: (() => VSCodeApi) | undefined;

type HostState = {
	locale: string;
	themeMode: ThemeMode;
	workerUri: string | null;
};

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage() {} };
const root = document.getElementById('root');
let handle: CooccurrenceViewerHandle | null = null;
let file: CooccurrenceFile | null = null;
let hostState: HostState = {
	locale: typeof navigator !== 'undefined' && navigator.language.startsWith('ja') ? 'ja' : 'en',
	themeMode: 'light',
	workerUri: null,
};

function createLayoutWorker(): Worker | null {
	if (!hostState.workerUri) return null;
	try {
		// classic worker として生成する。webpack の layoutWorker エントリは
		// output.module を立てていないため classic な IIFE を吐く（ESM 構文ゼロ）。
		// `{ type: 'module' }` を宣言すると module worker として読まれ、strict 化と
		// 読み込み規則の違いが実機でだけ表面化する。
		return new Worker(hostState.workerUri);
	} catch (error) {
		console.error('[anytime-graph] Failed to create layout worker from webview URI.', error);
		return null;
	}
}

function renderInvalid(message: string): void {
	handle?.destroy();
	handle = null;
	if (!root) return;
	root.textContent = '';
	const pre = document.createElement('pre');
	pre.className = 'invalid';
	pre.textContent = message;
	root.appendChild(pre);
}

function mountOrUpdate(nextFile: CooccurrenceFile): void {
	file = nextFile;
	if (!root) return;
	if (handle) {
		handle.update({ file: nextFile });
		return;
	}
	root.textContent = '';
	handle = mountCooccurrenceViewer(root, {
		file: nextFile,
		themeMode: hostState.themeMode,
		locale: hostState.locale,
		createLayoutWorker,
		capabilities: { save: true, exportPng: true },
		onFileChange(next) {
			file = next;
		},
		onRequestSave(next) {
			file = next;
			vscode.postMessage({ type: 'save', file: next });
		},
		async onExportPng(blob) {
			const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
			vscode.postMessage({ type: 'exportPng', bytes, file });
		},
	});
}

window.addEventListener('message', (event: MessageEvent) => {
	if (event.origin && !event.origin.startsWith('vscode-webview://')) return;
	const message = event.data;
	switch (message?.type) {
		case 'host':
			hostState = {
				locale: typeof message.locale === 'string' ? message.locale : hostState.locale,
				themeMode: message.themeMode === 'dark' ? 'dark' : 'light',
				workerUri: typeof message.workerUri === 'string' ? message.workerUri : null,
			};
			handle?.update({ locale: hostState.locale, themeMode: hostState.themeMode });
			break;
		case 'load':
			mountOrUpdate(message.file);
			break;
		case 'invalid':
			renderInvalid(typeof message.message === 'string' ? message.message : 'Invalid .cooc.json');
			break;
		case 'theme':
			hostState = { ...hostState, themeMode: message.themeMode === 'dark' ? 'dark' : 'light' };
			handle?.update({ themeMode: hostState.themeMode });
			break;
		case 'locale':
			if (typeof message.locale === 'string') {
				hostState = { ...hostState, locale: message.locale };
				handle?.update({ locale: hostState.locale });
			}
			break;
	}
});

vscode.postMessage({ type: 'ready' });
