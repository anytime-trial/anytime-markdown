import * as vscode from 'vscode';

import { DiagramEditorProvider } from './DiagramEditorProvider';
import {
	DIAGRAM_FILE_EXCLUDE_GLOB,
	DIAGRAM_FILE_GLOB,
	buildDiagramListEntries,
	normalizeDiagramRelativePath,
	type DiagramListEntry,
} from './diagramListModel';

/** ワークスペース内の系図を一覧し、クリックでエディタを開くツリービュー。 */
export class DiagramListProvider implements vscode.TreeDataProvider<DiagramListEntry> {
	public static readonly viewId = 'anytimeDiagram.diagrams';

	private readonly changeEmitter = new vscode.EventEmitter<void>();
	public readonly onDidChangeTreeData: vscode.Event<void> = this.changeEmitter.event;

	/**
	 * 正規化済み相対パス → URI。TreeItem からファイルを開くための逆引き。
	 *
	 * getChildren はローカルに組み立ててから丸ごと差し替える。clear() + 逐次 set() でも現状は
	 * 壊れないが、それは「ループ内に await が無い」という将来変わり得る前提に依存する。
	 * 差し替えなら「中途半端に空のマップが外から見える」状態が構造的に起きない。
	 */
	private uriByRelativePath = new Map<string, vscode.Uri>();

	public constructor(private readonly logError: (message: string) => void) {}

	public refresh(): void {
		this.changeEmitter.fire();
	}

	public dispose(): void {
		this.changeEmitter.dispose();
	}

	public getTreeItem(entry: DiagramListEntry): vscode.TreeItem {
		const item = new vscode.TreeItem(entry.label, vscode.TreeItemCollapsibleState.None);
		item.description = entry.description;
		item.tooltip = entry.relativePath;
		item.iconPath = new vscode.ThemeIcon('type-hierarchy');
		item.contextValue = 'anytimeDiagram.diagram';

		const uri = this.uriByRelativePath.get(entry.relativePath);
		if (uri) {
			item.resourceUri = uri;
			item.command = {
				command: 'vscode.openWith',
				title: 'Open',
				arguments: [uri, DiagramEditorProvider.viewType],
			};
		} else {
			// getChildren と同じ正規化で両方を作っているので到達しない想定。到達したら
			// 「クリックしても開かない項目」という気づきにくい壊れ方になるため記録する。
			this.logError(`No URI resolved for diagram entry: ${entry.relativePath}`);
		}
		return item;
	}

	public async getChildren(element?: DiagramListEntry): Promise<DiagramListEntry[]> {
		// 単階層の一覧なので子は持たない。
		if (element) return [];
		if (!vscode.workspace.workspaceFolders?.length) return [];

		const uris = await vscode.workspace.findFiles(DIAGRAM_FILE_GLOB, DIAGRAM_FILE_EXCLUDE_GLOB);

		const resolved = new Map<string, vscode.Uri>();
		const relativePaths: string[] = [];
		for (const uri of uris) {
			const relativePath = vscode.workspace.asRelativePath(uri, true);
			relativePaths.push(relativePath);

			const key = normalizeDiagramRelativePath(relativePath);
			// 重複時は buildDiagramListEntries と同じく先勝ちにする。
			if (key && !resolved.has(key)) {
				resolved.set(key, uri);
			}
		}
		this.uriByRelativePath = resolved;

		return buildDiagramListEntries(relativePaths);
	}
}
