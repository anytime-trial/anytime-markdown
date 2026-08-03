#!/bin/bash
# SonarCloud Issues + Security Hotspots 取得
# Usage: bash fetch-sonar-issues.sh [project-key]
# Output: JSON array to stdout。取得件数と失敗理由は stderr。
# project-key 省略時は sonar-project.properties から取得
#
# 終了コード:
#   0 = 1 つ以上のソースを収集できた（片方が失敗しても、取れた分は返す）
#   1 = 前提が満たせない（project key 不明）か、全ソースが失敗して成果ゼロ
#
# 認証: SONAR_TOKEN があれば付与する。公開プロジェクトは無くても読めるが、
# 非公開化すると 403 になるため、環境にあれば使う。

set -euo pipefail

STDERR_CAPTURE=$(mktemp)
# 取得できなかったソース名を 1 行 1 件で貯める。シェル配列にしてはいけない
# （下のヘルパは `x=$(helper ...)` のコマンド置換＝サブシェルで呼ばれるため、
# 配列への追記は親シェルへ届かず、要約の分岐が常に偽になる）。
FAILED_LOG=$(mktemp)
# 切り捨て・部分取得は FAILED_LOG と分ける（「1 件も取れなかった」と混ぜない）。
TRUNCATED_LOG=$(mktemp)
trap 'rm -f "$STDERR_CAPTURE" "$FAILED_LOG" "$TRUNCATED_LOG"' EXIT

API_BASE="https://sonarcloud.io/api"
PAGE_SIZE=100
# SonarCloud の検索 API は先頭 10,000 件しか返さない（p * ps > 10000 でエラー）。
# 超過を「取得に失敗」で片付けると原因が読めないため、専用の警告を出す。
MAX_RESULTS=10000

##
# sonar-project.properties から projectKey を解決する。
#
# `grep ... | cut ...` を素で書くと、行が無いとき pipefail + set -e で
# **下の「project key not found」に到達する前に**スクリプトが落ちる。
# 用意したエラーメッセージが、まさにそのケースで到達不能になる。
##
resolve_project_key() {
  local dir="$PWD"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/sonar-project.properties" ]]; then
      # 行が無くても失敗させない（採否は呼び出し側の空判定で行う）。
      grep '^sonar.projectKey=' "$dir/sonar-project.properties" | cut -d= -f2 | head -1 || true
      return 0
    fi
    dir=$(dirname "$dir")
  done
}

PROJECT_KEY="${1:-}"
if [[ -z "$PROJECT_KEY" ]]; then
  PROJECT_KEY=$(resolve_project_key)
fi
if [[ -z "$PROJECT_KEY" ]]; then
  echo "ERROR: project key not found. 引数で渡すか、sonar-project.properties に sonar.projectKey= を置いてください。" >&2
  exit 1
fi

