/**
 * diagramAltText.ts coverage tests
 * Targets 11 uncovered branches:
 * - tryExtractBracketedLabel invalid labels (line 68)
 * - extractFlowchartLabelsAndIds node without bracket (line 98)
 * - skipPipeLabel (line 105)
 * - extractDestId empty (line 113)
 * - extractBareArrowIds with pipe label (line 122, 127)
 * - extractMermaidSequenceNames (line 147, 149)
 * - extractNameFromPlantUmlLine with "as" (line 164)
 * - extractPlantUmlNames (line 185)
 * - TYPE_LABELS fallback (line 218)
 */
import {
  extractDiagramAltText,
  closingBracket,
  extractFlowchartLabelsAndIds,
  extractBareArrowIds,
  extractNameFromPlantUmlLine,
  matchPlantUmlKeyword,
} from "../utils/diagramAltText";

jest.mock("../hooks/useMermaidRender", () => ({
  detectMermaidType: (code: string) => {
    const lower = code.toLowerCase();
    if (lower.includes("graph") || lower.includes("flowchart")) return "diagramFlowchart";
    if (lower.includes("sequencediagram") || lower.includes("sequence")) return "diagramSequence";
    if (lower.includes("classDiagram") || lower.includes("class")) return "diagramClass";
    if (lower.includes("gantt")) return "diagramGantt";
    return "diagramGeneric";
  },
}));

