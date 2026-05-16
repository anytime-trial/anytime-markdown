import { createHash } from 'node:crypto';
import { parseFrontmatter } from '../../../src/ingest/spec/parseFrontmatter';
import type { ParseFrontmatterOutcome } from '../../../src/ingest/spec/parseFrontmatter';

function sha1(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

describe('parseFrontmatter', () => {
  test('returns { ok: true, data: ParsedSpec } for valid spec doc', () => {
    const content = `---
type: spec
title: My Spec Document
date: 2026-05-09
---

# Body text here
`;
    const result = parseFrontmatter({ rel_path: 'spec/my-spec.md', content });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rel_path).toBe('spec/my-spec.md');
    expect(result.data.frontmatter.type).toBe('spec');
    expect(result.data.frontmatter.title).toBe('My Spec Document');
    expect(result.data.frontmatter.date).toBe('2026-05-09');
    expect(result.data.source_hash).toBe(sha1(content));
    expect(result.data.source_hash).toMatch(/^[0-9a-f]{40}$/);
  });

  // Missing frontmatter: no --- block at all — soft skip
  test('returns { ok: false, reason: "missing" } when no frontmatter block', () => {
    const content = `# Just a heading

No frontmatter here.
`;
    const result = parseFrontmatter({ rel_path: 'doc.md', content });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('missing');
    expect(result.detail).toBeTruthy();
  });

  // Invalid frontmatter: has --- block but zod validation fails — hard error
  test('returns { ok: false, reason: "invalid" } for type not in enum', () => {
    const content = `---
type: unknown
title: My Document
date: 2026-05-09
---
`;
    const result = parseFrontmatter({ rel_path: 'doc.md', content });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid');
    expect(result.detail).toBeTruthy();
  });

  test('returns { ok: false, reason: "invalid" } when title is missing', () => {
    const content = `---
type: spec
date: 2026-05-09
---
`;
    const result = parseFrontmatter({ rel_path: 'doc.md', content });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid');
  });

  test('returns { ok: false, reason: "invalid" } when date is missing', () => {
    const content = `---
type: spec
title: My Document
---
`;
    const result = parseFrontmatter({ rel_path: 'doc.md', content });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid');
  });

  test('includes c4Scope when present', () => {
    const content = `---
type: spec
title: Architecture Doc
date: 2026-05-09
c4Scope:
  - pkg_memory-core
  - pkg_trail-core
---
`;
    const result = parseFrontmatter({ rel_path: 'spec/arch.md', content });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.frontmatter.c4Scope).toEqual(['pkg_memory-core', 'pkg_trail-core']);
  });

  test('all optional fields are included when present', () => {
    const content = `---
type: tech
title: Tech Article
date: 2026-05-09
updated: 2026-05-10
lang: ja
excerpt: A brief summary
author: Claude Code v3.0
category: Architecture
---

Body
`;
    const result = parseFrontmatter({ rel_path: 'tech/article.md', content });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.frontmatter.updated).toBe('2026-05-10');
    expect(result.data.frontmatter.lang).toBe('ja');
    expect(result.data.frontmatter.excerpt).toBe('A brief summary');
    expect(result.data.frontmatter.author).toBe('Claude Code v3.0');
    expect(result.data.frontmatter.category).toBe('Architecture');
  });

  // Type-level check: ParseFrontmatterOutcome is the exported type
  test('ParseFrontmatterOutcome type is exported', () => {
    const outcome: ParseFrontmatterOutcome = parseFrontmatter({
      rel_path: 'x.md',
      content: '# no fm',
    });
    expect(outcome).toBeDefined();
  });
});
