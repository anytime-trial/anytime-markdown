/**
 * Canonicalizes a string for entity matching.
 * Steps: NFKC normalize → trim → lowercase → collapse whitespace.
 */
export function canonicalize(input: string): string {
  return input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
