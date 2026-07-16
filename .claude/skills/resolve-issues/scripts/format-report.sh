#!/bin/bash
# Issue 解決レポート生成
# Usage: bash format-report.sh <resolved.json> <unresolved.json> <skipped.json> [pr-url]
# Output: Markdown to stdout

set -euo pipefail

RESOLVED="${1:?Usage: format-report.sh <resolved.json> <unresolved.json> <skipped.json> [pr-url]}"
UNRESOLVED="${2:?}"
SKIPPED="${3:?}"
PR_URL="${4:-}"
DATE=$(date +%Y-%m-%d)

resolved_count=$(jq 'length' "$RESOLVED")
unresolved_count=$(jq 'length' "$UNRESOLVED")
skipped_count=$(jq 'length' "$SKIPPED")
total=$((resolved_count + unresolved_count + skipped_count))

count_by_source() {
  local file="$1"
  local source="$2"
  jq --arg s "$source" '[.[] | select(.source == $s)] | length' "$file"
}

gh_count=0; sec_count=0; dep_count=0; snyk_count=0; sq_count=0
for f in "$RESOLVED" "$UNRESOLVED" "$SKIPPED"; do
  gh_count=$((gh_count + $(count_by_source "$f" "github-issue")))
  sec_count=$((sec_count + $(count_by_source "$f" "security-alert")))
  dep_count=$((dep_count + $(count_by_source "$f" "dependabot")))
  snyk_count=$((snyk_count + $(count_by_source "$f" "snyk")))
  sq_count=$((sq_count + $(count_by_source "$f" "sonarcloud")))
done

# frontmatter は web-app packages/web-app/src/types/report.ts の reportFrontmatterSchema と
# 同期を保つ（title/date は必須。欠けると /report 一覧から silent に除外される）
cat <<HEADER
---
title: "Issue 解決レポート — $DATE"
date: "$DATE"
author: "Claude Code"
category: "resolve-issues"
excerpt: "課題 ${total} 件の解決レポート（解決 ${resolved_count} / 未解決 ${unresolved_count} / スキップ ${skipped_count}）。"
lang: ja
---

# Issue 解決レポート — $DATE


## サマリー

- 対象: ${total} 件（GitHub Issues: ${gh_count}, Security: ${sec_count}, Dependabot: ${dep_count}, Snyk: ${snyk_count}, SonarCloud: ${sq_count}）
- 解決: ${resolved_count} 件
- 未解決: ${unresolved_count} 件
- スキップ: ${skipped_count} 件


## 解決済み

| ソース | ID / ルール | 重要度 | ファイル | 対応内容 | コミット |
| --- | --- | --- | --- | --- | --- |
HEADER

jq -r '.[] | "| \(.source) | \(.rule) | \(.severity) | \(.file) | \(.title) | \(.commit // "-") |"' "$RESOLVED"

cat <<MIDDLE


## 未解決

| ソース | ID / ルール | 重要度 | ファイル | 未解決理由 |
| --- | --- | --- | --- | --- |
MIDDLE

jq -r '.[] | "| \(.source) | \(.rule) | \(.severity) | \(.file) | \(.reason // "-") |"' "$UNRESOLVED"

cat <<SKIP


## スキップ

| ソース | ID / ルール | 理由 |
| --- | --- | --- |
SKIP

jq -r '.[] | "| \(.source) | \(.rule) | \(.reason // "-") |"' "$SKIPPED"

if [[ -n "$PR_URL" ]]; then
  cat <<PR


## PR

- URL: $PR_URL
PR
fi

cat <<HANDOVER


## 次回への引き継ぎ

### 未解決 issue（継続対応）

| ソース | ID / ルール | ファイル | 状況 | 備考 |
| --- | --- | --- | --- | --- |
HANDOVER

jq -r '.[] | "| \(.source) | \(.rule) | \(.file) | \(.reason // "-") | |"' "$UNRESOLVED"

cat <<TAIL

### 保留事項

### 新たに発見した課題
TAIL
