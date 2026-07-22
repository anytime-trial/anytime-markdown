import { buildCoocListEntries } from '../coocListModel';

describe('buildCoocListEntries', () => {
	it('ワークスペース直下のファイルは相対ディレクトリを持たない', () => {
		expect(buildCoocListEntries(['topics.cooc.json'])).toEqual([
			{ label: 'topics.cooc.json', description: '', relativePath: 'topics.cooc.json' },
		]);
	});

	it('ネストしたファイルは相対ディレクトリを description に持つ', () => {
		expect(buildCoocListEntries(['docs/spec/terms.cooc.json'])).toEqual([
			{ label: 'terms.cooc.json', description: 'docs/spec', relativePath: 'docs/spec/terms.cooc.json' },
		]);
	});

	it('ディレクトリ順・ファイル名順に並べる', () => {
		const entries = buildCoocListEntries([
			'docs/b.cooc.json',
			'a.cooc.json',
			'docs/a.cooc.json',
			'spec/a.cooc.json',
		]);

		expect(entries.map((e) => e.relativePath)).toEqual([
			'a.cooc.json',
			'docs/a.cooc.json',
			'docs/b.cooc.json',
			'spec/a.cooc.json',
		]);
	});

	it('ファイル名の連番を数値として並べる', () => {
		const entries = buildCoocListEntries(['topics10.cooc.json', 'topics2.cooc.json']);

		expect(entries.map((e) => e.label)).toEqual(['topics2.cooc.json', 'topics10.cooc.json']);
	});

	it('区切り文字を正規化し、正規化後に同一となるパスを重複除去する', () => {
		const entries = buildCoocListEntries(['docs\\a.cooc.json', './docs/a.cooc.json', 'docs/a.cooc.json']);

		expect(entries).toEqual([
			{ label: 'a.cooc.json', description: 'docs', relativePath: 'docs/a.cooc.json' },
		]);
	});

	it('空文字・空白のみのパスを除外する', () => {
		expect(buildCoocListEntries(['', '   ', 'a.cooc.json'])).toEqual([
			{ label: 'a.cooc.json', description: '', relativePath: 'a.cooc.json' },
		]);
	});

	it('入力が空なら空配列を返す', () => {
		expect(buildCoocListEntries([])).toEqual([]);
	});
});
