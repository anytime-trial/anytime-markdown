import * as vscode from 'vscode';
import { CooccurrenceListProvider } from '../CooccurrenceListProvider';

const mockWorkspace = vscode.workspace as unknown as {
	workspaceFolders: unknown[] | undefined;
	findFiles: jest.Mock;
	asRelativePath: jest.Mock;
};

/** findFiles が返す URI 相当。fsPath だけ見ればテストには足りる。 */
const uriOf = (path: string) => vscode.Uri.file(`/ws/${path}`);

function setWorkspaceFiles(relativePaths: readonly string[]): void {
	mockWorkspace.workspaceFolders = [{ uri: uriOf('') }];
	mockWorkspace.findFiles.mockResolvedValue(relativePaths.map(uriOf));
	mockWorkspace.asRelativePath.mockImplementation(
		(uri: { fsPath: string }) => uri.fsPath.replace('/ws/', ''),
	);
}

describe('CooccurrenceListProvider', () => {
	let logError: jest.Mock;
	let provider: CooccurrenceListProvider;

	beforeEach(() => {
		jest.clearAllMocks();
		logError = jest.fn();
		provider = new CooccurrenceListProvider(logError);
	});

	afterEach(() => {
		provider.dispose();
		mockWorkspace.workspaceFolders = undefined;
	});

	it('ワークスペースが開かれていなければ何も返さない', async () => {
		mockWorkspace.workspaceFolders = undefined;

		expect(await provider.getChildren()).toEqual([]);
		expect(mockWorkspace.findFiles).not.toHaveBeenCalled();
	});

	it('単階層の一覧なので子要素は持たない', async () => {
		setWorkspaceFiles(['a.cooc.json']);
		const [entry] = await provider.getChildren();

		expect(await provider.getChildren(entry)).toEqual([]);
	});

	it('見つかったファイルを表示順に返す', async () => {
		setWorkspaceFiles(['docs/b.cooc.json', 'a.cooc.json', 'docs/a.cooc.json']);

		expect((await provider.getChildren()).map((e) => e.relativePath)).toEqual([
			'a.cooc.json',
			'docs/a.cooc.json',
			'docs/b.cooc.json',
		]);
	});

	it('クリックで viewer を開くコマンドを URI 付きで割り当てる', async () => {
		setWorkspaceFiles(['docs/topics.cooc.json']);
		const [entry] = await provider.getChildren();

		const item = provider.getTreeItem(entry);

		expect(item.label).toBe('topics.cooc.json');
		expect(item.description).toBe('docs');
		expect(item.command?.command).toBe('vscode.openWith');
		// URI は毎回別インスタンスなので、同一性ではなくパスで突き合わせる。
		const [openedUri, viewType] = item.command?.arguments ?? [];
		expect((openedUri as { fsPath: string }).fsPath).toBe('/ws/docs/topics.cooc.json');
		expect(viewType).toBe('anytimeCooccurrence');
		expect(logError).not.toHaveBeenCalled();
	});

	it('URI を解決できない項目は黙って無効化せず記録する', () => {
		const item = provider.getTreeItem({
			label: 'ghost.cooc.json',
			description: '',
			relativePath: 'ghost.cooc.json',
		});

		expect(item.command).toBeUndefined();
		expect(logError).toHaveBeenCalledWith(expect.stringContaining('ghost.cooc.json'));
	});

	it('再取得しても直前の一覧の URI 解決を壊さない', async () => {
		setWorkspaceFiles(['a.cooc.json']);
		const [entry] = await provider.getChildren();

		// 一覧が入れ替わっても、取得済みエントリは解決でき続ける（差し替え方式の担保）。
		setWorkspaceFiles(['a.cooc.json', 'b.cooc.json']);
		await provider.getChildren();

		expect(provider.getTreeItem(entry).command).toBeDefined();
		expect(logError).not.toHaveBeenCalled();
	});

	it('refresh は onDidChangeTreeData を発火する', () => {
		const listener = jest.fn();
		provider.onDidChangeTreeData(listener);

		provider.refresh();

		expect(listener).toHaveBeenCalledTimes(1);
	});
});
