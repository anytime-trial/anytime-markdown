import { buildDiagramListEntries, normalizeDiagramRelativePath } from '../diagramListModel';

describe('buildDiagramListEntries', () => {
	it('ワークスペース直下のファイルは相対ディレクトリを持たない', () => {
		expect(buildDiagramListEntries(['kojiki.diagram.json'])).toEqual([
			{ label: 'kojiki.diagram.json', description: '', relativePath: 'kojiki.diagram.json' },
		]);
	});

	it('ネストしたファイルは相対ディレクトリを description に持つ', () => {
		expect(buildDiagramListEntries(['docs/spec/tree.diagram.json'])).toEqual([
			{ label: 'tree.diagram.json', description: 'docs/spec', relativePath: 'docs/spec/tree.diagram.json' },
		]);
	});

	it('ディレクトリ順・ファイル名順に並べる', () => {
		const entries = buildDiagramListEntries([
			'docs/b.diagram.json',
			'a.diagram.json',
			'docs/a.diagram.json',
			'spec/a.diagram.json',
		]);

		expect(entries.map((e) => e.relativePath)).toEqual([
			'a.diagram.json',
			'docs/a.diagram.json',
			'docs/b.diagram.json',
			'spec/a.diagram.json',
		]);
	});

	it('ファイル名の連番を数値として並べる（tree2 を tree10 より先に出す）', () => {
		const entries = buildDiagramListEntries(['tree10.diagram.json', 'tree2.diagram.json']);
		expect(entries.map((e) => e.label)).toEqual(['tree2.diagram.json', 'tree10.diagram.json']);
	});

	it('区切り文字を正規化し、正規化後に同一となるパスを重複除去する', () => {
		const entries = buildDiagramListEntries([
			'docs\\a.diagram.json',
			'./docs/a.diagram.json',
			'docs/a.diagram.json',
		]);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.relativePath).toBe('docs/a.diagram.json');
	});

	it('表示できる中身が残らないパスは落とす', () => {
		expect(normalizeDiagramRelativePath('  ')).toBeNull();
		expect(normalizeDiagramRelativePath('./')).toBeNull();
		expect(buildDiagramListEntries(['   '])).toEqual([]);
	});
});
