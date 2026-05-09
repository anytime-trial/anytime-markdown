import matter from 'gray-matter';
import { createHash } from 'node:crypto';
import { z } from 'zod';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedSpec {
  rel_path: string;
  frontmatter: {
    type: 'spec' | 'tech' | 'plan' | 'manual' | 'proposal' | 'review' | 'report' | 'test';
    title: string;
    date: string;
    updated?: string;
    lang?: string;
    c4Scope?: string[];
    excerpt?: string;
    author?: string;
    category?: string;
  };
  body: string;
  source_hash: string;
}

// ── Zod schema ────────────────────────────────────────────────────────────────

/**
 * gray-matter parses YAML dates as JavaScript Date objects automatically.
 * We coerce Date → ISO string so that zod z.string() validation passes.
 */
const dateOrString = z
  .union([z.date(), z.string().min(1)])
  .transform((val): string => {
    if (val instanceof Date) {
      return val.toISOString().slice(0, 10); // → "YYYY-MM-DD"
    }
    return val;
  });

const FrontmatterSchema = z.object({
  type: z.enum(['spec', 'tech', 'plan', 'manual', 'proposal', 'review', 'report', 'test']),
  title: z.string().min(1),
  date: dateOrString,
  updated: dateOrString.optional(),
  lang: z.string().optional(),
  c4Scope: z.array(z.string()).optional(),
  excerpt: z.string().optional(),
  author: z.string().optional(),
  category: z.string().optional(),
});

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a Markdown file content and validate with zod.
 * Returns null on any failure (gray-matter parse error, zod validation failure).
 * source_hash is sha1 of the full file content (hex).
 */
export function parseFrontmatter(input: {
  rel_path: string;
  content: string;
}): ParsedSpec | null {
  const { rel_path, content } = input;

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content);
  } catch {
    return null;
  }

  const validated = FrontmatterSchema.safeParse(parsed.data);
  if (!validated.success) {
    return null;
  }

  const source_hash = createHash('sha1').update(content).digest('hex');

  return {
    rel_path,
    frontmatter: validated.data,
    body: parsed.content,
    source_hash,
  };
}
