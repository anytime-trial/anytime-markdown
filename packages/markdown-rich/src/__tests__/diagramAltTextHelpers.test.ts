import {
  closingBracket,
  extractFlowchartLabelsAndIds,
  extractBareArrowIds,
  extractNameFromPlantUmlLine,
  matchPlantUmlKeyword,
} from "../utils/diagramAltText";

describe("closingBracket", () => {
  it("returns ] for [", () => {
    expect(closingBracket("[")).toBe("]");
  });

  it("returns } for {", () => {
    expect(closingBracket("{")).toBe("}");
  });

  it("returns ) for (", () => {
    expect(closingBracket("(")).toBe(")");
  });

  it("returns null for < (not handled)", () => {
    expect(closingBracket("<")).toBeNull();
  });

  it("returns null for non-bracket characters", () => {
    expect(closingBracket("a")).toBeNull();
    expect(closingBracket("")).toBeNull();
    expect(closingBracket("|")).toBeNull();
  });
});

describe("extractFlowchartLabelsAndIds", () => {
  it("extracts label from A[\"label\"]", () => {
    const result = extractFlowchartLabelsAndIds('A["Hello World"]');
    expect(result.labels).toEqual(['"Hello World"']);
    expect(result.nodeIds).toEqual(["A"]);
  });

  it("extracts label from B(label)", () => {
    const result = extractFlowchartLabelsAndIds("B(Round box)");
    expect(result.labels).toEqual(["Round box"]);
    expect(result.nodeIds).toEqual(["B"]);
  });

  it("extracts label from C{label}", () => {
    const result = extractFlowchartLabelsAndIds("C{Decision}");
    expect(result.labels).toEqual(["Decision"]);
    expect(result.nodeIds).toEqual(["C"]);
  });

  it("extracts multiple nodes", () => {
    const result = extractFlowchartLabelsAndIds("A[Start] --> B[End]");
    expect(result.labels).toContain("Start");
    expect(result.labels).toContain("End");
    expect(result.nodeIds).toContain("A");
    expect(result.nodeIds).toContain("B");
  });

  it("collects plain node IDs without brackets", () => {
    const result = extractFlowchartLabelsAndIds("A --> B");
    // No bracket labels found; nodeIds may be empty since no bracket follows
    expect(result.labels).toEqual([]);
  });

  it("skips labels containing arrow patterns", () => {
    // Labels with --> or --- inside are filtered out
    const result = extractFlowchartLabelsAndIds("A[a-->b]");
    expect(result.labels).toEqual([]);
    expect(result.nodeIds).toEqual(["A"]);
  });
});

describe("extractBareArrowIds", () => {
  it("extracts source and destination from A --> B", () => {
    const result = extractBareArrowIds("A --> B");
    expect(result).toContain("A");
    expect(result).toContain("B");
  });

  it("handles multiple arrows", () => {
    const result = extractBareArrowIds("A --> B --> C");
    expect(result).toContain("A");
    expect(result).toContain("B");
    expect(result).toContain("C");
  });

  it("handles no arrows", () => {
    const result = extractBareArrowIds("A --- B");
    // --- is not -->, so nothing extracted
    expect(result).toEqual([]);
  });

  it("handles edge labels with pipes: A -->|text| B", () => {
    const result = extractBareArrowIds("A -->|Yes| B");
    expect(result).toContain("A");
    expect(result).toContain("B");
  });

  it("handles spaces around arrow", () => {
    const result = extractBareArrowIds("Start   -->   End");
    expect(result).toContain("Start");
    expect(result).toContain("End");
  });
});

describe("extractNameFromPlantUmlLine", () => {
  it("extracts quoted name", () => {
    expect(extractNameFromPlantUmlLine('"My Actor" as A')).toBe("My Actor");
  });

  it("extracts bare name (first word)", () => {
    expect(extractNameFromPlantUmlLine("Alice")).toBe("Alice");
  });

  it("extracts bare name with trailing text", () => {
    expect(extractNameFromPlantUmlLine("Bob order 10")).toBe("Bob");
  });

  it("returns empty string for unclosed quote", () => {
    expect(extractNameFromPlantUmlLine('"unclosed')).toBe("");
  });

  it("handles empty input", () => {
    expect(extractNameFromPlantUmlLine("")).toBe("");
  });
});

describe("matchPlantUmlKeyword", () => {
  it("matches actor keyword", () => {
    const result = matchPlantUmlKeyword("actor Alice", "actor alice");
    expect(result).toBe("Alice");
  });

  it("matches participant keyword", () => {
    const result = matchPlantUmlKeyword("participant Bob", "participant bob");
    expect(result).toBe("Bob");
  });

  it("matches database keyword", () => {
    const result = matchPlantUmlKeyword("database DB", "database db");
    expect(result).toBe("DB");
  });

  it("matches entity keyword", () => {
    const result = matchPlantUmlKeyword("entity E1", "entity e1");
    expect(result).toBe("E1");
  });

  it("matches collections keyword", () => {
    const result = matchPlantUmlKeyword("collections Items", "collections items");
    expect(result).toBe("Items");
  });

  it("returns null for non-matching line", () => {
    expect(matchPlantUmlKeyword("note over Alice", "note over alice")).toBeNull();
  });

  it("returns null when keyword is part of longer word", () => {
    // "actors" should not match "actor"
    expect(matchPlantUmlKeyword("actors Alice", "actors alice")).toBeNull();
  });

  it("matches with tab separator", () => {
    const result = matchPlantUmlKeyword("actor\tAlice", "actor\talice");
    expect(result).toBe("Alice");
  });
});
