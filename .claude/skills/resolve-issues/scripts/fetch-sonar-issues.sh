#!/bin/bash
# SonarCloud Issues 取得
# Usage: bash fetch-sonar-issues.sh [project-key]
# Output: JSON array to stdout
# project-key 省略時は sonar-project.properties から取得

set -euo pipefail

PROJECT_KEY="${1:-}"

# sonar-project.properties から自動取得
if [[ -z "$PROJECT_KEY" ]]; then
  PROPS_FILE="sonar-project.properties"
  dir="$(pwd)"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/$PROPS_FILE" ]]; then
      PROJECT_KEY=$(grep '^sonar.projectKey=' "$dir/$PROPS_FILE" | cut -d= -f2)
      break
    fi
    dir=$(dirname "$dir")
  done
fi

if [[ -z "$PROJECT_KEY" ]]; then
  echo "ERROR: project key not found. Provide as argument or place sonar-project.properties in project root." >&2
  exit 1
fi

API_URL="https://sonarcloud.io/api/issues/search"
PAGE=1
PAGE_SIZE=100
all_issues="[]"

while true; do
  response=$(curl -s "${API_URL}?componentKeys=${PROJECT_KEY}&statuses=OPEN,CONFIRMED&ps=${PAGE_SIZE}&p=${PAGE}")
  total=$(echo "$response" | jq '.paging.total')

  if [[ -z "$total" || "$total" == "null" ]]; then
    echo "ERROR: failed to fetch issues from SonarCloud API." >&2
    exit 1
  fi

  page_issues=$(echo "$response" | jq --arg prefix "${PROJECT_KEY}:" --arg key "${PROJECT_KEY}" '
    [.issues[] | {
      source: "sonarcloud",
      id: .key,
      severity: (.severity | ascii_downcase),
      title: .message,
      file: (.component | ltrimstr($prefix)),
      line: (.line // 0),
      rule: .rule,
      url: ("https://sonarcloud.io/project/issues?id=" + $key + "&issues=" + .key + "&open=" + .key)
    }]')

  all_issues=$(echo "$all_issues" "$page_issues" | jq -s '.[0] + .[1]')

  fetched=$((PAGE * PAGE_SIZE))
  if [[ $fetched -ge $total ]]; then
    break
  fi
  PAGE=$((PAGE + 1))
done

# Security Hotspots は別 API（api/hotspots/search、status=TO_REVIEW）。
# Issues と同じフラット配列に source="sonarcloud-hotspot" で統合する。
HOTSPOT_URL="https://sonarcloud.io/api/hotspots/search"
HS_PAGE=1
all_hotspots="[]"

while true; do
  hs_response=$(curl -s "${HOTSPOT_URL}?projectKey=${PROJECT_KEY}&status=TO_REVIEW&ps=${PAGE_SIZE}&p=${HS_PAGE}")
  hs_total=$(echo "$hs_response" | jq '.paging.total')

  if [[ -z "$hs_total" || "$hs_total" == "null" ]]; then
    echo "ERROR: failed to fetch hotspots from SonarCloud API." >&2
    exit 1
  fi

  [[ "$hs_total" -eq 0 ]] && break

  page_hotspots=$(echo "$hs_response" | jq --arg prefix "${PROJECT_KEY}:" --arg key "${PROJECT_KEY}" '
    [.hotspots[] | {
      source: "sonarcloud-hotspot",
      id: .key,
      severity: (.vulnerabilityProbability | ascii_downcase),
      category: .securityCategory,
      title: .message,
      file: (.component | ltrimstr($prefix)),
      line: (.line // 0),
      rule: .ruleKey,
      url: ("https://sonarcloud.io/project/security_hotspots?id=" + $key + "&hotspots=" + .key)
    }]')

  all_hotspots=$(echo "$all_hotspots" "$page_hotspots" | jq -s '.[0] + .[1]')

  hs_fetched=$((HS_PAGE * PAGE_SIZE))
  if [[ $hs_fetched -ge $hs_total ]]; then
    break
  fi
  HS_PAGE=$((HS_PAGE + 1))
done

# Issues と Hotspots を統合して出力
echo "$all_issues" "$all_hotspots" | jq -s '.[0] + .[1]'
