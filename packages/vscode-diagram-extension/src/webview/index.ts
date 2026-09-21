/**
 * webview 側の入口。拡張ホストから届いた図を `mountDiagramViewer` へ渡し、保存要求を返す。
 *
 * 保存の応答（`saved` / `saveFailed`）を**待ってから**下書きを畳む。投げっぱなしにすると、
 * 書き込みが拒否された保存でも編集が終わったように見え、直した配置が失われる。
 */

import type { DiagramDocument, DiagramLayout } from '@anytime-markdown/diagram-core';
import { type DiagramViewerHandle,mountDiagramViewer } from '@anytime-markdown/diagram-viewer';

interface VSCodeApi {
	postMessage(message: unknown): void;
}

declare const acquireVsCodeApi: (() => VSCodeApi) | undefined;

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage() {} };
const root = document.getElementById('root');

let handle: DiagramViewerHandle | null = null;
let locale = typeof navigator !== 'undefined' && navigator.language.startsWith('ja') ? 'ja' : 'en';
/** 応答待ちの保存。1 度に 1 件だけ（保存ボタンは押している間押せない）。 */
let pendingSave: { resolve: () => void; reject: (error: Error) => void } | null = null;

function renderInvalid(message: string): void {
	handle?.destroy();
	handle = null;
	if (root === null) return;
	root.textContent = '';
	const pre = document.createElement('pre');
	pre.className = 'invalid';
	pre.textContent = message;
	root.appendChild(pre);
}

function saveLayout(layout: DiagramLayout): Promise<void> {
	// 前の要求が残っていたら、応答が来ないまま置き去りにせず拒否する（押した人へ理由が届く）。
	pendingSave?.reject(new Error('A previous save is still pending.'));
	return new Promise<void>((resolve, reject) => {
		pendingSave = { resolve, reject };
		vscode.postMessage({ type: 'saveLayout', layout });
	});
}

function render(diagram: DiagramDocument): void {
	if (root === null) return;
	if (handle !== null) {
		handle.update({ document: diagram, locale });
		return;
	}
	root.textContent = '';
	handle = mountDiagramViewer(root, {
		document: diagram,
		locale,
		// 拡張ではファイルそのものを編集しているので、常に編集できる。
		editable: true,
		// 図を画面いっぱいに出す。読み物（導入文・末尾の注記）はテキストエディタ側で読める。
		compact: true,
		onSave: saveLayout,
	});
}

window.addEventListener('message', (event: MessageEvent) => {
	const message = event.data;
	switch (message?.type) {
		case 'host':
			locale = typeof message.locale === 'string' ? message.locale : locale;
			handle?.update({ locale });
			break;
		case 'load':
			render(message.document as DiagramDocument);
			break;
		case 'invalid':
			renderInvalid(String(message.message));
			break;
		case 'saved':
			pendingSave?.resolve();
			pendingSave = null;
			break;
		case 'saveFailed':
			pendingSave?.reject(new Error(String(message.message)));
			pendingSave = null;
			break;
	}
});

vscode.postMessage({ type: 'ready' });
