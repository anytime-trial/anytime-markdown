#!/bin/bash
# GitHub Issues / Security Alerts / Dependabot Alerts / Code Scanning Alerts 取得
# Usage: bash fetch-github-issues.sh <owner/repo>
# Output: JSON array to stdout（取得できなかったソースは 0 件になり、理由は stderr に出る）

set -euo pipefail

REPO="${1:?Usage: fetch-github-issues.sh <owner/repo>}"

STDERR_CAPTURE=$(mktemp)
# 取得できなかったソース名を 1 行 1 件で貯める。最後にまとめて要約を出す
# （0 件と取得不可を混同させない）。
#
# シェル変数の配列にしてはいけない。下のヘルパはすべて `x=$(helper ...)` の
# コマンド置換＝**サブシェル**で呼ばれるため、配列への追記は親シェルへ届かず、
# 要約の分岐が常に偽になる（変数とコメントだけが残る死にコードになる）。
FAILED_LOG=$(mktemp)
trap 'rm -f "$STDERR_CAPTURE" "$FAILED_LOG"' EXIT

##
# gh コマンドを実行し、JSON 配列が返ったときだけそれを stdout へ出す。
# 取得できなければ空配列を出し、理由を stderr に残して 0 で返る（1 ソースの失敗で
# 全体を落とさない）。
#
# `cmd || echo "[]"` 形式は使えない。gh は HTTP エラー時も**レスポンス本体を stdout へ
# 書いてから**非ゼロ終了するため、`||` の右辺は置換ではなく追記になる。結果として変数に
# 「エラーオブジェクト + []」の 2 値が入り、後段の jq が
# `array and object cannot be added` で落ちる（PAT 権限不足の 403 で実際に発生し、
# スクリプト全体が exit 5 で停止した）。出力は必ず変数へ受け、採否を判定してから返す。
##
fetch_json_array() {
  local label="$1"
  shift

  local out status=0
  out=$("$@" 2>"$STDERR_CAPTURE") || status=$?

  if [[ $status -ne 0 ]]; then
    local reason
    reason=$(tr '\n' ' ' <"$STDERR_CAPTURE" | cut -c1-300)
    printf 'WARN: %s の取得に失敗しました (exit %d): %s\n' "$label" "$status" "$reason" >&2
    printf '%s\n' "$label" >>"$FAILED_LOG"
    printf '[]'
    return 0
  fi

  if ! jq -e 'type == "array"' <<<"$out" >/dev/null 2>&1; then
    printf 'WARN: %s が JSON 配列を返しませんでした。0 件として続行します\n' "$label" >&2
    printf '%s\n' "$label" >>"$FAILED_LOG"
    printf '[]'
    return 0
  fi

  printf '%s' "$out"
}

##
# 取得した JSON を共通スキーマの配列へ写像し、件数を stderr に出す。
# 件数を必ず出すのは、0 件（正常）と取得失敗（WARN 済み）を読み手が区別できるようにするため。
#
# 写像側にも採否判定を置く。`--slurp` は gh が exit 0 で返す限り必ず配列で包むため、
# fetch_json_array の「配列か」ガードは通ってしまい、応答の形が想定と違うことは
# ここの `.[][]` が `Cannot iterate over ...` で落ちるまで分からない。素通しにすると
# `set -e` でスクリプトごと止まり、今回直したのと同じ「1 ソースの異常で収集が
# まるごと失われる」障害が別経路で戻る。
##
map_and_count() {
  local label="$1" filter="$2" raw="$3"
  local mapped
  if ! mapped=$(jq -c "$filter" <<<"$raw" 2>"$STDERR_CAPTURE"); then
    printf 'WARN: %s の写像に失敗しました（応答の形が想定と異なる）: %s\n' \
      "$label" "$(tr '\n' ' ' <"$STDERR_CAPTURE" | cut -c1-300)" >&2
    printf '%s\n' "$label" >>"$FAILED_LOG"
    printf '[]'
    return 0
  fi
  printf 'INFO: %s: %s 件\n' "$label" "$(jq 'length' <<<"$mapped")" >&2
  printf '%s' "$mapped"
}

# 1. GitHub Issues (open)
# --limit の既定は 30。明示しないと 31 件目以降を無言で落とす。
issues_raw=$(fetch_json_array "GitHub Issues" \
  gh issue list --repo "$REPO" --state open --limit 1000 --json number,title,labels,url)
issues=$(map_and_count "GitHub Issues" '
  [.[] | {
    source: "github-issue",
    id: (.number | tostring),
    severity: (if (.labels | map(.name) | any(test("critical|blocker"; "i"))) then "critical"
              elif (.labels | map(.name) | any(test("bug"))) then "high"
              elif (.labels | map(.name) | any(test("enhancement"))) then "medium"
              else "low" end),
    title: .title,
    file: "",
    line: 0,
    rule: (.labels | map(.name) | join(",")),
    url: .url
  }]' "$issues_raw")

# 2〜4 は `--paginate --slurp` で全ページを取る（`--slurp` は `--jq` と併用できないため、
# 写像は後段の jq で行う）。`--slurp` の出力はページごとの配列を要素に持つ配列なので、
# 写像側は `.[][]` で 1 段ほどく。

# 2. Dependabot Alerts (open)
dependabot_raw=$(fetch_json_array "Dependabot Alerts" \
  gh api "/repos/$REPO/dependabot/alerts?state=open&per_page=100" --paginate --slurp)
dependabot=$(map_and_count "Dependabot Alerts" '
  [.[][] | {
    source: "dependabot",
    id: (.number | tostring),
    severity: .security_vulnerability.severity,
    title: .security_advisory.summary,
    file: .dependency.manifest_path,
    line: 0,
    rule: (.security_advisory.cve_id // .security_advisory.ghsa_id),
    url: .html_url
  }]' "$dependabot_raw")

# 3. Security Advisories
advisories_raw=$(fetch_json_array "Security Advisories" \
  gh api "/repos/$REPO/security-advisories?per_page=100" --paginate --slurp)
advisories=$(map_and_count "Security Advisories" '
  [.[][] | select(.state == "published") | {
    source: "security-alert",
    id: (.ghsa_id // ""),
    severity: .severity,
    title: .summary,
    file: "",
    line: 0,
    rule: (.cve_id // .ghsa_id // ""),
    url: .html_url
  }]' "$advisories_raw")

# 4. Code Scanning Alerts (CodeQL etc.)
# --paginate 必須。1 ページ（100 件）だけだと取りこぼす（2026-08-03 実測: 337 件中 100 件）。
codescan_raw=$(fetch_json_array "Code Scanning Alerts" \
  gh api "/repos/$REPO/code-scanning/alerts?state=open&per_page=100" --paginate --slurp)
codescan=$(map_and_count "Code Scanning Alerts" '
  [.[][] | {
    source: "code-scanning",
    id: (.number | tostring),
    severity: (.rule.security_severity_level // .rule.severity // "medium"),
    title: .rule.description,
    file: .most_recent_instance.location.path,
    line: (.most_recent_instance.location.start_line // 0),
    rule: .rule.id,
    url: .html_url
  }]' "$codescan_raw")

if [[ -s "$FAILED_LOG" ]]; then
  printf 'WARN: 取得できなかったソース: %s（レポートの収集結果に「取得不可」として残すこと）\n' \
    "$(sort -u "$FAILED_LOG" | paste -sd', ' -)" >&2
fi

jq -s 'add' <<<"$issues
$dependabot
$advisories
$codescan"
