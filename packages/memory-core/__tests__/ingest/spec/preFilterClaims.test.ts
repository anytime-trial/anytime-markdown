import { preFilterClaims } from '../../../src/ingest/spec/preFilterClaims';

describe('preFilterClaims', () => {
  test('returns mandatory for 必須 keyword', () => {
    const body = '設定ファイルを読み込む機能は必須とする。';
    const result = preFilterClaims(body);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.paragraphs[0].modality_hint).toBe('mandatory');
    expect(result.paragraphs[0].text).toBe(body);
  });

  test('returns forbidden for 禁止 keyword', () => {
    const body = '外部ネットワークへの接続は禁止する。';
    const result = preFilterClaims(body);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.paragraphs[0].modality_hint).toBe('forbidden');
  });

  test('returns recommended for 推奨 keyword', () => {
    const body = 'ログを記録することを推奨する。';
    const result = preFilterClaims(body);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.paragraphs[0].modality_hint).toBe('recommended');
  });

  test('forbidden wins over mandatory in same paragraph', () => {
    const body = 'この機能は必須だが、直接 DB 接続は禁止する。';
    const result = preFilterClaims(body);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.paragraphs[0].modality_hint).toBe('forbidden');
  });

  test('returns empty paragraphs for plain text with no modality keywords', () => {
    const body = '設定ファイルを読み込む。ログを記録する。通常の動作を行う。';
    const result = preFilterClaims(body);
    expect(result.paragraphs).toHaveLength(0);
  });

  test('calculates line_start correctly for multiple paragraphs', () => {
    // paragraph 1: 1 line (line 0), then blank line (line 1)
    // paragraph 2: 1 line (line 2), then blank line (line 3)
    // paragraph 3: 1 line (line 4)
    const body = [
      '通常の記述。',          // line 0 — unknown (excluded)
      '',
      'これは必須の要件。',    // line 2 — mandatory
      '',
      '禁止事項がある。',      // line 4 — forbidden
    ].join('\n');

    const result = preFilterClaims(body);
    expect(result.paragraphs).toHaveLength(2);

    const mandatoryPara = result.paragraphs.find((p) => p.modality_hint === 'mandatory');
    const forbiddenPara = result.paragraphs.find((p) => p.modality_hint === 'forbidden');

    expect(mandatoryPara).toBeDefined();
    expect(mandatoryPara!.line_start).toBe(2);

    expect(forbiddenPara).toBeDefined();
    expect(forbiddenPara!.line_start).toBe(4);
  });

  test('returns mandatory for English "must" keyword', () => {
    const body = 'The system must validate all inputs.';
    const result = preFilterClaims(body);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.paragraphs[0].modality_hint).toBe('mandatory');
  });

  test('returns forbidden for English "must not" keyword', () => {
    const body = 'The system must not allow unauthenticated access.';
    const result = preFilterClaims(body);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.paragraphs[0].modality_hint).toBe('forbidden');
  });

  test('returns recommended for English "should" keyword', () => {
    const body = 'The system should log all errors.';
    const result = preFilterClaims(body);
    expect(result.paragraphs).toHaveLength(1);
    expect(result.paragraphs[0].modality_hint).toBe('recommended');
  });

  test('handles empty string', () => {
    const result = preFilterClaims('');
    expect(result.paragraphs).toHaveLength(0);
  });
});
