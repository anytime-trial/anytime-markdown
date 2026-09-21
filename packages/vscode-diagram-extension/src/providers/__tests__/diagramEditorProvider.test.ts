/**
 * カスタムエディタの保存経路（webview → 拡張 → 本文の差し替え）。
 *
 * 測るのは**境界を渡る形**。webview が画面の形の図（端が `{ kind: 'element' }` の組）をそのまま
 * 送ると、ファイルの形を読む `validateDiagramDocument` は線を 1 本でも持つ図を必ず断る。
 * 断られたことは `saveFailed` として webview へ返るだけなので、拡張のログにも本文にも残らない。
 */

import {
	type DiagramDocument,
	elementAnchor,
	serializeDiagramDocument,
} from '@anytime-markdown/diagram-core';
import * as vscode from 'vscode';

import { DiagramEditorProvider } from '../DiagramEditorProvider';

const DOC: DiagramDocument = {
	version: 1,
	title: '検査用の系図',
	lead: '',
	note: '',
	legend: '実線は親子。',
	groups: [],
	families: [],
	nodes: ['要素 1', '要素 2'],
	shapes: {},
	connectors: [{
		id: 'c1',
		from: elementAnchor('要素 1'),
		to: elementAnchor('要素 2'),
		line: 'solid',
		color: 'default',
		route: 'straight',
		start: 'none',
		end: 'arrow',
	}],
	annotations: {},
	layout: { placements: {} },
};

interface Opened {
	/** webview から拡張へ送る（`onDidReceiveMessage` に登録された受け口を直に叩く）。 */
	send(message: unknown): Promise<void>;
	/** 拡張から webview へ送られたメッセージ。 */
	readonly posted: Record<string, unknown>[];
}

async function open(text = serializeDiagramDocument(DOC)): Promise<Opened> {
	const posted: Record<string, unknown>[] = [];
	let receive: ((message: unknown) => void | Promise<void>) | undefined;
	const panel = {
		webview: {
			options: {},
			html: '',
			cspSource: '',
			asWebviewUri: (value: unknown) => value,
			postMessage: (message: Record<string, unknown>) => { posted.push(message); },
			onDidReceiveMessage: (handler: (message: unknown) => void | Promise<void>) => {
				receive = handler;
				return { dispose: () => undefined };
			},
		},
		onDidDispose: () => ({ dispose: () => undefined }),
	};
	const document_ = {
		uri: vscode.Uri.file('/work/family.diagram.json'),
		lineCount: text.split('\n').length,
		getText: () => text,
	};
	DiagramEditorProvider.register({ extensionUri: vscode.Uri.file('/ext'), subscriptions: [] } as never);
	const provider = jest.mocked(vscode.window.registerCustomEditorProvider).mock.calls[0]![1] as
		vscode.CustomTextEditorProvider;
	await provider.resolveCustomTextEditor(document_ as never, panel as never, {} as never);
	posted.length = 0;
	return {
		posted,
		async send(message) { await receive?.(message); },
	};
}

const applyEdit = jest.mocked(vscode.workspace.applyEdit);

beforeEach(() => {
	jest.clearAllMocks();
});

it('webview が送るファイルの形の本文を検証して書き込む', async () => {
	const opened = await open();
	const edited: DiagramDocument = { ...DOC, title: '編集後' };
	await opened.send({ type: 'saveDocument', json: serializeDiagramDocument(edited) });
	expect(opened.posted).toEqual([{ type: 'saved' }]);
	// 線を持つ図がここで断られていた（端は画面の形では `{ kind: 'element' }` の組）。
	expect(applyEdit).toHaveBeenCalledTimes(1);
	const edit = applyEdit.mock.calls[0]![0] as unknown as { edits: { text: string }[] };
	expect(edit.edits[0]!.text).toBe(serializeDiagramDocument(edited));
});

it('本文の無い保存要求は理由を返して書き込まない', async () => {
	const opened = await open();
	// 画面の形の図をそのまま送っていた頃の要求。文字列でなければ入口で断る。
	await opened.send({ type: 'saveDocument', document: DOC });
	expect(applyEdit).not.toHaveBeenCalled();
	expect(opened.posted[0]).toMatchObject({ type: 'saveFailed' });
});

it('読めない図は書き込まず理由を返す', async () => {
	const opened = await open();
	await opened.send({ type: 'saveDocument', json: '{ "version": 2 }' });
	expect(applyEdit).not.toHaveBeenCalled();
	expect(opened.posted[0]).toMatchObject({ type: 'saveFailed' });
});
