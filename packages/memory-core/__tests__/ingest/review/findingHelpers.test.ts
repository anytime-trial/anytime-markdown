import {
  extractProblemSuggestionPairs,
  extractNumberedFindings,
  inferSeverityFromHeading,
  inferSeverity,
  extractTargetFromFinding,
  maxSeverity,
  parseSeverityMarker,
} from '../../../src/ingest/review/findingHelpers';

describe('maxSeverity', () => {
  test('empty findings → info', () => {
    expect(maxSeverity([])).toBe('info');
  });
  test('all info → info', () => {
    expect(maxSeverity([{ severity: 'info' }, { severity: 'info' }])).toBe('info');
  });
  test('warn present, no error → warn', () => {
    expect(maxSeverity([{ severity: 'info' }, { severity: 'warn' }])).toBe('warn');
  });
  test('error present → error (regardless of order)', () => {
    expect(maxSeverity([{ severity: 'warn' }, { severity: 'error' }, { severity: 'info' }])).toBe('error');
    expect(maxSeverity([{ severity: 'error' }, { severity: 'warn' }])).toBe('error');
  });
});

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
      // ⚠️ は U+26A0 + U+FE0F の合成絵文字。旧 NUMBERED_BOUNDARY_RE は文字クラス内に
      // 入れていたため合成シーケンスにマッチできず、この境界を取りこぼしていた (S5868 回帰)。
      '⚠️ **3. Warning issue**',
      'body 3',
      '修正: fix 3',
    ];
    const findings = extractNumberedFindings(lines);
    expect(findings).toHaveLength(3);
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

describe('extractTargetFromFinding', () => {
  // ── Backtick paths ────────────────────────────────────────────────────────

  test('extracts backtick-wrapped packages/ path', () => {
    const text = 'NULL ref in `packages/trail-viewer/src/components/Foo.tsx`';
    expect(extractTargetFromFinding(text)).toBe('packages/trail-viewer/src/components/Foo.tsx');
  });

  test('extracts backtick path with :line suffix', () => {
    const text = 'See `packages/foo/src/bar.ts:42` for context';
    expect(extractTargetFromFinding(text)).toBe('packages/foo/src/bar.ts');
  });

  // ── Plain paths in body ───────────────────────────────────────────────────

  test('extracts plain packages/ path from body without backticks', () => {
    const text = 'The file packages/foo/src/baz.ts has the issue';
    expect(extractTargetFromFinding(text)).toBe('packages/foo/src/baz.ts');
  });

  test('extracts file:line plain pattern', () => {
    const text = 'Off-by-one in packages/foo/src/quux.ts:10';
    expect(extractTargetFromFinding(text)).toBe('packages/foo/src/quux.ts');
  });

  // ── Priority: packages/ > src/ > backtick first ───────────────────────────

  test('prefers packages/... over src/... over arbitrary backtick paths', () => {
    const text = 'See `something.md` and `src/util.ts` and `packages/x/src/y.ts`';
    expect(extractTargetFromFinding(text)).toBe('packages/x/src/y.ts');
  });

  test('falls back to src/ path when no packages/ found', () => {
    const text = 'In `src/util.ts:5` we have the bug';
    expect(extractTargetFromFinding(text)).toBe('src/util.ts');
  });

  // ── Sample 1 field list ───────────────────────────────────────────────────

  test('Sample 1: extracts from - **場所**: `path` line', () => {
    const text = [
      '- **場所**: `packages/foo/src/bar.ts:6`',
      '- **内容**: 何か問題',
    ].join('\n');
    expect(extractTargetFromFinding(text)).toBe('packages/foo/src/bar.ts');
  });

  // ── No match ──────────────────────────────────────────────────────────────

  test('returns null when no file path found', () => {
    expect(extractTargetFromFinding('a generic description without paths')).toBeNull();
  });

  test('returns null on empty text', () => {
    expect(extractTargetFromFinding('')).toBeNull();
  });
});

