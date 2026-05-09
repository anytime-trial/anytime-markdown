import { parseReviewDoc } from '../../../src/ingest/review/parseReviewDoc';

// Helper: minimal review frontmatter
function reviewFm(extra = ''): string {
  return `---
title: "テストレビュー"
date: "2026-04-18"
type: "review"
lang: "ja"
author: "Claude Code v2.1.114"
${extra}---\n`;
}

describe('parseReviewDoc', () => {
  // Test 1: targetRefs extraction from body
  test('extracts targetRef from backtick-enclosed path in body', () => {
    const content =
      reviewFm() +
      `\n# テストレビュー\n\nレビュー対象: \`spec/12.design/design.md\`\n\n## 1. カラー\n\n**問題:** 問題あり。\n\n**提案:** 修正案。\n`;
    const result = parseReviewDoc({ rel_path: 'review/test.md', content });
    expect(result).not.toBeNull();
    expect(result!.targetRefs).toContain('spec/12.design/design.md');
    expect(result!.targetRefs).toHaveLength(1);
  });

  // Test 2: chapter '### 1.2 CTA カラーのコントラスト比未検証' → category=a11y, severity=info
  test('infers category=a11y for コントラスト in chapter title, severity=info by default', () => {
    const content =
      reviewFm() +
      `\n# テストレビュー\n\n## 1. カラー\n\n### 1.2 CTA カラーのコントラスト比未検証\n\n**問題:** コントラスト比が不足。\n\n**提案:** 数値を仕様書に明示する。\n`;
    const result = parseReviewDoc({ rel_path: 'review/test.md', content });
    expect(result).not.toBeNull();
    expect(result!.findings).toHaveLength(1);
    const f = result!.findings[0];
    expect(f.category).toBe('a11y');
    expect(f.is_category_inferred).toBe(false);
    expect(f.severity).toBe('info');
    expect(f.chapter_path).toBe('1.2 CTA カラーのコントラスト比未検証');
  });

  // Test 3: same chapter but with > [!IMPORTANT] → severity=warn
  test('infers severity=warn when > [!IMPORTANT] present in chapter body', () => {
    const content =
      reviewFm() +
      `\n# テストレビュー\n\n### 1.2 CTA カラーのコントラスト比未検証\n\n**問題:** コントラスト比が不足。\n\n> [!IMPORTANT]\n> この数値は重要です。\n\n**提案:** 数値を仕様書に明示する。\n`;
    const result = parseReviewDoc({ rel_path: 'review/test.md', content });
    expect(result).not.toBeNull();
    expect(result!.findings).toHaveLength(1);
    expect(result!.findings[0].severity).toBe('warn');
  });

  // Test 4: type: "spec" file → null
  test('returns null for non-review type', () => {
    const content = `---
title: "仕様書"
date: "2026-04-18"
type: "spec"
lang: "ja"
---\n\n# 仕様書\n`;
    const result = parseReviewDoc({ rel_path: 'spec/test.md', content });
    expect(result).toBeNull();
  });

  // Test 5: chapter without **問題:** → 0 findings
  test('produces no findings for chapter without 問題:', () => {
    const content =
      reviewFm() +
      `\n# レビュー\n\n## 1. カラー\n\nここには問題はありません。\nただの説明文。\n`;
    const result = parseReviewDoc({ rel_path: 'review/test.md', content });
    expect(result).not.toBeNull();
    expect(result!.findings).toHaveLength(0);
  });

  // Test 6: chapter title not matching any keyword → category='other', is_category_inferred=true
  test('infers category=other and is_category_inferred=true for unrecognized chapter', () => {
    const content =
      reviewFm() +
      `\n# レビュー\n\n## 1. その他の事項\n\n**問題:** 何か問題がある。\n\n**提案:** 解決策。\n`;
    const result = parseReviewDoc({ rel_path: 'review/test.md', content });
    expect(result).not.toBeNull();
    expect(result!.findings).toHaveLength(1);
    const f = result!.findings[0];
    expect(f.category).toBe('other');
    expect(f.is_category_inferred).toBe(true);
  });

  // Test 7: two chapters each with one 問題: pair → 2 findings, indices 0 and 1
  test('produces 2 findings across two chapters with sequential finding_index', () => {
    const content =
      reviewFm() +
      `\n# レビュー\n\n## 1. カラー\n\n**問題:** カラー問題。\n\n**提案:** カラー解決策。\n\n## 2. 命名規則\n\n**問題:** 命名問題。\n\n**提案:** 命名解決策。\n`;
    const result = parseReviewDoc({ rel_path: 'review/test.md', content });
    expect(result).not.toBeNull();
    expect(result!.findings).toHaveLength(2);
    expect(result!.findings[0].finding_index).toBe(0);
    expect(result!.findings[1].finding_index).toBe(1);
    expect(result!.findings[0].chapter_path).toBe('1. カラー');
    expect(result!.findings[1].chapter_path).toBe('2. 命名規則');
  });

  // Test 8: multiple paths from レビュー対象 (plain and bold) → both in targetRefs
  test('collects paths from both plain and bold レビュー対象 patterns', () => {
    const content =
      reviewFm() +
      `\n# レビュー\n\nレビュー対象: \`path/to/file1.md\`\n\n**レビュー対象**: \`path/to/file2.ts\`\n\n## 1. カラー\n\n**問題:** 問題。\n\n**提案:** 提案。\n`;
    const result = parseReviewDoc({ rel_path: 'review/test.md', content });
    expect(result).not.toBeNull();
    expect(result!.targetRefs).toContain('path/to/file1.md');
    expect(result!.targetRefs).toContain('path/to/file2.ts');
    expect(result!.targetRefs).toHaveLength(2);
  });

  // Additional: severity=error for > [!CAUTION]
  test('infers severity=error when > [!CAUTION] present in chapter body', () => {
    const content =
      reviewFm() +
      `\n# レビュー\n\n## 1. セキュリティ\n\n**問題:** XSS 脆弱性がある。\n\n> [!CAUTION]\n> データが漏洩する可能性があります。\n\n**提案:** サニタイズを追加する。\n`;
    const result = parseReviewDoc({ rel_path: 'review/test.md', content });
    expect(result).not.toBeNull();
    expect(result!.findings).toHaveLength(1);
    expect(result!.findings[0].severity).toBe('error');
    expect(result!.findings[0].category).toBe('security');
  });

  // Additional: finding_text and suggestion_text content
  test('captures finding_text and suggestion_text correctly', () => {
    const content =
      reviewFm() +
      `\n# レビュー\n\n## 1. ロジック\n\n**問題:** Off-by-one エラーがある。\n詳細な説明。\n\n**提案:** インデックスを修正する。\n具体的な修正方法。\n`;
    const result = parseReviewDoc({ rel_path: 'review/test.md', content });
    expect(result).not.toBeNull();
    const f = result!.findings[0];
    expect(f.finding_text).toContain('Off-by-one エラーがある');
    expect(f.finding_text).toContain('詳細な説明');
    expect(f.suggestion_text).toContain('インデックスを修正する');
    expect(f.suggestion_text).toContain('具体的な修正方法');
    expect(f.category).toBe('logic');
  });

  // Additional: frontmatter target_refs merged with body refs
  test('merges frontmatter target_refs with body refs, deduplicating', () => {
    const content =
      reviewFm('target_refs:\n  - "spec/fm-path.md"\n') +
      `\n# レビュー\n\nレビュー対象: \`spec/fm-path.md\`\nレビュー対象: \`spec/body-path.ts\`\n\n## 1. カラー\n\n**問題:** 問題。\n\n**提案:** 提案。\n`;
    const result = parseReviewDoc({ rel_path: 'review/test.md', content });
    expect(result).not.toBeNull();
    // 'spec/fm-path.md' appears in both fm and body → deduplicated to 1
    const refs = result!.targetRefs;
    expect(refs.filter((r) => r === 'spec/fm-path.md')).toHaveLength(1);
    expect(refs).toContain('spec/body-path.ts');
  });
});
