/**
 * sectionParser.ts coverage tests
 * Targets uncovered branches:
 * - matchSections unmatched right sections (line 84)
 * - section with children but no body (lines 103, 104, 107)
 */
import { parseMarkdownSections, matchSections } from "../utils/sectionParser";

describe("sectionParser coverage", () => {
  it("parses sections with nested headings", () => {
    const md = "# Title\nbody\n## Sub 1\nsub body 1\n## Sub 2\nsub body 2";
    const sections = parseMarkdownSections(md);
    expect(sections.length).toBeGreaterThan(0);
  });

  it("matches sections when right has extra sections", () => {
    const left = parseMarkdownSections("# Section A\nbody A");
    const right = parseMarkdownSections("# Section A\nbody A\n# Section B\nbody B");
    const matches = matchSections(left, right);
    expect(matches.length).toBeGreaterThan(0);
    const rightOnly = matches.filter(m => m.type === "right-only");
    expect(rightOnly.length).toBeGreaterThan(0);
  });

  it("matches sections when left has extra sections", () => {
    const left = parseMarkdownSections("# Section A\nbody A\n# Section B\nbody B");
    const right = parseMarkdownSections("# Section A\nbody A");
    const matches = matchSections(left, right);
    const leftOnly = matches.filter(m => m.type === "left-only");
    expect(leftOnly.length).toBeGreaterThan(0);
  });

  it("handles sections with heading only (no body, no children)", () => {
    const sections = parseMarkdownSections("# Title\n# Another");
    expect(sections.length).toBe(2);
    expect(sections[0].bodyLines.length).toBe(0);
  });

  it("handles section with body and no children", () => {
    const sections = parseMarkdownSections("# Title\nBody line 1\nBody line 2");
    expect(sections[0].bodyLines.length).toBe(2);
  });

  it("handles deeply nested sections", () => {
    const md = "# H1\n## H2\n### H3\nbody 3";
    const sections = parseMarkdownSections(md);
    expect(sections.length).toBeGreaterThan(0);
  });

  it("matches sections with different headings at same level", () => {
    const left = parseMarkdownSections("# A\nbody\n# B\nbody");
    const right = parseMarkdownSections("# A\nbody\n# C\nbody");
    const matches = matchSections(left, right);
    // Should have matched A, and unmatched B (left-only) and C (right-only)
    expect(matches.length).toBeGreaterThan(1);
  });

  it("handles empty input", () => {
    const sections = parseMarkdownSections("");
    expect(sections.length).toBe(0); // empty input returns empty array
  });

  it("handles text without any headings", () => {
    const sections = parseMarkdownSections("Just text\nwithout headings");
    expect(sections.length).toBe(1);
    expect(sections[0].heading).toBeNull();
  });
});
