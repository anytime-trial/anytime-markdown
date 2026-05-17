import {
  extractProblemSuggestionPairs,
  extractNumberedFindings,
  inferSeverityFromHeading,
} from '../../../src/ingest/review/findingHelpers';

describe('extractProblemSuggestionPairs', () => {
  // ── Existing strict format (must keep passing) ────────────────────────────

  test('extracts a single 問題/提案 pair (existing behavior)', () => {
    const lines = ['**問題:** これは問題。', '**提案:** これは提案。'];
    const pairs = extractProblemSuggestionPairs(lines);
    expect(pairs).toHaveLength(1);
    expect(pairs[0][0]).toBe('これは問題。');
    expect(pairs[0][1]).toBe('これは提案。');
  });

  test('extracts marker with full-width colon (existing)', () => {
    const lines = ['**問題：** 問題本文', '**提案：** 提案本文'];
    const pairs = extractProblemSuggestionPairs(lines);
    expect(pairs).toHaveLength(1);
  });

  // ── New: extended problem markers ─────────────────────────────────────────

  test('recognizes 問題点 as problem marker', () => {
    const lines = ['**問題点:** 問題点本文', '**提案:** 提案本文'];
    const pairs = extractProblemSuggestionPairs(lines);
    expect(pairs).toHaveLength(1);
    expect(pairs[0][0]).toBe('問題点本文');
  });

  test('recognizes 指摘 / 指摘事項 / 内容 as problem markers', () => {
    expect(extractProblemSuggestionPairs(['**指摘:** A', '**提案:** B'])).toHaveLength(1);
    expect(extractProblemSuggestionPairs(['**指摘事項:** A', '**提案:** B'])).toHaveLength(1);
    expect(extractProblemSuggestionPairs(['**内容:** A', '**提案:** B'])).toHaveLength(1);
  });

  test('recognizes English Issue / Problem / Finding as problem markers', () => {
    expect(extractProblemSuggestionPairs(['**Issue:** A', '**提案:** B'])).toHaveLength(1);
    expect(extractProblemSuggestionPairs(['**Problem:** A', '**提案:** B'])).toHaveLength(1);
    expect(extractProblemSuggestionPairs(['**Finding:** A', '**提案:** B'])).toHaveLength(1);
  });

  // ── New: extended suggestion markers ──────────────────────────────────────

  test('recognizes 改善方法 / 改善案 / 推奨 / 推奨修正 / 対処案 / 修正 as suggestion markers', () => {
    expect(extractProblemSuggestionPairs(['**問題:** A', '**改善方法:** B'])).toHaveLength(1);
    expect(extractProblemSuggestionPairs(['**問題:** A', '**改善案:** B'])).toHaveLength(1);
    expect(extractProblemSuggestionPairs(['**問題:** A', '**推奨:** B'])).toHaveLength(1);
    expect(extractProblemSuggestionPairs(['**問題:** A', '**推奨修正:** B'])).toHaveLength(1);
    expect(extractProblemSuggestionPairs(['**問題:** A', '**対処案:** B'])).toHaveLength(1);
    expect(extractProblemSuggestionPairs(['**問題:** A', '**修正:** B'])).toHaveLength(1);
  });

  // ── Sample 1: bullet-prefixed markers (### 検出 N + field list) ───────────

  test('Sample 1: bullet-prefixed - **内容:** + - **推奨修正:** extracts as one pair', () => {
    const lines = [
      '- **場所**: `packages/foo/src/bar.ts:42`',
      '- **内容**: 重複定義が 4 ファイルで見つかった。',
      '- **推奨修正**: Logger.ts から export して import する。',
    ];
    const pairs = extractProblemSuggestionPairs(lines);
    expect(pairs).toHaveLength(1);
    expect(pairs[0][0]).toContain('重複定義');
    expect(pairs[0][1]).toContain('export して import');
  });

  test('Sample 1: bullet-prefixed multi-line content body', () => {
    const lines = [
      '- **場所**: `foo.ts:10`',
      '- **内容**: 問題の説明。',
      '  追加の詳細。',
      '- **推奨修正**: 修正案の説明。',
      '  詳細な手順。',
    ];
    const pairs = extractProblemSuggestionPairs(lines);
    expect(pairs).toHaveLength(1);
    expect(pairs[0][0]).toContain('問題の説明');
    expect(pairs[0][1]).toContain('修正案の説明');
  });

  // ── Bullet prefix with original marker too ────────────────────────────────

  test('bullet-prefixed - **問題:** also recognized', () => {
    const lines = ['- **問題**: 本文', '- **提案**: 本文'];
    const pairs = extractProblemSuggestionPairs(lines);
    expect(pairs).toHaveLength(1);
  });
});

