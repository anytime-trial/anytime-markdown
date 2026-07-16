#!/bin/bash
# GitHub Issues / Security Alerts / Dependabot Alerts / Code Scanning Alerts 取得
# Usage: bash fetch-github-issues.sh <owner/repo>
# Output: JSON array to stdout

set -euo pipefail

REPO="${1:?Usage: fetch-github-issues.sh <owner/repo>}"

results="[]"

# 1. GitHub Issues (open)
issues=$(gh issue list --repo "$REPO" --state open --json number,title,labels,url --jq '
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
  }]' 2>/dev/null || echo "[]")
results=$(echo "$results" "$issues" | jq -s '.[0] + .[1]')

# 2. Dependabot Alerts (open)
dependabot=$(gh api "/repos/$REPO/dependabot/alerts?state=open" --jq '
  [.[] | {
    source: "dependabot",
    id: (.number | tostring),
    severity: .security_vulnerability.severity,
    title: .security_advisory.summary,
    file: .dependency.manifest_path,
    line: 0,
    rule: (.security_advisory.cve_id // .security_advisory.ghsa_id),
    url: .html_url
  }]' 2>/dev/null || echo "[]")
results=$(echo "$results" "$dependabot" | jq -s '.[0] + .[1]')

# 3. Security Advisories
advisories=$(gh api "/repos/$REPO/security-advisories" --jq '
  [.[] | select(.state == "published") | {
    source: "security-alert",
    id: (.ghsa_id // ""),
    severity: .severity,
    title: .summary,
    file: "",
    line: 0,
    rule: (.cve_id // .ghsa_id // ""),
    url: .html_url
  }]' 2>/dev/null || echo "[]")
results=$(echo "$results" "$advisories" | jq -s '.[0] + .[1]')

# 4. Code Scanning Alerts (CodeQL etc.)
codescan=$(gh api "/repos/$REPO/code-scanning/alerts?state=open&per_page=100" --jq '
  [.[] | {
    source: "code-scanning",
    id: (.number | tostring),
    severity: (.rule.security_severity_level // .rule.severity // "medium"),
    title: .rule.description,
    file: .most_recent_instance.location.path,
    line: (.most_recent_instance.location.start_line // 0),
    rule: .rule.id,
    url: .html_url
  }]' 2>/dev/null || echo "[]")
results=$(echo "$results" "$codescan" | jq -s '.[0] + .[1]')

echo "$results" | jq .
