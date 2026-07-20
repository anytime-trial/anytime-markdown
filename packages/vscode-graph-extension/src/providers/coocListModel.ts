/**
 * 共起ネットワーク一覧ビューの表示モデル。
 * VS Code API に依存させない（ツリー表示の並び・ラベル分割だけを単体テストで固定するため）。
 */

/** 共起ネットワークファイルの検索パターン（`vscode.workspace.findFiles` の include）。 */
export const COOC_FILE_GLOB = '**/*.cooc.json';

/** 検索から除外するパターン（`vscode.workspace.findFiles` の exclude）。 */
export const COOC_FILE_EXCLUDE_GLOB = '**/{node_modules,.git,out,dist}/**';

export interface CoocListEntry {
	/** ツリーに表示するファイル名。 */
	readonly label: string;
	/** ラベル脇に淡色表示する相対ディレクトリ。ワークスペース直下なら空文字。 */
	readonly description: string;
	/** ワークスペースからの相対パス。URI 逆引きのキーを兼ねる。 */
	readonly relativePath: string;
}

// 数値を数値として比較する（topics2 を topics10 より先に出す）。ロケール差で並びが
// 揺れないよう 'en' に固定する。
const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'variant' });

/**
 * 区切り文字を `/` に揃え、先頭の `./` を落とす。
 * 表示できる中身が残らなければ null を返す。
 */
export function normalizeCoocRelativePath(raw: string): string | null {
	const unified = raw.replace(/\\/g, '/').trim().replace(/^(?:\.\/)+/, '');
	return unified || null;
}

/**
 * 相対パスの配列を、重複を除いた表示順のエントリへ変換する。
 * ディレクトリ順 → ファイル名順に並べる。
 */
export function buildCoocListEntries(relativePaths: readonly string[]): CoocListEntry[] {
	const seen = new Set<string>();
	const entries: CoocListEntry[] = [];

	for (const raw of relativePaths) {
		const relativePath = normalizeCoocRelativePath(raw);
		if (!relativePath || seen.has(relativePath)) continue;
		seen.add(relativePath);

		const separator = relativePath.lastIndexOf('/');
		entries.push({
			label: separator < 0 ? relativePath : relativePath.slice(separator + 1),
			description: separator < 0 ? '' : relativePath.slice(0, separator),
			relativePath,
		});
	}

	return entries.sort(
		(a, b) => COLLATOR.compare(a.description, b.description) || COLLATOR.compare(a.label, b.label),
	);
}
