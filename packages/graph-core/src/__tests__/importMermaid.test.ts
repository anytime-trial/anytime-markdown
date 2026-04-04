import { importFromMermaid, layoutWithSubgroups } from '../io/importMermaid';

describe('importFromMermaid', () => {
  describe('basic node shapes', () => {
    it('should parse rect node with square brackets', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A[Hello]');
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0].text).toBe('Hello');
      expect(doc.nodes[0].type).toBe('rect');
    });

    it('should parse diamond node with curly braces', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A{Decision}');
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0].type).toBe('diamond');
      expect(doc.nodes[0].text).toBe('Decision');
    });

    it('should parse round node with parentheses', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A(Rounded)');
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0].type).toBe('rect');
      expect(doc.nodes[0].style.borderRadius).toBeGreaterThan(0);
    });

    it('should parse stadium node with ([...])', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A([Stadium])');
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0].type).toBe('ellipse');
    });

    it('should parse circle node with (( ))', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A((Circle))');
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0].type).toBe('ellipse');
    });

    it('should parse cylinder node with [( )]', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A[(Database)]');
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0].type).toBe('cylinder');
    });

    it('should parse asymmetric node with > ]', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A>Flag]');
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0].type).toBe('parallelogram');
    });

    it('should parse rhombus node with {{ }}', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A{{Hexagon}}');
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0].type).toBe('diamond');
    });
  });

  describe('edges', () => {
    it('should parse arrow edge --> as connector', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A[Start] --> B[End]');
      expect(doc.nodes).toHaveLength(2);
      expect(doc.edges).toHaveLength(1);
      expect(doc.edges[0].type).toBe('connector');
    });

    it('should parse line edge ---', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A[Start] --- B[End]');
      expect(doc.edges).toHaveLength(1);
      expect(doc.edges[0].type).toBe('line');
    });

    it('should parse dotted arrow -..-> as connector',  () => {
      const { doc } = importFromMermaid('flowchart TD\n  A -.-> B');
      expect(doc.edges).toHaveLength(1);
      expect(doc.edges[0].type).toBe('connector');
      expect(doc.edges[0].style.dashed).toBe(true);
    });

    it('should parse thick arrow ==> as connector', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A ==> B');
      expect(doc.edges).toHaveLength(1);
      expect(doc.edges[0].type).toBe('connector');
      expect(doc.edges[0].style.strokeWidth).toBeGreaterThan(2);
    });

    it('should parse edge label with pipe syntax -->|label|', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A -->|Yes| B');
      expect(doc.edges).toHaveLength(1);
      expect(doc.edges[0].label).toBe('Yes');
    });

    it('should parse edge label with inline syntax -- label -->', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A -- Yes --> B');
      expect(doc.edges).toHaveLength(1);
      expect(doc.edges[0].label).toBe('Yes');
    });

    it('should parse dotted line -.-', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A -.- B');
      expect(doc.edges).toHaveLength(1);
      expect(doc.edges[0].type).toBe('line');
      expect(doc.edges[0].style.dashed).toBe(true);
    });
  });

  describe('implicit node creation', () => {
    it('should create nodes from edge references without explicit definition', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A --> B');
      expect(doc.nodes).toHaveLength(2);
      expect(doc.nodes[0].text).toBe('A');
      expect(doc.nodes[1].text).toBe('B');
    });

    it('should not duplicate nodes referenced multiple times', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A --> B\n  A --> C\n  B --> C');
      expect(doc.nodes).toHaveLength(3);
    });
  });

  describe('direction', () => {
    it('should accept graph keyword as alias', () => {
      const { doc } = importFromMermaid('graph LR\n  A --> B');
      expect(doc.nodes).toHaveLength(2);
    });

    it('should accept all direction values', () => {
      for (const dir of ['TD', 'TB', 'LR', 'RL', 'BT']) {
        const { doc } = importFromMermaid(`flowchart ${dir}\n  A --> B`);
        expect(doc.nodes).toHaveLength(2);
      }
    });
  });

  describe('subgraph', () => {
    it('should parse subgraph as frame node', () => {
      const { doc } = importFromMermaid(
        'flowchart TD\n  subgraph Group1 [My Group]\n    A[Node]\n  end',
      );
      const frame = doc.nodes.find(n => n.type === 'frame');
      expect(frame).toBeDefined();
      expect(frame!.text).toBe('My Group');
      const child = doc.nodes.find(n => n.text === 'Node');
      expect(child).toBeDefined();
      expect(child!.groupId).toBe(frame!.id);
    });

    it('should parse subgraph with only title (no ID)', () => {
      const { doc } = importFromMermaid(
        'flowchart TD\n  subgraph My Group\n    A[Node]\n  end',
      );
      const frame = doc.nodes.find(n => n.type === 'frame');
      expect(frame).toBeDefined();
      expect(frame!.text).toBe('My Group');
    });
  });

  describe('layoutWithSubgroups', () => {
    it('should layout children inside frame and size frame to fit', () => {
      const { doc, direction } = importFromMermaid(
        'flowchart TD\n  subgraph G1 [Group]\n    A[Node A] --> B[Node B]\n  end',
      );
      layoutWithSubgroups(doc, direction, 180, 60);

      const frame = doc.nodes.find(n => n.type === 'frame')!;
      const childA = doc.nodes.find(n => n.text === 'Node A')!;
      const childB = doc.nodes.find(n => n.text === 'Node B')!;

      // Children should be inside the frame bounds
      expect(childA.x).toBeGreaterThanOrEqual(frame.x);
      expect(childA.y).toBeGreaterThanOrEqual(frame.y);
      expect(childA.x + childA.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(childB.x).toBeGreaterThanOrEqual(frame.x);
      expect(childB.y).toBeGreaterThanOrEqual(frame.y);
      expect(childB.x + childB.width).toBeLessThanOrEqual(frame.x + frame.width);
    });

    it('should not overlap frames with two subgroups', () => {
      const { doc, direction } = importFromMermaid(
        'flowchart TD\n  subgraph G1 [Group1]\n    A[Node A]\n  end\n  subgraph G2 [Group2]\n    B[Node B]\n  end',
      );
      layoutWithSubgroups(doc, direction, 180, 60);

      const f1 = doc.nodes.find(n => n.text === 'Group1')!;
      const f2 = doc.nodes.find(n => n.text === 'Group2')!;

      const overlapX = Math.min(f1.x + f1.width, f2.x + f2.width) - Math.max(f1.x, f2.x);
      const overlapY = Math.min(f1.y + f1.height, f2.y + f2.height) - Math.max(f1.y, f2.y);
      expect(overlapX > 0 && overlapY > 0).toBe(false);
    });

    it('should layout orphan nodes alongside frames', () => {
      const { doc, direction } = importFromMermaid(
        'flowchart TD\n  subgraph G1 [Group1]\n    A[Node A]\n  end\n  B[Orphan] --> A',
      );
      layoutWithSubgroups(doc, direction, 180, 60);

      const frame = doc.nodes.find(n => n.text === 'Group1')!;
      const orphan = doc.nodes.find(n => n.text === 'Orphan')!;

      const overlapX = Math.min(frame.x + frame.width, orphan.x + orphan.width) - Math.max(frame.x, orphan.x);
      const overlapY = Math.min(frame.y + frame.height, orphan.y + orphan.height) - Math.max(frame.y, orphan.y);
      expect(overlapX > 0 && overlapY > 0).toBe(false);
    });

    it('should handle doc with no frames (no-op on frames)', () => {
      const { doc, direction } = importFromMermaid(
        'flowchart TD\n  A[Node A] --> B[Node B]',
      );
      layoutWithSubgroups(doc, direction, 180, 60);

      const nodeA = doc.nodes.find(n => n.text === 'Node A')!;
      const nodeB = doc.nodes.find(n => n.text === 'Node B')!;
      expect(nodeA.x).toBeDefined();
      expect(nodeB.x).toBeDefined();
    });

    it('should handle frame with no children', () => {
      const { doc, direction } = importFromMermaid(
        'flowchart TD\n  subgraph G1 [Empty]\n  end\n  A[Node]',
      );
      layoutWithSubgroups(doc, direction, 180, 60);

      const frame = doc.nodes.find(n => n.text === 'Empty')!;
      const nodeA = doc.nodes.find(n => n.text === 'Node')!;
      expect(frame).toBeDefined();
      expect(nodeA).toBeDefined();
    });
  });

  describe('comments and whitespace', () => {
    it('should ignore comment lines', () => {
      const { doc } = importFromMermaid('flowchart TD\n  %% this is a comment\n  A --> B');
      expect(doc.nodes).toHaveLength(2);
    });

    it('should handle extra whitespace', () => {
      const { doc } = importFromMermaid('  flowchart  TD  \n    A[Hello]  -->  B[World]  ');
      expect(doc.nodes).toHaveLength(2);
      expect(doc.edges).toHaveLength(1);
    });
  });

  describe('complex graph', () => {
    it('should parse a multi-node flowchart', () => {
      const mmd = `flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Process]
  B -->|No| D[End]
  C --> D`;
      const { doc } = importFromMermaid(mmd);
      expect(doc.nodes).toHaveLength(4);
      expect(doc.edges).toHaveLength(4);
    });
  });

  describe('quoted text', () => {
    it('should strip outer quotes from node labels', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A["Write Markdown"]');
      expect(doc.nodes[0].text).toBe('Write Markdown');
    });

    it('should strip single quotes from node labels', () => {
      const { doc } = importFromMermaid("flowchart TD\n  A['Hello World']");
      expect(doc.nodes[0].text).toBe('Hello World');
    });
  });

  describe('user scenario: flowchart with cycle and branches', () => {
    it('should correctly parse the markdown workflow graph', () => {
      const mmd = `flowchart TD
  A["Write Markdown"] --> B{"Check preview"}
  B -->|Need revision| A
  B -->|OK| C["Save"]
  C --> D["Share / Publish"]
  C --> E["Export to PDF"]`;
      const { doc } = importFromMermaid(mmd);
      expect(doc.nodes).toHaveLength(5);
      expect(doc.edges).toHaveLength(5);
      // Text should not include quotes
      expect(doc.nodes.find(n => n.text === 'Write Markdown')).toBeDefined();
      expect(doc.nodes.find(n => n.text === 'Save')).toBeDefined();
      expect(doc.nodes.find(n => n.text === 'Check preview')).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should throw on empty input', () => {
      expect(() => importFromMermaid('')).toThrow();
    });

    it('should throw on missing diagram type', () => {
      expect(() => importFromMermaid('A --> B')).toThrow();
    });
  });

  describe('document metadata', () => {
    it('should set document name to Imported', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A --> B');
      expect(doc.name).toBe('Imported');
    });

    it('should generate unique node and edge IDs', () => {
      const { doc } = importFromMermaid('flowchart TD\n  A --> B');
      const ids = [...doc.nodes.map(n => n.id), ...doc.edges.map(e => e.id)];
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
