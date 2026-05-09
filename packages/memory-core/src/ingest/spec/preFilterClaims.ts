// ── Types ─────────────────────────────────────────────────────────────────────

export interface FilteredParagraph {
  text: string;
  line_start: number;
  modality_hint: 'mandatory' | 'forbidden' | 'recommended' | 'unknown';
}

export interface PreFilterResult {
  paragraphs: FilteredParagraph[];
}

// ── Modality patterns (strongest first) ──────────────────────────────────────

const FORBIDDEN_PATTERN =
  /\b(must not|shall not|MUST NOT)\b|禁止|してはならない|\bNG\b/;

// 'すること' is mandatory only when followed by punctuation or end of string
// to avoid matching 'することを推奨' (recommended context)
const MANDATORY_PATTERN =
  /\b(must|shall|MUST|SHALL|required)\b|必須|しなければならない|すること[。\s]|すること$/;

const RECOMMENDED_PATTERN =
  /\b(should|SHOULD|recommended)\b|推奨|望ましい/;

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Split body into paragraphs and filter to those containing modality keywords.
 * Paragraphs containing only 'unknown' modality are excluded.
 */
export function preFilterClaims(body: string): PreFilterResult {
  if (!body) {
    return { paragraphs: [] };
  }

  const paragraphs: FilteredParagraph[] = [];
  let lineOffset = 0;
  const rawParagraphs = body.split(/\n\n+/);

  for (const text of rawParagraphs) {
    const line_start = lineOffset;
    // Advance offset: count newlines in this paragraph + 2 for the separator blank line
    const linesInParagraph = (text.match(/\n/g) ?? []).length + 1;
    lineOffset += linesInParagraph + 1; // +1 for the blank line between paragraphs

    const modality_hint = detectModality(text);
    if (modality_hint !== 'unknown') {
      paragraphs.push({ text, line_start, modality_hint });
    }
  }

  return { paragraphs };
}

function detectModality(
  text: string,
): 'mandatory' | 'forbidden' | 'recommended' | 'unknown' {
  // Order matters: strongest constraint wins
  if (FORBIDDEN_PATTERN.test(text)) return 'forbidden';
  if (MANDATORY_PATTERN.test(text)) return 'mandatory';
  if (RECOMMENDED_PATTERN.test(text)) return 'recommended';
  return 'unknown';
}
