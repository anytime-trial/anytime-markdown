import {
  extractTargetFromFinding,
  parseTargetMarker,
} from '../../../src/ingest/review/findingHelpers';

/**
 * 実トレース由来の評価ケース層（proposal 20260815-adlc-evals-adoption 改善案 1）。
 *
 * 通常のユニットテストが開発者の想定入力（fixture）で仕様を固定するのに対し、
 * ここは**実運用の caravan_review_findings に実在したレコード**から最小化・サニタイズした
 * 入力で、対象パス解決の実分布に対する挙動を二値（Pass/Fail）で固定する。
 * 2026-08-15 実測: 対象パス欠落 738 件のうち、本文にパスらしき文字列を含むのに
 * 回収できないものが 286 件、パスらしき文字列自体が無いものが 423 件あった。
 *
 * 各ケースの由来はコメントの finding id（caravan_review_findings.id）。本文は指摘の
 * 構造（パスの書かれ方）を保存する範囲で短縮している。
 *
 * `test.failing` は「望ましい挙動だが現行実装は満たさない」ケースの明示的な記録
 * （adlc evals の backlog ルーティングに相当）。実装が追いついて満たすようになると
 * このテストは「予期せず成功」として落ちるので、その時点で通常の test へ昇格する。
 */
describe('real-trace eval cases: target path resolution', () => {
  // finding 906b0d412eea076c — 絶対パス + `line 87` 形式（他ワークスペース由来の指摘）。
  // 既知ディレクトリ接頭辞（tests/）以降が回収されること。
  test('EVAL-001: absolute path with trailing line reference is recovered', () => {
    const text = [
      '`test_research_requires_auth` only covers `GET /api/research`',
      '',
      '- `/anytime-trade/backend/tests/research/test_research_router.py` line 87',
      '- `POST /api/research` are not asserted to return 401 without a token.',
    ].join('\n');
    expect(extractTargetFromFinding(text)).toBe('tests/research/test_research_router.py');
  });

  // finding f779607710d93858 — 見出し先頭の `path:line` 形式＋フェンスコード付き本文。
  // フェンス内のコードに惑わされず見出しのパスが回収されること。
  test('EVAL-002: heading `path:line` with fenced code body is recovered', () => {
    const text = [
      '`scripts/dcf_backtest.py:49` — P0 で修正対象にした JST日付バグが、同じスクリプトの呼び出し元に残存',
      '',
      '```python',
      'async def run(limit, sleep):',
      '    today = date.today()',
      '```',
      '',
      'commit `9a21eba` は `date.today()` を共有 `timeutil.today_jst()` に統一と明記。',
    ].join('\n');
    expect(extractTargetFromFinding(text)).toBe('scripts/dcf_backtest.py');
  });

  // finding 5ea8e059f3ca7e3a — `memory-core/package.json` のように既知接頭辞
  // （packages/src/tests/spec/scripts/...）に乗らないパッケージ直下パスは現行の
  // PATH_TOKEN_RE が拾えない（2026-08-15 実測でこの型が 286 件中の主要形）。
  // 望ましい挙動はパスの回収。実装が追いつくまで failing として記録する。
  test.failing('EVAL-003: package-root relative path outside known prefixes is recovered', () => {
    const text = [
      '`memory-core/package.json` — `ollama-core` を runtime dependencies に追加 (不要)',
      '',
      'テストファイル (`__tests__/**`) が `@anytime-markdown/ollama-core` を import するために追加されているが、テスト専用の import は `devDependencies` で十分。',
    ].join('\n');
    expect(extractTargetFromFinding(text)).toBe('memory-core/package.json');
  });

  // finding facc74720652c4b4 — パスらしき文字列を一切含まない散文指摘（423 件の型）。
  // null が正しい（本文からの推測で誤リンクを作らない）。対象の供給は
  // レビュー書式の `- **対象**:` 行の責務（~/.claude/rules/pre-merge-review.md）。
  test('EVAL-004: prose-only finding without any path stays null (no guessing)', () => {
    const text =
      '`@dataclass(frozen=True)` はフィールドへの再代入を防ぐが、`daily_epsilon: list[float]` の中身は依然として変更できる。';
    expect(extractTargetFromFinding(text)).toBeNull();
  });

  // anytime-trail-review 書式の対象マーカー行（正の対照）。:line は除去される。
  test('EVAL-005: canonical target marker line resolves to the path without line suffix', () => {
    const text = '- **対象**: `packages/trail-caravan-book/src/ingest/review/findingHelpers.ts:434`';
    expect(parseTargetMarker(text)).toBe(
      'packages/trail-caravan-book/src/ingest/review/findingHelpers.ts',
    );
  });

  // 太字強調で囲まれたパス（本番データで「太字レビューだけ対象欠落」として実在した
  // 既修正バグの回帰ガード。maskNonPathTokens の ** 剥がし）。
  test('EVAL-006: bold-wrapped path token is not destroyed by glob masking', () => {
    const text = '**packages/foo/src/bar.ts:48** で null 参照';
    expect(extractTargetFromFinding(text)).toBe('packages/foo/src/bar.ts');
  });
});
