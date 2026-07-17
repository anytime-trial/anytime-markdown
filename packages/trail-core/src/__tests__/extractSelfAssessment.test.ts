import { extractSelfAssessment } from '../domain/usecase/ExtractSelfAssessment';

function assistantText(text: string, opts: { isSidechain?: boolean } = {}): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2026-07-17T00:00:00.000Z',
    ...(opts.isSidechain === undefined ? {} : { isSidechain: opts.isSidechain }),
    message: { content: [{ type: 'text', text }] },
  });
}

function userText(text: string): string {
  return JSON.stringify({
    type: 'user',
    timestamp: '2026-07-17T00:00:00.000Z',
    message: { content: [{ type: 'text', text }] },
  });
}

function debriefBlock(json: string): string {
  return '作業が完了しました。\n\n```debrief\n' + json + '\n```\n';
}

describe('extractSelfAssessment', () => {
  it('最終 assistant テキストの debrief ブロックを抽出する', () => {
    const result = extractSelfAssessment([
      assistantText('途中経過です'),
      assistantText(
        debriefBlock('{"outcome":"partial","unresolvedItems":["S2 の実機受入"],"nextConcerns":["フック発火率"]}'),
      ),
    ]);
    expect(result).toEqual({
      outcome: 'partial',
      unresolvedItems: ['S2 の実機受入'],
      nextConcerns: ['フック発火率'],
    });
  });

  it('複数の debrief ブロックがある場合は最後のものを採用する', () => {
    const result = extractSelfAssessment([
      assistantText(debriefBlock('{"outcome":"unachieved"}')),
      assistantText(debriefBlock('{"outcome":"achieved"}')),
    ]);
    expect(result?.outcome).toBe('achieved');
  });

  it('unresolvedItems / nextConcerns 省略時は空配列に補完する', () => {
    const result = extractSelfAssessment([assistantText(debriefBlock('{"outcome":"achieved"}'))]);
    expect(result).toEqual({ outcome: 'achieved', unresolvedItems: [], nextConcerns: [] });
  });

  it('JSON 破損・enum 外・型不一致は null（機械集計のみへ縮退）', () => {
    expect(extractSelfAssessment([assistantText(debriefBlock('{broken'))])).toBeNull();
    expect(extractSelfAssessment([assistantText(debriefBlock('{"outcome":"great"}'))])).toBeNull();
    expect(extractSelfAssessment([assistantText(debriefBlock('{"outcome":"unknown"}'))])).toBeNull();
    expect(
      extractSelfAssessment([assistantText(debriefBlock('{"outcome":"achieved","unresolvedItems":"not-array"}'))]),
    ).toBeNull();
  });

  it('user メッセージ・sidechain 内の偽 debrief ブロックは無視する', () => {
    expect(extractSelfAssessment([userText(debriefBlock('{"outcome":"achieved"}'))])).toBeNull();
    expect(
      extractSelfAssessment([assistantText(debriefBlock('{"outcome":"achieved"}'), { isSidechain: true })]),
    ).toBeNull();
  });

  it('配列内の非文字列は除外し、各要素は 500 文字へ切り詰める', () => {
    const long = 'あ'.repeat(600);
    const result = extractSelfAssessment([
      assistantText(debriefBlock(`{"outcome":"achieved","unresolvedItems":[1,"${long}"],"nextConcerns":[null]}`)),
    ]);
    expect(result?.unresolvedItems).toHaveLength(1);
    expect(result?.unresolvedItems[0]).toHaveLength(500);
    expect(result?.nextConcerns).toEqual([]);
  });

  it('debrief ブロックが無ければ null', () => {
    expect(extractSelfAssessment([assistantText('完了しました')])).toBeNull();
    expect(extractSelfAssessment([])).toBeNull();
  });
});