##
# SonarCloud API を 1 回叩き、成功時だけレスポンス本体を stdout へ出す。
# 失敗時は理由を stderr に出して 1 を返す（本体は出さない）。
#
# `curl -s` 単体はエラーメッセージまで抑止するため、通信断のとき
# **出力も理由もゼロのまま終了**していた。`-S` を足して理由を捕まえる。
# HTTP エラー時は API が `{"errors":[{"msg":...}]}` を返すので、それも読む
# （401 / 403 / 500 / 上限超過を「failed to fetch」の一律メッセージへ潰さない）。
##
sonar_get() {
  local label="$1" url="$2"

  local raw status=0
  if [[ -n "${SONAR_TOKEN:-}" ]]; then
    # トークンを argv に置かない。`-u` で渡すと実行中は同一ホストの任意プロセスから
    # `ps` / `/proc/<pid>/cmdline` で平文のまま読める（ページングで最大 101 回起動する）。
    raw=$(printf 'user = "%s:"\n' "$SONAR_TOKEN" \
      | curl -sS -w $'\n%{http_code}' --config - "$url" 2>"$STDERR_CAPTURE") || status=$?
  else
    raw=$(curl -sS -w $'\n%{http_code}' "$url" 2>"$STDERR_CAPTURE") || status=$?
  fi
  if [[ $status -ne 0 ]]; then
    printf 'WARN: %s: 通信に失敗しました (curl exit %d): %s\n' \
      "$label" "$status" "$(tr '\n' ' ' <"$STDERR_CAPTURE" | cut -c1-300)" >&2
    return 1
  fi

  local code=${raw##*$'\n'}
  local body=${raw%$'\n'*}
  if [[ "$code" != "200" ]]; then
    local msg=""
    msg=$(jq -r '[.errors[]?.msg] | join("; ")' <<<"$body" 2>/dev/null) || msg=""
    printf 'WARN: %s: HTTP %s: %s\n' "$label" "$code" "${msg:-$(cut -c1-200 <<<"$body")}" >&2
    return 1
  fi

  printf '%s' "$body"
}

##
# 収集を打ち切った地点を台帳へ記録する。
#
# **「1 件も取れなかった」と「途中まで取れた／切り捨てた」を同じ出口に混ぜない**。
# 混ぜると、10,000 件を正常に取得できたソースが最終行で「取得不可」と報告され、
# SKILL.md の運用（失敗ソースをレポートへ「取得不可」として残す）が誤った記載を生む。
#
# 引数: <label> <打ち切ったページ> <ここまでに得た件数>
##
record_stop() {
  local label="$1" page="$2" count="$3"
  if [[ "$count" == "0" ]]; then
    printf '%s\n' "$label" >>"$FAILED_LOG"
  else
    printf '%s（%s ページ目以降を取得できず）\n' "$label" "$page" >>"$TRUNCATED_LOG"
  fi
}

##
# 1 エンドポイントを全ページ収集し、共通スキーマの配列を stdout へ出す。
# 途中で失敗しても**取得済みのページは捨てず**、そこまでを返して 0 で終える
# （他ソースも、同一ソースの成功分も巻き込まない）。
#
# 引数: <label> <APIパス> <クエリ> <要素の配列キー> <写像 jq>
##
collect_paged() {
  local label="$1" api_path="$2" query="$3" items_key="$4" filter="$5"
  local page=1 acc="[]"

  while true; do
    local body
    if ! body=$(sonar_get "$label" "${API_BASE}/${api_path}?${query}&ps=${PAGE_SIZE}&p=${page}"); then
      record_stop "$label" "$page" "$(jq 'length' <<<"$acc")"
      printf '%s' "$acc"
      return 0
    fi

    # `.paging.total` は算術評価にそのまま渡すため、整数であることを必ず確かめる。
    # 非数値だと `(( ... ))` が構文エラーになり、`||` で繋いだ停止条件が **両方とも
    # 失われて無限ループ**になる（外部 API を叩き続ける）。空ボディの 200 でも
    # jq は何も出さず exit 0 で返るため、`== "null"` の判定だけでは素通りし、
    # 「課題ゼロの健全なプロジェクト」と見分けがつかなくなる。
    local total
    total=$(jq -r '.paging.total // ""' <<<"$body")
    if ! [[ "$total" =~ ^[0-9]+$ ]]; then
      printf 'WARN: %s: paging.total が整数ではありません (%s)。API の仕様変更か想定外の応答\n' \
        "$label" "${total:-<空>}" >&2
      record_stop "$label" "$page" "$(jq 'length' <<<"$acc")"
      printf '%s' "$acc"
      return 0
    fi

    local mapped
    if ! mapped=$(jq -c --arg prefix "${PROJECT_KEY}:" --arg key "$PROJECT_KEY" \
      "[.${items_key}[] | ${filter}]" <<<"$body" 2>"$STDERR_CAPTURE"); then
      printf 'WARN: %s: 応答の写像に失敗しました: %s\n' \
        "$label" "$(tr '\n' ' ' <"$STDERR_CAPTURE" | cut -c1-300)" >&2
      record_stop "$label" "$page" "$(jq 'length' <<<"$acc")"
      printf '%s' "$acc"
      return 0
    fi
    acc=$(jq -c -s 'add' <<<"$acc
$mapped")

    # 上限超過は 1 度だけ知らせる（ページごとに出すと本当の失敗が埋もれる）。
    # 取得自体は成功しているので「取得不可」ではなく「切り捨て」として記録する。
    if (( page == 1 && total > MAX_RESULTS )); then
      printf 'WARN: %s: 全 %s 件のうち先頭 %s 件までしか取得できません（SonarCloud API の上限）。条件で絞り込んでください\n' \
        "$label" "$total" "$MAX_RESULTS" >&2
      printf '%s（先頭 %s 件のみ）\n' "$label" "$MAX_RESULTS" >>"$TRUNCATED_LOG"
    fi

    # 上限を超えるページは API がエラーを返すので、要求する前に止める。
    if (( page * PAGE_SIZE >= total || page * PAGE_SIZE >= MAX_RESULTS )); then
      break
    fi
    page=$((page + 1))
  done

  printf '%s' "$acc"
}

ISSUE_FILTER='{
  source: "sonarcloud",
  id: .key,
  severity: (.severity | ascii_downcase),
  title: .message,
  file: (.component | ltrimstr($prefix)),
  line: (.line // 0),
  rule: .rule,
  url: ("https://sonarcloud.io/project/issues?id=" + $key + "&issues=" + .key + "&open=" + .key)
}'

HOTSPOT_FILTER='{
  source: "sonarcloud-hotspot",
  id: .key,
  severity: (.vulnerabilityProbability | ascii_downcase),
  category: .securityCategory,
  title: .message,
  file: (.component | ltrimstr($prefix)),
  line: (.line // 0),
  rule: .ruleKey,
  url: ("https://sonarcloud.io/project/security_hotspots?id=" + $key + "&hotspots=" + .key)
}'

# Security Hotspot は Issues とは別エンティティで、api/issues/search には含まれない。
# 片方だけ集めると取りこぼすため、常に両方を集める。
issues=$(collect_paged "SonarCloud Issues" "issues/search" \
  "componentKeys=${PROJECT_KEY}&statuses=OPEN,CONFIRMED" "issues" "$ISSUE_FILTER")
printf 'INFO: SonarCloud Issues: %s 件\n' "$(jq 'length' <<<"$issues")" >&2

hotspots=$(collect_paged "Security Hotspots" "hotspots/search" \
  "projectKey=${PROJECT_KEY}&status=TO_REVIEW" "hotspots" "$HOTSPOT_FILTER")
printf 'INFO: Security Hotspots: %s 件\n' "$(jq 'length' <<<"$hotspots")" >&2

merged=$(jq -c -s 'add' <<<"$issues
$hotspots")

if [[ -s "$FAILED_LOG" ]]; then
  printf 'WARN: 取得できなかったソース: %s（レポートの収集結果に「取得不可」として残すこと）\n' \
    "$(sort -u "$FAILED_LOG" | paste -sd', ' -)" >&2
fi
if [[ -s "$TRUNCATED_LOG" ]]; then
  printf 'WARN: 一部しか取得できなかったソース: %s（件数を「全件」として扱わないこと）\n' \
    "$(sort -u "$TRUNCATED_LOG" | paste -sd', ' -)" >&2
fi

# 成果ゼロかつ失敗ありは、0 件（正常）と区別して異常終了にする。
if [[ -s "$FAILED_LOG" && "$(jq 'length' <<<"$merged")" == "0" ]]; then
  echo "ERROR: SonarCloud から 1 件も収集できませんでした。" >&2
  exit 1
fi

jq . <<<"$merged"