describe("diagramAltText coverage", () => {
  describe("closingBracket", () => {
    it("returns ] for [", () => expect(closingBracket("[")).toBe("]"));
    it("returns } for {", () => expect(closingBracket("{")).toBe("}"));
    it("returns ) for (", () => expect(closingBracket("(")).toBe(")"));
    it("returns null for other", () => expect(closingBracket("x")).toBeNull());
  });

  describe("extractFlowchartLabelsAndIds", () => {
    it("extracts labels from bracketed nodes", () => {
      const result = extractFlowchartLabelsAndIds("A[Hello] --> B[World]");
      expect(result.labels).toContain("Hello");
      expect(result.labels).toContain("World");
    });

    it("handles node without bracket label", () => {
      const result = extractFlowchartLabelsAndIds("A --> B");
      expect(result.labels).toEqual([]);
      expect(result.nodeIds.length).toBe(0);
    });

    it("handles invalid labels with --> inside brackets", () => {
      const result = extractFlowchartLabelsAndIds("A[-->] --> B");
      // The label containing --> should be treated as empty
      expect(result.labels).toEqual([]);
    });

    it("handles curly bracket labels", () => {
      const result = extractFlowchartLabelsAndIds("A{Decision}");
      expect(result.labels).toContain("Decision");
    });

    it("handles round bracket labels", () => {
      const result = extractFlowchartLabelsAndIds("A(Process)");
      expect(result.labels).toContain("Process");
    });

    it("handles unclosed bracket", () => {
      const result = extractFlowchartLabelsAndIds("A[unclosed");
      expect(result.labels).toEqual([]);
    });
  });

  describe("extractBareArrowIds", () => {
    it("extracts source and destination IDs", () => {
      const result = extractBareArrowIds("A --> B");
      expect(result).toContain("A");
      expect(result).toContain("B");
    });

    it("handles pipe label between arrow nodes", () => {
      const result = extractBareArrowIds("A -->|label| B");
      expect(result).toContain("A");
      expect(result).toContain("B");
    });

    it("handles multiple arrows", () => {
      const result = extractBareArrowIds("A --> B --> C");
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it("handles arrow with no destination", () => {
      const result = extractBareArrowIds("A --> ");
      expect(result).toContain("A");
    });

    it("handles unclosed pipe label", () => {
      const result = extractBareArrowIds("A -->|unclosed B");
      expect(result).toContain("A");
    });
  });

  describe("extractNameFromPlantUmlLine", () => {
    it("extracts quoted name", () => {
      expect(extractNameFromPlantUmlLine('"MyActor" as A')).toBe("MyActor");
    });

    it("returns empty for unclosed quote", () => {
      expect(extractNameFromPlantUmlLine('"unclosed')).toBe("");
    });

    it("extracts name before space", () => {
      expect(extractNameFromPlantUmlLine("Bob")).toBe("Bob");
    });
  });

  describe("matchPlantUmlKeyword", () => {
    it("matches actor", () => {
      expect(matchPlantUmlKeyword("actor Bob", "actor bob")).toBe("Bob");
    });

    it("matches participant", () => {
      expect(matchPlantUmlKeyword("participant Alice", "participant alice")).toBe("Alice");
    });

    it("matches entity", () => {
      expect(matchPlantUmlKeyword("entity Server", "entity server")).toBe("Server");
    });

    it("matches database", () => {
      expect(matchPlantUmlKeyword("database DB", "database db")).toBe("DB");
    });

    it("matches collections", () => {
      expect(matchPlantUmlKeyword("collections Items", "collections items")).toBe("Items");
    });

    it("returns null for non-matching line", () => {
      expect(matchPlantUmlKeyword("note left", "note left")).toBeNull();
    });

    it("returns null when keyword is at end (no space after)", () => {
      expect(matchPlantUmlKeyword("actor", "actor")).toBeNull();
    });

    it("matches keyword with tab separator", () => {
      expect(matchPlantUmlKeyword("actor\tBob", "actor\tbob")).toBe("Bob");
    });
  });

  describe("extractDiagramAltText", () => {
    it("returns 'Diagram' for empty code", () => {
      expect(extractDiagramAltText("", "mermaid")).toBe("Diagram");
      expect(extractDiagramAltText("   ", "mermaid")).toBe("Diagram");
    });

    it("returns 'HTML block' for html language", () => {
      expect(extractDiagramAltText("<div>test</div>", "html")).toBe("HTML block");
    });

    it("returns truncated math for long expressions", () => {
      const longMath = "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} + extra stuff that makes it long";
      const result = extractDiagramAltText(longMath, "math");
      expect(result).toMatch(/^Math: .+\.\.\.$/);
    });

    it("returns full math for short expressions", () => {
      expect(extractDiagramAltText("x + y", "math")).toBe("Math: x + y");
    });

    it("returns PlantUML with names", () => {
      const code = "actor Bob\nparticipant Alice\nBob -> Alice: hello";
      const result = extractDiagramAltText(code, "plantuml");
      expect(result).toContain("PlantUML");
      expect(result).toContain("Bob");
    });

    it("returns PlantUML without names", () => {
      const result = extractDiagramAltText("@startuml\n@enduml", "plantuml");
      expect(result).toBe("PlantUML");
    });

    it("returns flowchart with labels", () => {
      const code = "graph TD\nA[Start] --> B[End]";
      const result = extractDiagramAltText(code, "mermaid");
      expect(result).toContain("Flowchart");
    });

    it("returns flowchart with bare IDs when no labels", () => {
      const code = "graph TD\nA --> B";
      const result = extractDiagramAltText(code, "mermaid");
      expect(result).toContain("Flowchart");
    });

    it("returns sequence diagram with participants", () => {
      const code = "sequenceDiagram\nparticipant Alice\nparticipant Bob";
      const result = extractDiagramAltText(code, "mermaid");
      expect(result).toContain("Sequence diagram");
    });

    it("returns type label for other mermaid types (gantt)", () => {
      const code = "gantt\ntitle A Gantt Chart";
      const result = extractDiagramAltText(code, "mermaid");
      expect(result).toBe("Gantt chart");
    });

    it("returns Diagram for unknown mermaid type", () => {
      const code = "unknownDiagram\nsome content";
      const result = extractDiagramAltText(code, "mermaid");
      expect(result).toBe("Diagram");
    });

    it("handles sequence diagram with actor keyword", () => {
      const code = "sequenceDiagram\nactor User\nactor Admin";
      const result = extractDiagramAltText(code, "mermaid");
      expect(result).toContain("User");
    });

    it("handles flowchart with node IDs only (no arrows, no brackets)", () => {
      const code = "graph TD\nA";
      const result = extractDiagramAltText(code, "mermaid");
      expect(result).toContain("Flowchart");
    });
  });
});