describe('inferSeverity (keyword expansion)', () => {
  // ── error keywords ────────────────────────────────────────────────────────

  test('セキュリティ侵害 → error', () => {
    expect(inferSeverity('この変更でセキュリティ侵害のリスクがある。')).toBe('error');
  });

  test('XSS / SQL injection / データ漏洩 → error', () => {
    expect(inferSeverity('XSS 脆弱性がある。')).toBe('error');
    expect(inferSeverity('SQL injection 可能。')).toBe('error');
    expect(inferSeverity('データ漏洩のリスク。')).toBe('error');
  });

  test('Critical / 致命的 → error', () => {
    expect(inferSeverity('Critical issue here.')).toBe('error');
    expect(inferSeverity('致命的なバグ。')).toBe('error');
  });

  // ── warn keywords ─────────────────────────────────────────────────────────

  test('NULL ref / 競合状態 / off-by-one → warn', () => {
    expect(inferSeverity('NULL ref が発生する。')).toBe('warn');
    expect(inferSeverity('競合状態の可能性。')).toBe('warn');
    expect(inferSeverity('off-by-one エラー。')).toBe('warn');
  });

  test('非推奨 / deprecated → warn', () => {
    expect(inferSeverity('非推奨 API を使っている。')).toBe('warn');
    expect(inferSeverity('Uses deprecated API.')).toBe('warn');
  });

  // ── info keywords ─────────────────────────────────────────────────────────

  test('命名 / 可読性 / リファクタリング → info', () => {
    expect(inferSeverity('命名規則を改善すべき。')).toBe('info');
    expect(inferSeverity('可読性を高める提案。')).toBe('info');
    expect(inferSeverity('リファクタリングの余地あり。')).toBe('info');
  });

  // ── Existing admonition behavior (must keep passing) ──────────────────────

  test('admonition takes priority: > [!CAUTION] → error', () => {
    expect(inferSeverity('> [!CAUTION]\n> 危険\n命名規則の話')).toBe('error');
  });

  test('admonition > [!IMPORTANT] → warn', () => {
    expect(inferSeverity('> [!IMPORTANT]\n> 重要\n通常の文')).toBe('warn');
  });

  // ── Priority: error keyword > warn keyword > info ─────────────────────────

  test('error keyword takes priority over warn keyword in same body', () => {
    expect(inferSeverity('NULL ref のような問題があるが、本質はセキュリティ侵害。')).toBe('error');
  });

  test('warn keyword takes priority over info keyword', () => {
    expect(inferSeverity('命名規則の問題で deprecated API を使っている。')).toBe('warn');
  });

  test('no keyword → info (default)', () => {
    expect(inferSeverity('通常の説明文。何の特別な単語もない。')).toBe('info');
  });
});

describe('parseSeverityMarker', () => {
  // anytime-trail-review スキルが定める `- 重大度: warn` メタ行を明示的に解析する。
  // 旧実装は本文キーワード/見出し推論のみで、明示マーカーを無視し既定 info に落としていた。
  test('bullet + bold marker `- **重大度**: warn` → warn', () => {
    expect(parseSeverityMarker('- **重大度**: warn\n- **カテゴリ**: logic')).toBe('warn');
  });

  test('bold-colon-inside marker `**重大度:** error` → error', () => {
    expect(parseSeverityMarker('**重大度:** error')).toBe('error');
  });

  test('plain marker `重大度: info` → info', () => {
    expect(parseSeverityMarker('重大度: info')).toBe('info');
  });

  test('English marker `severity: warn` → warn', () => {
    expect(parseSeverityMarker('Severity: warn')).toBe('warn');
  });

  test('Japanese severity words: 警告 → warn, 致命的 → error, 軽微 → info', () => {
    expect(parseSeverityMarker('- 重大度: 警告')).toBe('warn');
    expect(parseSeverityMarker('- 重大度: 致命的')).toBe('error');
    expect(parseSeverityMarker('- 重大度: 軽微')).toBe('info');
  });

  test('full-width colon `重大度： warn` → warn', () => {
    expect(parseSeverityMarker('- 重大度： warn')).toBe('warn');
  });

  test('no marker line → null (so caller falls back to inference)', () => {
    expect(parseSeverityMarker('通常の本文。重大度の記載なし。')).toBeNull();
  });

  test('marker not at line start (inside code block) → null (avoid false positive)', () => {
    expect(parseSeverityMarker('```\nconst 重大度: string = "warn";\n```')).toBeNull();
  });

  test('first marker wins when multiple findings concatenated', () => {
    expect(parseSeverityMarker('- 重大度: error\n本文\n- 重大度: info')).toBe('error');
  });

  // pre-merge レビュー warn1: fenced code block 内の行頭 `重大度:` も除外する。
  test('line-leading 重大度: inside a fenced code block → null', () => {
    expect(parseSeverityMarker('```\n重大度: error\n```')).toBeNull();
  });

  test('marker outside the fence is still parsed when a fence is present', () => {
    expect(parseSeverityMarker('```\nsample code\n```\n\n- 重大度: warn')).toBe('warn');
  });

  // pre-merge レビュー warn2: 値側に出た ラベル語 `重大度` を error に誤分類しない。
  test('value equal to label substring 重大度 is not classified as error', () => {
    expect(parseSeverityMarker('severity: 重大度')).toBeNull();
  });
});
