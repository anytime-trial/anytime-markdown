import { extractDiagramAltText } from "../utils/diagramAltText";

describe("extractDiagramAltText", () => {
  describe("Mermaid flowchart", () => {
    it("extracts node labels from flowchart", () => {
      const code = `flowchart TD
        A[Start] --> B{Condition}
        B -->|Yes| C[Process A]
        B -->|No| D[Process B]
        C --> E[End]`;
      expect(extractDiagramAltText(code, "mermaid")).toBe(
        "Flowchart: Start, Condition, Process A, Process B, End"
      );
    });

    it("extracts node labels from graph LR", () => {
      const code = `graph LR
        A[Login] --> B[Dashboard]
        B --> C[Settings]`;
      expect(extractDiagramAltText(code, "mermaid")).toBe(
        "Flowchart: Login, Dashboard, Settings"
      );
    });

    it("limits to 5 elements and shows count", () => {
      const code = `flowchart TD
        A[One] --> B[Two]
        B --> C[Three]
        C --> D[Four]
        D --> E[Five]
        E --> F[Six]
        F --> G[Seven]`;
      expect(extractDiagramAltText(code, "mermaid")).toBe(
        "Flowchart: One, Two, Three, Four, Five ...and 2 more"
      );
    });

    it("falls back to node IDs when no labels", () => {
      const code = `flowchart TD
        A --> B
        B --> C`;
      expect(extractDiagramAltText(code, "mermaid")).toBe(
        "Flowchart: A, B, C"
      );
    });
  });

  describe("Mermaid sequence", () => {
    it("extracts participant names", () => {
      const code = `sequenceDiagram
        participant Alice
        participant Bob
        Alice->>Bob: Hello`;
      expect(extractDiagramAltText(code, "mermaid")).toBe(
        "Sequence diagram: Alice, Bob"
      );
    });

    it("extracts actor names", () => {
      const code = `sequenceDiagram
        actor User
        participant Server
        User->>Server: Request`;
      expect(extractDiagramAltText(code, "mermaid")).toBe(
        "Sequence diagram: User, Server"
      );
    });
  });

  describe("Mermaid other types", () => {
    it("returns type name for class diagram", () => {
      const code = `classDiagram
        class Animal {
          +String name
        }`;
      expect(extractDiagramAltText(code, "mermaid")).toBe("Class diagram");
    });

    it("returns type name for state diagram", () => {
      const code = `stateDiagram-v2
        [*] --> Active
        Active --> [*]`;
      expect(extractDiagramAltText(code, "mermaid")).toBe("State diagram");
    });

    it("returns type name for gantt chart", () => {
      const code = `gantt
        title A Gantt Chart
        section Section
        A task : a1, 2024-01-01, 30d`;
      expect(extractDiagramAltText(code, "mermaid")).toBe("Gantt chart");
    });
  });

  describe("PlantUML", () => {
    it("extracts actor and participant names", () => {
      const code = `@startuml
        actor User
        participant "Editor" as E
        participant Server
        User -> E: Edit
        E -> Server: Save
      @enduml`;
      expect(extractDiagramAltText(code, "plantuml")).toBe(
        "PlantUML: User, Editor, Server"
      );
    });

    it("extracts entity and database names", () => {
      const code = `@startuml
        entity "User" as u
        database "MySQL" as db
        u -> db: query
      @enduml`;
      expect(extractDiagramAltText(code, "plantuml")).toBe(
        "PlantUML: User, MySQL"
      );
    });

    it("limits to 5 elements", () => {
      const code = `@startuml
        actor A1
        actor A2
        actor A3
        actor A4
        actor A5
        actor A6
      @enduml`;
      expect(extractDiagramAltText(code, "plantuml")).toBe(
        "PlantUML: A1, A2, A3, A4, A5 ...and 1 more"
      );
    });
  });

  describe("Math", () => {
    it("returns formula prefix", () => {
      const code = "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}";
      const result = extractDiagramAltText(code, "math");
      expect(result).toMatch(/^Math: /);
      expect(result.endsWith("...")).toBe(true);
      // "Math: " = 6 chars, so content = 30 chars + "..."
      expect(result.length).toBe(6 + 30 + 3);
    });

    it("returns full formula if short enough", () => {
      const code = "E = mc^2";
      expect(extractDiagramAltText(code, "math")).toBe("Math: E = mc^2");
    });
  });

  describe("HTML", () => {
    it("returns fixed string", () => {
      expect(extractDiagramAltText("<div>Hello</div>", "html")).toBe(
        "HTML block"
      );
    });
  });

  describe("Mermaid flowchart - bare IDs fallback", () => {
    it("uses bare IDs when no labels and no arrows", () => {
      // nodeIds from extractFlowchartLabelsAndIds but no labels and no arrows
      const code = "flowchart TD\n  A";
      const result = extractDiagramAltText(code, "mermaid");
      expect(result).toBe("Flowchart");
    });

    it("falls back to bare arrow IDs without brackets", () => {
      const code = "flowchart TD\n  Start --> End --> Final";
      const result = extractDiagramAltText(code, "mermaid");
      expect(result).toContain("Start");
      expect(result).toContain("End");
      expect(result).toContain("Final");
    });
  });

  describe("Mermaid other types continued", () => {
    it("returns Pie chart label", () => {
      const code = `pie
        title Pets
        "Dogs" : 386
        "Cats" : 85`;
      expect(extractDiagramAltText(code, "mermaid")).toBe("Pie chart");
    });

    it("returns ER diagram label", () => {
      const code = `erDiagram
        CUSTOMER ||--o{ ORDER : places`;
      expect(extractDiagramAltText(code, "mermaid")).toBe("ER diagram");
    });

    it("returns Mindmap label", () => {
      const code = `mindmap
        root((mindmap))
          Origins
          Research`;
      expect(extractDiagramAltText(code, "mermaid")).toBe("Mindmap");
    });

    it("returns generic Diagram for unknown type", () => {
      const code = "unknownDiagram\n  stuff";
      expect(extractDiagramAltText(code, "mermaid")).toBe("Diagram");
    });
  });

  describe("PlantUML edge cases", () => {
    it("returns just PlantUML when no participants found", () => {
      const code = "@startuml\n  A -> B\n@enduml";
      expect(extractDiagramAltText(code, "plantuml")).toBe("PlantUML");
    });

    it("handles collections keyword", () => {
      const code = "@startuml\ncollections MyCollection\n@enduml";
      expect(extractDiagramAltText(code, "plantuml")).toBe("PlantUML: MyCollection");
    });
  });

  describe("edge cases", () => {
    it("handles empty code", () => {
      expect(extractDiagramAltText("", "mermaid")).toBe("Diagram");
    });

    it("handles whitespace-only code", () => {
      expect(extractDiagramAltText("   ", "mermaid")).toBe("Diagram");
    });

    it("truncates long input for ReDoS protection", () => {
      const longCode = "flowchart TD\n" + "A[Node] --> B[Node]\n".repeat(100);
      const result = extractDiagramAltText(longCode, "mermaid");
      expect(result.startsWith("Flowchart:")).toBe(true);
    });
  });
});