describe('extractNumberedFindings', () => {
  // ── Sample 2: emoji + bold number boundary ────────────────────────────────

  test('Sample 2: 🟡 **N. title** boundary with 修正: suggestion line', () => {
    const lines = [
      '🟡 **1. memory-core の ollama-core 依存が不要**',
      '',
      'テストファイルが import するだけなので devDependencies で十分。',
      '',
      '修正: package.json から devDependencies へ移動する。',
      '',
      '🟡 **2. trail-server の llm-core 依存が不要**',
      '',
      '型のみの import なので不要。',
      '',
      '修正: devDependencies へ移動。',
    ];
    const findings = extractNumberedFindings(lines);
    expect(findings).toHaveLength(2);
    expect(findings[0].title).toContain('ollama-core');
    expect(findings[0].finding).toContain('devDependencies で十分');
    expect(findings[0].suggestion).toContain('package.json から');
    expect(findings[1].title).toContain('llm-core');
  });

  test('Sample 2: multiple emoji variants 🔴 🟢 ⚠️ recognized', () => {
    const lines = [
      '🔴 **1. Critical issue**',
      'body 1',
      '修正: fix 1',
      '🟢 **2. Minor issue**',
      'body 2',
      '修正: fix 2',
    ];
    const findings = extractNumberedFindings(lines);
    expect(findings).toHaveLength(2);
  });

  // ── Sample 3: bold number boundary (no emoji) ─────────────────────────────

  test('Sample 3: **N. title** boundary with 対処案: suggestion line', () => {
    const lines = [
      '**1. featureMatrix が後から null になった場合の state 不整合**',
      '',
      'featureMatrix prop が null でない間に overlayCategory = fcmap を選択し...',
      '',
      '対処案: useEffect で featureMatrix を依存配列に持ち、null 時にリセット。',
      '',
      '**2. 上段カテゴリ Select に disabled ガードがない（UX の後退）**',
      '',
      '旧実装では Coverage グループが disabled だった...',
      '',
      '対処案: <MenuItem disabled={!coverageMatrix}> を追加する。',
    ];
    const findings = extractNumberedFindings(lines);
    expect(findings).toHaveLength(2);
    expect(findings[0].title).toContain('featureMatrix');
    expect(findings[0].suggestion).toContain('useEffect');
    expect(findings[1].title).toContain('disabled ガード');
  });

  test('numbered findings without suggestion marker still captured (suggestion=empty)', () => {
    const lines = [
      '**1. タイトル**',
      'body のみ。',
      '',
      '**2. 別のタイトル**',
      '別の body。',
    ];
    const findings = extractNumberedFindings(lines);
    expect(findings).toHaveLength(2);
    expect(findings[0].suggestion).toBe('');
  });

  test('returns empty when no numbered findings found', () => {
    const lines = ['ただの段落です。', '何もマーカーなし。'];
    expect(extractNumberedFindings(lines)).toHaveLength(0);
  });

  test('Sample 2 + Sample 3 mixed boundaries in same chapter', () => {
    const lines = [
      '🟡 **1. first**',
      'body1',
      '修正: fix1',
      '**2. second**',
      'body2',
      '対処案: fix2',
    ];
    const findings = extractNumberedFindings(lines);
    expect(findings).toHaveLength(2);
    expect(findings[0].title).toContain('first');
    expect(findings[1].title).toContain('second');
  });

  test('suggestion marker variants 提案: / 修正: / 対処案: / 推奨: all recognized', () => {
    const lines = [
      '**1. a**',
      'body',
      '提案: s1',
      '**2. b**',
      'body',
      '推奨: s2',
    ];
    const findings = extractNumberedFindings(lines);
    expect(findings).toHaveLength(2);
    expect(findings[0].suggestion).toBe('s1');
    expect(findings[1].suggestion).toBe('s2');
  });
});

describe('inferSeverityFromHeading', () => {
  test('Critical / 重大 / Error → error', () => {
    expect(inferSeverityFromHeading('Critical: NULL ref')).toBe('error');
    expect(inferSeverityFromHeading('重大な不具合')).toBe('error');
    expect(inferSeverityFromHeading('Error: SQL injection')).toBe('error');
  });

  test('Important / 重要 / Warning → warn', () => {
    expect(inferSeverityFromHeading('Important（対応推奨）')).toBe('warn');
    expect(inferSeverityFromHeading('重要な指摘')).toBe('warn');
    expect(inferSeverityFromHeading('Warning: deprecated API')).toBe('warn');
  });

  test('Suggestion / 推奨 / Info / 軽微 → info', () => {
    expect(inferSeverityFromHeading('Suggestion: refactor')).toBe('info');
    expect(inferSeverityFromHeading('推奨改善')).toBe('info');
    expect(inferSeverityFromHeading('Info: note')).toBe('info');
    expect(inferSeverityFromHeading('軽微な指摘')).toBe('info');
  });

  test('unrecognized heading → info (default)', () => {
    expect(inferSeverityFromHeading('1.1 セクション')).toBe('info');
    expect(inferSeverityFromHeading('指摘事項')).toBe('info');
  });
});
