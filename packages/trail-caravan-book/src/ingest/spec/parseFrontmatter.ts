import matter from 'gray-matter';
import { createHash } from 'node:crypto';
import { z } from 'zod';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedSpec {
  rel_path: string;
  frontmatter: {
    type:
      | 'spec'
      | 'tech'
      | 'plan'
      | 'manual'
      | 'proposal'
      | 'review'
      | 'report'
      | 'test'
      | 'reference';
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

export type ParseFrontmatterOutcome =
  | { ok: true; data: ParsedSpec }
  // No --- block present — legacy file, soft skip (not a data quality issue)
  | { ok: false; reason: 'missing'; detail: string }
  // Has --- block but zod validation failed — data quality issue, hard error
  | { ok: false; reason: 'invalid'; detail: string };

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
  type: z.enum([
    'spec',
    'tech',
    'plan',
    'manual',
    'proposal',
    'review',
    'report',
    'test',
    'reference',
  ]),
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
 *
 * Returns a discriminated union:
 *   { ok: true, data }   — valid frontmatter, ready to ingest
 *   { ok: false, reason: 'missing' } — no --- block (legacy file, soft skip)
 *   { ok: false, reason: 'invalid' } — has --- block but zod validation failed
 *
 * source_hash is sha1 of the full file content (hex).
 */
export function parseFrontmatter(input: {
  rel_path: string;
  content: string;
}): ParseFrontmatterOutcome {
  const { rel_path, content } = input;

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // gray-matter parse error: treat as invalid since we can't tell if a block was present
    return { ok: false, reason: 'invalid', detail: `gray-matter parse error: ${detail}` };
  }

  // gray-matter.data is empty ({}) when no frontmatter block is present.
  // We use data emptiness rather than parsed.matter === '' because gray-matter
  // has a caching behavior where repeated calls with the same content return
  // matter='undefined' (non-empty string) instead of '' — data is always reliable.
  if (Object.keys(parsed.data).length === 0) {
    return {
      ok: false,
      reason: 'missing',
      detail: `no frontmatter block in ${rel_path}`,
    };
  }

  // A frontmatter block that carries only non-spec metadata (e.g. typed-note
  // `related:` links) without any of the spec-identifying keys (type/title/date)
  // is not meant to be ingested as a spec record. Treat it as a soft skip
  // (`missing`) rather than a hard `invalid`, so it does not count toward the
  // quarantine threshold. A block with at least one spec key but invalid/incomplete
  // values still falls through to zod validation and is reported as `invalid`.
  const hasSpecKey =
    'type' in parsed.data || 'title' in parsed.data || 'date' in parsed.data;
  if (!hasSpecKey) {
    return {
      ok: false,
      reason: 'missing',
      detail: `frontmatter has no spec keys (type/title/date) in ${rel_path}`,
    };
  }

  const validated = FrontmatterSchema.safeParse(parsed.data);
  if (!validated.success) {
    const detail = validated.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return { ok: false, reason: 'invalid', detail };
  }

  const source_hash = createHash('sha1').update(content).digest('hex');

  return {
    ok: true,
    data: {
      rel_path,
      frontmatter: validated.data,
      body: parsed.content,
      source_hash,
    },
  };
}
