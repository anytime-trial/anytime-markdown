import {
  extractProblemSuggestionPairs,
  extractNumberedFindings,
  extractBasenameCandidates,
  inferSeverityFromHeading,
  inferSeverity,
  extractTargetFromFinding,
  extractBacktickPaths,
  maxSeverity,
  parseSeverityMarker,
  parseChecklistRefMarker,
  parseTargetMarker,
  resolveFindingTarget,
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
      '🟡 **1. trail-caravan-book の ollama-core 依存が不要**',
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

  // ── 退行防止: バッククォート内容を丸ごと積む欠陥 ─────────────────────────────
  //
  // 旧実装は `PATH_TOKEN_RE.test(inner)` が真なら inner 全体を候補に積んでいた。
  // そのためバッククォート内の複数行シェル実行ログが丸ごと target_file_path として
  // 保存されていた（本番 caravan-book.db に実在）。マッチした部分文字列だけを採る。

  test('複数行のシェル実行ログからパス部分だけを取り出す', () => {
    const text = [
      '実行結果:',
      '```',
      '$ node scripts/check-skill-manifest-bump.mjs 8191c2b8e',
      '[check-skill-manifest-bump] manifest の版数バンプが漏れています:',
      'exit 1',
      '```',
    ].join('\n');
    const result = extractTargetFromFinding(text);
    expect(result).not.toContain('\n');
    expect(result).not.toContain(' ');
  });

  test('バッククォート内にパスと散文が混在しても散文を含めない', () => {
    const text = '`該当は packages/foo/src/bar.ts のあたり`';
    expect(extractTargetFromFinding(text)).toBe('packages/foo/src/bar.ts');
  });

  test('URL を target として返さない', () => {
    const text = '参考: `https://github.com/owner/repo/blob/feature/foo/docs/design.md`';
    expect(extractTargetFromFinding(text)).toBeNull();
  });

  test('グロブを target として返さない', () => {
    expect(extractTargetFromFinding('`packages/*/src/i18n/navigation.ts` が対象')).toBeNull();
  });
});

