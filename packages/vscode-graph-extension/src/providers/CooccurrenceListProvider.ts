import * as vscode from 'vscode';
import { CooccurrenceEditorProvider } from './CooccurrenceEditorProvider';
import {
	COOC_FILE_EXCLUDE_GLOB,
	COOC_FILE_GLOB,
	buildCoocListEntries,
	normalizeCoocRelativePath,
	type CoocListEntry,
} from './coocListModel';

/** ワークスペース内の共起ネットワークを一覧し、クリックで viewer を開くツリービュー。 */
export class CooccurrenceListProvider implements vscode.TreeDataProvider<CoocListEntry> {
	public static readonly viewId = 'anytimeGraph.networks';

	private readonly changeEmitter = new vscode.EventEmitter<void>();
	public readonly onDidChangeTreeData: vscode.Event<void> = this.changeEmitter.event;

	/**
	 * 正規化済み相対パス → URI。TreeItem からファイルを開くための逆引き。
	 * getChildren はローカルに組み立ててから丸ごと差し替える。現状は構築ループが
	 * 同期実行なので clear() + 逐次 set() でも壊れないが、それは「ループ内に await が
	 * 無い」という将来変わり得る前提に依存する。差し替えなら前提なしで、
	 * 「中途半端に空のマップが外から見える」状態が構造的に起きない。
	 */
	private uriByRelativePath = new Map<string, vscode.Uri>();

	public constructor(private readonly logError: (message: string) => void) {}

	public refresh(): void {
		this.changeEmitter.fire();
	}

	public dispose(): void {
		this.changeEmitter.dispose();
	}

	public getTreeItem(entry: CoocListEntry): vscode.TreeItem {
		const item = new vscode.TreeItem(entry.label, vscode.TreeItemCollapsibleState.None);
		item.description = entry.description;
		item.tooltip = entry.relativePath;
		item.iconPath = new vscode.ThemeIcon('graph-scatter');
		item.contextValue = 'anytimeGraph.network';

		const uri = this.uriByRelativePath.get(entry.relativePath);
		if (uri) {
			item.resourceUri = uri;
			item.command = {
				command: 'vscode.openWith',
				title: 'Open',
				arguments: [uri, CooccurrenceEditorProvider.viewType],
			};
		} else {
			// getChildren と同じ正規化で両方を作っているので到達しない想定。到達したら
			// 「クリックしても開かない項目」という気づきにくい壊れ方になるため記録する。
			this.logError(`No URI resolved for co-occurrence entry: ${entry.relativePath}`);
		}
		return item;
	}

	public async getChildren(element?: CoocListEntry): Promise<CoocListEntry[]> {
		// 単階層の一覧なので子は持たない。
		if (element) return [];
		if (!vscode.workspace.workspaceFolders?.length) return [];

		const uris = await vscode.workspace.findFiles(COOC_FILE_GLOB, COOC_FILE_EXCLUDE_GLOB);

		const resolved = new Map<string, vscode.Uri>();
		const relativePaths: string[] = [];
		for (const uri of uris) {
			const relativePath = vscode.workspace.asRelativePath(uri, true);
			relativePaths.push(relativePath);

			const key = normalizeCoocRelativePath(relativePath);
			// 重複時は buildCoocListEntries と同じく先勝ちにする。
			if (key && !resolved.has(key)) {
				resolved.set(key, uri);
			}
		}
		this.uriByRelativePath = resolved;

		return buildCoocListEntries(relativePaths);
	}
}
