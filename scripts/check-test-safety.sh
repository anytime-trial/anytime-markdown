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
#   - コメント（行コメント・ブロックコメント。文字列リテラル中の // は除外しない）
#   - MARKER_ALLOWED_FILES に列挙したファイルの、`test-safety-allow: <理由>` を持つ行
#
# マーカーをファイル allowlist で縛る理由: 任意のテストファイルが 1 行の
# コメントでゲートを無効化できると、本ゲートが防ぐはずの事故そのものが素通りする。
# 例外を増やすときは本スクリプトの差分としてレビューに載せる。
#
# 背景: 2026-04-20 に `new TrailDatabase('/tmp')` が ~/.claude/trail/trail.db に
# フォールバックし、273 セッション分のデータが消失する事故が発生。
# 同種の事故を静的検査で再発防止する。

set -euo pipefail

# マーカーによる例外を許可するファイル（ガード自体・副作用メタテスト）。
MARKER_ALLOWED_FILES=(
  "packages/trail-db/src/__tests__/TrailDatabase.guard.test.ts"
  "packages/vscode-trail-extension/src/__tests__/no-side-effects.meta.test.ts"
)

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

is_marker_allowed() {
  local file="$1"
  local allowed
  for allowed in "${MARKER_ALLOWED_FILES[@]}"; do
    [ "$file" = "$allowed" ] && return 0
  done
  return 1
}

# コメントを除去し、コード部分だけを出力する。
# 文字列リテラル中の // や /* はコメント開始として扱わない（'http://x' で行が切れないため）。
# SHORTCUT: 行単位の字句解析で状態を持つのはブロックコメントのみ. ceiling: 複数行テンプレート
# リテラル内の // 以降は検査対象外. upgrade: テンプレート内に検査対象パターンを書くテストが
# 現れたら TS パーサ（ts-morph 等）へ移行する.
strip_comments() {
  awk '
    BEGIN { inblock = 0 }
    {
      line = $0; out = ""; i = 1; n = length(line); q = ""
      while (i <= n) {
        ch = substr(line, i, 1); c2 = substr(line, i, 2)
        if (inblock) {
          if (c2 == "*/") { inblock = 0; i += 2 } else { i++ }
          continue
        }
        if (q != "") {
          out = out ch
          if (ch == "\\") { out = out substr(line, i + 1, 1); i += 2; continue }
          if (ch == q) { q = "" }
          i++
          continue
        }
        if (c2 == "//") { break }
        if (c2 == "/*") { inblock = 1; i += 2; continue }
        if (ch == "\"" || ch == "'"'"'" || ch == "`") { q = ch }
        out = out ch; i++
      }
      print out
    }
  '
}

# 検査対象行（コメントを除いたコード。allowlist ファイルでは理由つきマーカー行も除く）を出力する。
scannable() {
  local file="$1"
  if is_marker_allowed "$file"; then
    # 理由（`:` の後に非空白）を伴うマーカー行のみ除外する。裸の `test-safety-allow` は無効。
    { grep -vP 'test-safety-allow:\s*\S' "$file" || true; } | strip_comments
  else
    strip_comments < "$file"
  fi
}

FAILED=0
REASONS=()

while IFS= read -r FILE; do
  [ -n "$FILE" ] || continue
  # --all では index にあってもワークツリーに無いことがある（削除済み等）
  [ -f "$FILE" ] || continue

  # テストファクトリ本体は除外（createTestDb.ts / createTest*.ts）
  if [[ "$FILE" == *"/support/createTest"* ]]; then
    continue
  fi

  CODE=$(scannable "$FILE")

  # 危険パターン: 本番パスへのフォールバックを誘発する new TrailDatabase 呼び出し
  # （第2引数が ITrailStorage でも storageDir でも許可）
  if printf '%s' "$CODE" | grep -Pq 'new\s+TrailDatabase\s*\('; then
    REASONS+=("[$FILE] new TrailDatabase(...) を直接呼び出しています。createTestTrailDatabase() を使ってください。")
    FAILED=1
  fi

  # 危険パターン: 保護領域リテラル
  if printf '%s' "$CODE" | grep -Pq '(~/\.claude|~/\.vscode-server|os\.homedir\s*\(\s*\))'; then
    REASONS+=("[$FILE] 保護領域リテラル (~/.claude, ~/.vscode-server, os.homedir()) が含まれます。一時ディレクトリ (os.tmpdir() + fs.mkdtempSync) を使ってください。")
    FAILED=1
  fi

  # 危険パターン: テスト内で直接 fs.writeFileSync を呼ぶ。
  # ただし、同ファイルの**コード**で `os.tmpdir()` + `fs.mkdtempSync` を使っている場合は
  # 一時ディレクトリ利用と判断し許可する（コメントでの言及は許可条件にならない）。
  if printf '%s' "$CODE" | grep -Pq 'fs\.(writeFileSync|promises\.writeFile|appendFileSync)'; then
    if printf '%s' "$CODE" | grep -q 'os\.tmpdir\s*(' \
      && printf '%s' "$CODE" | grep -q 'fs\.mkdtempSync\s*('; then
      :
    else
      REASONS+=("[$FILE] テストで fs.writeFileSync / appendFileSync を直接呼んでいます。os.tmpdir() + fs.mkdtempSync のパターンで一時ディレクトリに限定するか、ファクトリ経由にしてください。")
      FAILED=1
    fi
  fi
done <<< "$FILES"

if [ "$FAILED" -ne 0 ]; then
  echo "==================================================================="
  echo " test safety check FAILED ($MODE)"
  echo "==================================================================="
  for R in "${REASONS[@]}"; do
    echo "  - $R"
  done
  echo ""
  echo "ガード自体の検証など意図的な保護パス参照は、本スクリプトの MARKER_ALLOWED_FILES に"
  echo "ファイルを追加したうえで、該当行に test-safety-allow: <理由> を付ける。"
  echo "参考: ~/.claude/CLAUDE.md 『永続データ保護』"
  echo "      ~/.claude/rules/code-quality.md 17章『永続データ保護の実装ルール』"
  exit 1
fi

exit 0