describe('extractBacktickPaths', () => {
  test('パスとして成立する値だけを返す', () => {
    const line = 'レビュー対象: `packages/markdown-viewer` `packages/foo/src/bar.ts`';
    expect(extractBacktickPaths(line)).toEqual([
      'packages/markdown-viewer',
      'packages/foo/src/bar.ts',
    ]);
  });

  // 退行防止: 旧実装はバッククォート内容を無検証で全部返していたため、
  // `レビュー対象:` 行やセッションの user prompt にある散文・コマンド・URL が
  // そのまま target_refs と既定 target になっていた。
  test('散文・コマンド・URL を除外する', () => {
    const line =
      '`レビュー対象` `node --test scripts/x.test.mjs` `https://example.com/a.ts` `packages/foo/src/bar.ts`';
    expect(extractBacktickPaths(line)).toEqual(['packages/foo/src/bar.ts']);
  });

  test('行番号サフィックスを落として重複を畳む', () => {
    const line = '`packages/foo/src/bar.ts:10` と `packages/foo/src/bar.ts:20`';
    expect(extractBacktickPaths(line)).toEqual(['packages/foo/src/bar.ts']);
  });

  test('絶対パスは剥がさずそのまま返す', () => {
    const line = '`/anytime-trade/docs/specs/x.md`';
    expect(extractBacktickPaths(line)).toEqual(['/anytime-trade/docs/specs/x.md']);
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

describe('parseChecklistRefMarker', () => {
  // anytime-trail-review スキルのメタデータ 4 行目 `- **観点**: §14 / none` を解析する。
  // 章番号は code-review-checklist スキル（旧 code-quality.md と同一番号）を指す。
  test('bullet + bold marker `- **観点**: §14` → §14', () => {
    expect(parseChecklistRefMarker('- **観点**: §14\n- **カテゴリ**: logic')).toBe('§14');
  });

  test('subsection `- **観点**: §14.4` → §14.4', () => {
    expect(parseChecklistRefMarker('- **観点**: §14.4')).toBe('§14.4');
  });

  test('trailing label text is stripped `§6 モダン JS API` → §6', () => {
    expect(parseChecklistRefMarker('- **観点**: §6 モダン JS API')).toBe('§6');
  });

  test('none variants → none', () => {
    expect(parseChecklistRefMarker('- **観点**: none')).toBe('none');
    expect(parseChecklistRefMarker('- **観点**: 該当なし')).toBe('none');
    expect(parseChecklistRefMarker('- 観点: なし')).toBe('none');
  });

  test('English label `checklist: §12` → §12', () => {
    expect(parseChecklistRefMarker('Checklist: §12')).toBe('§12');
  });

  test('full-width colon `観点： §3` → §3', () => {
    expect(parseChecklistRefMarker('- 観点： §3')).toBe('§3');
  });

  test('no marker line → null (未記録として扱う)', () => {
    expect(parseChecklistRefMarker('通常の本文。観点の記載なし。')).toBeNull();
  });

  test('unrecognized value → null (§ でも none でもない)', () => {
    expect(parseChecklistRefMarker('- **観点**: いろいろ')).toBeNull();
  });

  test('line-leading 観点: inside a fenced code block → null', () => {
    expect(parseChecklistRefMarker('```\n観点: §5\n```')).toBeNull();
  });

  test('first marker wins when multiple findings concatenated', () => {
    expect(parseChecklistRefMarker('- 観点: §8\n本文\n- 観点: none')).toBe('§8');
  });
});

describe('parseTargetMarker', () => {
  test('スキル書式のメタデータ行からパスを取る', () => {
    expect(parseTargetMarker('- **対象**: `packages/trail-viewer/src/a.ts:12`')).toBe(
      'packages/trail-viewer/src/a.ts',
    );
  });

  test('bullet・bold・全角コロンの揺れを許容する', () => {
    expect(parseTargetMarker('**対象**：`packages/x/src/b.ts`')).toBe('packages/x/src/b.ts');
    expect(parseTargetMarker('対象: `packages/x/src/c.ts`')).toBe('packages/x/src/c.ts');
    expect(parseTargetMarker('- target: `packages/x/src/d.ts`')).toBe('packages/x/src/d.ts');
  });

  test('ディレクトリ指定も受ける（ファイル拡張子を要求しない）', () => {
    expect(parseTargetMarker('- **対象**: `packages/markdown-viewer`')).toBe('packages/markdown-viewer');
  });

  test('バッククォート無しの素の値も受ける', () => {
    expect(parseTargetMarker('- **対象**: packages/x/src/e.ts:3-9')).toBe('packages/x/src/e.ts');
  });

  test('パスとして成立しない値は null（本文推測へ委ねる）', () => {
    expect(parseTargetMarker('- **対象**: 全体')).toBeNull();
    expect(parseTargetMarker('- **重大度**: error')).toBeNull();
  });

  test('コードブロック内の 対象: は拾わない', () => {
    expect(parseTargetMarker('```\n対象: `packages/x/src/f.ts`\n```')).toBeNull();
  });
});

describe('resolveFindingTarget', () => {
  const own = '### 1. NULL 参照\n`src/foo.ts` を例に説明する。';

  test('finding 自身のマーカーが最優先', () => {
    expect(
      resolveFindingTarget({
        ownText: '- **対象**: `packages/a/src/own.ts`\n' + own,
        chapterTarget: 'packages/a/src/chapter.ts',
        chapterFindingCount: 3,
      }),
    ).toBe('packages/a/src/own.ts');
  });

  test('チャプターに finding が 1 件だけならチャプターのマーカーを使う', () => {
    expect(
      resolveFindingTarget({ ownText: own, chapterTarget: 'packages/a/src/chapter.ts', chapterFindingCount: 1 }),
    ).toBe('packages/a/src/chapter.ts');
  });

  test('複数 finding が同居するチャプターではチャプターのマーカーを流用しない', () => {
    // 流用すると 2 件目以降が別ファイルの指摘でも同じ対象を持ち、linkAddresses が
    // 無関係なコミットを addressed として確定させる。本文推測へ落とす（fail-closed）。
    expect(
      resolveFindingTarget({ ownText: own, chapterTarget: 'packages/a/src/chapter.ts', chapterFindingCount: 2 }),
    ).toBe('src/foo.ts');
  });

  test('マーカーも本文のパスも無ければ null', () => {
    expect(
      resolveFindingTarget({ ownText: '対象の書かれていない指摘', chapterTarget: null, chapterFindingCount: 1 }),
    ).toBeNull();
  });
});

// ── extractTargetFromFinding: Markdown 強調で潰れていた退行 ────────────────────
//
// `maskNonPathTokens` はグロブを落とすため `\S*[*?]\S*` を空白へ潰していた。
// Markdown の強調 `**path**` も 1 トークンとして `*` を含むため丸ごと消え、
// 「太字で対象を書いたレビュー」だけが対象欠落になっていた（本番実データで確認）。

describe('extractTargetFromFinding: Markdown 強調', () => {
  test('**bold** で囲まれたパスを取り出す', () => {
    const text = '- **packages/foo/src/bar.ts:48** - 該当行の説明';
    expect(extractTargetFromFinding(text)).toBe('packages/foo/src/bar.ts');
  });

  test('強調を剥がしてもグロブは落とす（誤抽出の再導入を防ぐ）', () => {
    const text = '**packages/*/src/i18n/navigation.ts** を一括で直す';
    expect(extractTargetFromFinding(text)).toBeNull();
  });
});

// ── extractTargetFromFinding: 拡張子リストの単一の正 ──────────────────────────
//
// 抽出器と正規化で拡張子リストを二重管理していたため、`.py` / `.sh` 等は
// 正規化を通るのに抽出器が拾わないという非対称が生じていた。

describe('extractTargetFromFinding: 正規化と同じ拡張子集合', () => {
  test('py を拾う', () => {
    expect(extractTargetFromFinding('`scripts/collect.py:12` が落ちる')).toBe('scripts/collect.py');
  });

  test('sh を拾う', () => {
    expect(extractTargetFromFinding('`scripts/build.sh` の exit code')).toBe('scripts/build.sh');
  });
});

// ── extractBasenameCandidates ────────────────────────────────────────────────

describe('extractBasenameCandidates', () => {
  test('バッククォート内の裸のファイル名を候補にする', () => {
    const text = '`pipelineWatchdog.ts:33-38` が `status=running` の run を書き換える';
    expect(extractBasenameCandidates(text)).toEqual(['pipelineWatchdog.ts']);
  });

  test('出現順を保ち重複を畳む', () => {
    const text = '`cli.ts` と `trailDaemonEntry.ts`、再び `cli.ts`';
    expect(extractBasenameCandidates(text)).toEqual(['cli.ts', 'trailDaemonEntry.ts']);
  });

  test('ディレクトリ区切りを含むものは候補にしない（既存の抽出器の担当）', () => {
    expect(extractBasenameCandidates('`packages/foo/src/bar.ts`')).toEqual([]);
  });

  test('絶対パスは候補にしない', () => {
    expect(extractBasenameCandidates('`/anytime-markdown/CLAUDE.md`')).toEqual([]);
  });

  test('既知拡張子でないものは候補にしない（関数名・散文の誤抽出を防ぐ）', () => {
    expect(extractBasenameCandidates('`runVerified()` と `status=running` と `.gitignore`')).toEqual([]);
  });

  test('バッククォート外のファイル名は候補にしない', () => {
    expect(extractBasenameCandidates('cli.ts が落ちる')).toEqual([]);
  });

  test('文脈として常に言及される正本ファイルは候補にしない', () => {
    expect(extractBasenameCandidates('`CLAUDE.md` の規約に従い `AGENTS.md` も見る')).toEqual([]);
  });

  test('空文字は空配列', () => {
    expect(extractBasenameCandidates('')).toEqual([]);
  });
});
