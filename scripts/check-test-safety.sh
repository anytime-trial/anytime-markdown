#!/usr/bin/env bash
#
# Test safety check: テストファイルが保護領域に書き込む危険なパターンを含んで
# いないかを静的に検査する。
#
# モード:
#   --staged (既定) … ステージング済みのテストファイルのみ検査（.husky/pre-commit 用）
#   --all           … git 追跡下の全テストファイルを検査（CI 用）
#
# --all が必要な理由: CI には staged ファイルが存在しないため、--staged のまま
# CI に置くと常に exit 0 の空振りになる。また pre-commit は `--no-verify` で
# 迂回できるため、迂回して入った違反はツリー全体の走査でしか捕捉できない。
#
# 検査対象: `.test.ts` および `__tests__/**/*.ts`
# 検査除外:
#   - テストファクトリ本体（support/createTest*.ts）
#   - コメント専用行（説明文中の言及で誤検知しないため）
#   - `test-safety-allow` を含む行（ガード自体を検証するテストの意図的な保護パス参照）
#
# 背景: 2026-04-20 に `new TrailDatabase('/tmp')` が ~/.claude/trail/trail.db に
# フォールバックし、273 セッション分のデータが消失する事故が発生。
# 同種の事故を静的検査で再発防止する。

set -euo pipefail

MODE="${1:---staged}"

case "$MODE" in
  --staged)
    FILES=$(git diff --cached --name-only --diff-filter=ACM \
      | { grep -E '\.test\.ts$|__tests__/.*\.ts$' || true; })
    ;;
  --all)
    FILES=$(git ls-files \
      | { grep -E '\.test\.ts$|__tests__/.*\.ts$' || true; })
    ;;
  *)
    echo "usage: check-test-safety.sh [--staged|--all]" >&2
    exit 64
    ;;
esac

if [ -z "$FILES" ]; then
  exit 0
fi

# 検査対象行（コメント専用行と test-safety-allow マーカー行を除いた行）を出力する。
scannable() {
  grep -vP '^\s*(//|\*|/\*)' "$1" | grep -vF 'test-safety-allow' || true
}

FAILED=0
REASONS=()

for FILE in $FILES; do
  # --all では index にあってもワークツリーに無いことがある（削除済み等）
  [ -f "$FILE" ] || continue

  # テストファクトリ本体は除外（createTestDb.ts / createTest*.ts）
  if [[ "$FILE" == *"/support/createTest"* ]]; then
    continue
  fi

  # 危険パターン: 本番パスへのフォールバックを誘発する new TrailDatabase 呼び出し
  # （第2引数が ITrailStorage でも storageDir でも許可）
  if scannable "$FILE" | grep -Pq 'new\s+TrailDatabase\s*\('; then
    REASONS+=("[$FILE] new TrailDatabase(...) を直接呼び出しています。createTestTrailDatabase() を使ってください。")
    FAILED=1
  fi

  # 危険パターン: 保護領域リテラル
  if scannable "$FILE" | grep -Pq '(~/\.claude|~/\.vscode-server|os\.homedir\s*\(\s*\))'; then
    REASONS+=("[$FILE] 保護領域リテラル (~/.claude, ~/.vscode-server, os.homedir()) が含まれます。一時ディレクトリ (os.tmpdir() + fs.mkdtempSync) を使ってください。")
    FAILED=1
  fi

  # 危険パターン: テスト内で直接 fs.writeFileSync を呼ぶ。
  # ただし、同ファイルで `os.tmpdir()` + `fs.mkdtempSync` を使っており、
  # かつ保護領域リテラルを含まない場合は一時ディレクトリ利用と判断し許可する。
  if scannable "$FILE" | grep -Pq 'fs\.(writeFileSync|promises\.writeFile|appendFileSync)'; then
    if grep -q 'os\.tmpdir\s*(' "$FILE" && grep -q 'fs\.mkdtempSync\s*(' "$FILE"; then
      :
    else
      REASONS+=("[$FILE] テストで fs.writeFileSync / appendFileSync を直接呼んでいます。os.tmpdir() + fs.mkdtempSync のパターンで一時ディレクトリに限定するか、ファクトリ経由にしてください。")
      FAILED=1
    fi
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "==================================================================="
  echo " test safety check FAILED ($MODE)"
  echo "==================================================================="
  for R in "${REASONS[@]}"; do
    echo "  - $R"
  done
  echo ""
  echo "意図的な保護パス参照（ガード自体の検証）は行末に test-safety-allow: <理由> を付ける。"
  echo "参考: ~/.claude/CLAUDE.md 『永続データ保護』"
  echo "      ~/.claude/rules/code-quality.md 17章『永続データ保護の実装ルール』"
  exit 1
fi

exit 0
