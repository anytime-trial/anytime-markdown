import { isLowInformationEntity } from '../../src/canonical/entityQuality';

describe('isLowInformationEntity', () => {
  test('Q1: 空・空白のみの display_name は低情報', () => {
    expect(isLowInformationEntity('', '')).toBe(true);
    expect(isLowInformationEntity('   ', '')).toBe(true);
  });

  test('Q2: プレースホルダ名は低情報（実 DB で観測された値）', () => {
    for (const name of ['undefined', 'unknown', 'Unknown', 'null', 'n/a', '不明', '無名', '未命名']) {
      expect(isLowInformationEntity(name, '')).toBe(true);
    }
  });

  test('Q3: 「<修飾>の<総称>」だけの名前は低情報（実 DB で観測された値）', () => {
    for (const name of [
      '不明のバグ',
      '未命名のバグ',
      '未命名バグ',
      '未命名のBug',
      '特定のバグ',
      '特定の Bug',
      '無名のエラー',
      '特定のBug',
    ]) {
      expect(isLowInformationEntity(name, '')).toBe(true);
    }
  });

  test('Q4: 総称単独名は低情報', () => {
    for (const name of ['バグ', 'Bug', 'エラー', 'error', '問題']) {
      expect(isLowInformationEntity(name, '')).toBe(true);
    }
  });

  test('Q5: 具体的な名前は低情報ではない', () => {
    for (const name of [
      'knowledgeGraphPanel.ts',
      'TrailDataServer',
      '知識グラフ',
      'packages/trail-db/src/TrailDatabase.ts',
      '特定の条件でレイアウトが崩れるバグ', // 修飾が具体的な説明になっている
      'ueda',
    ]) {
      expect(isLowInformationEntity(name, '')).toBe(false);
    }
  });

  test('Q6: 20 文字以上の summary があれば総称名でも救済される', () => {
    expect(
      isLowInformationEntity('不明のバグ', 'trail-viewer の知識グラフでノードが孤立して描画される問題'),
    ).toBe(false);
    expect(isLowInformationEntity('不明のバグ', '短い')).toBe(true);
  });

  test('Q7: 空名は summary があっても低情報（表示不能）', () => {
    expect(isLowInformationEntity('', 'とても長い説明がここにあるが名前が無いので表示できない')).toBe(true);
  });
});
