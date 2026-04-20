#!/usr/bin/env bash
#
# Pre-commit safety check: staged test files が保護領域に書き込む危険な
# パターンを含んでいないかを静的に検査する。
#
# 検査対象: `.test.ts` および `__tests__/**/*.ts` のステージング済みファイル
# 例外: テストファクトリ本体（support/createTestDb.ts）は検査対象外
#
# 背景: 2026-04-20 に `new TrailDatabase('/tmp')` が ~/.claude/trail/trail.db に
# フォールバックし、273 セッション分のデータが消失する事故が発生。
# 同種の事故を静的検査で再発防止する。

set -euo pipefail

STAGED=$(git diff --cached --name-only --diff-filter=ACM \
  | { grep -E '\.test\.ts$|__tests__/.*\.ts$' || true; })

if [ -z "$STAGED" ]; then
  exit 0
fi

FAILED=0
REASONS=()

for FILE in $STAGED; do
  # テストファクトリ本体は除外（createTestDb.ts / createTest*.ts）
  if [[ "$FILE" == *"/support/createTest"* ]]; then
    continue
  fi

  # 危険パターン: 本番パスへのフォールバックを誘発する new TrailDatabase 呼び出し
  # （第2引数が ITrailStorage でも storageDir でも許可）
  if grep -Pn 'new\s+TrailDatabase\s*\(' "$FILE" > /dev/null 2>&1; then
    REASONS+=("[$FILE] new TrailDatabase(...) を直接呼び出しています。createTestTrailDatabase() を使ってください。")
    FAILED=1
  fi

  # 危険パターン: 保護領域リテラル
  if grep -Pn '(~/\.claude|~/\.vscode-server|os\.homedir\s*\(\s*\))' "$FILE" > /dev/null 2>&1; then
    REASONS+=("[$FILE] 保護領域リテラル (~/.claude, ~/.vscode-server, os.homedir()) が含まれます。一時ディレクトリ (os.tmpdir() + fs.mkdtempSync) を使ってください。")
    FAILED=1
  fi

  # 危険パターン: テスト内で直接 fs.writeFileSync を呼ぶ
  if grep -Pn 'fs\.(writeFileSync|promises\.writeFile|appendFileSync)' "$FILE" > /dev/null 2>&1; then
    REASONS+=("[$FILE] テストで fs.writeFileSync / appendFileSync を直接呼んでいます。一時ディレクトリに限定するか、ファクトリ経由にしてください。")
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "==================================================================="
  echo " pre-commit safety check FAILED"
  echo "==================================================================="
  for R in "${REASONS[@]}"; do
    echo "  - $R"
  done
  echo ""
  echo "参考: /home/node/.claude/CLAUDE.md 『永続データ保護』"
  echo "      /anytime-markdown/CLAUDE.md 『永続化クラスのテスト規約』"
  exit 1
fi

exit 0
