import { createHash } from 'node:crypto';
import { parseFrontmatter } from '../../../src/ingest/spec/parseFrontmatter';

function sha1(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

describe('parseFrontmatter', () => {
  test('returns ParsedSpec for valid spec doc', () => {
    const content = `---
type: spec
title: My Spec Document
date: 2026-05-09
---

# Body text here
`;
    const result = parseFrontmatter({ rel_path: 'spec/my-spec.md', content });
    expect(result).not.toBeNull();
    expect(result!.rel_path).toBe('spec/my-spec.md');
    expect(result!.frontmatter.type).toBe('spec');
    expect(result!.frontmatter.title).toBe('My Spec Document');
    expect(result!.frontmatter.date).toBe('2026-05-09');
    expect(result!.source_hash).toBe(sha1(content));
    expect(result!.source_hash).toMatch(/^[0-9a-f]{40}$/);
  });

  test('returns null for type not in enum', () => {
    const content = `---
type: unknown
title: My Document
date: 2026-05-09
---
`;
    const result = parseFrontmatter({ rel_path: 'doc.md', content });
    expect(result).toBeNull();
  });

  test('returns null when no frontmatter delimiters', () => {
    const content = `# Just a heading

No frontmatter here.
`;
    const result = parseFrontmatter({ rel_path: 'doc.md', content });
    expect(result).toBeNull();
  });

  test('returns null when title is missing', () => {
    const content = `---
type: spec
date: 2026-05-09
---
`;
    const result = parseFrontmatter({ rel_path: 'doc.md', content });
    expect(result).toBeNull();
  });

  test('returns null when date is missing', () => {
    const content = `---
type: spec
title: My Document
---
`;
    const result = parseFrontmatter({ rel_path: 'doc.md', content });
    expect(result).toBeNull();
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
    expect(result).not.toBeNull();
    expect(result!.frontmatter.c4Scope).toEqual(['pkg_memory-core', 'pkg_trail-core']);
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
    expect(result).not.toBeNull();
    expect(result!.frontmatter.updated).toBe('2026-05-10');
    expect(result!.frontmatter.lang).toBe('ja');
    expect(result!.frontmatter.excerpt).toBe('A brief summary');
    expect(result!.frontmatter.author).toBe('Claude Code v3.0');
    expect(result!.frontmatter.category).toBe('Architecture');
  });
});
