import { parseMermaidC4, extractBoundaries } from '../parser/mermaidC4';

describe('parseMermaidC4', () => {
  describe('C4Context', () => {
    it('should parse Person and System', () => {
      const input = `C4Context
  title System Context
  Person(user, "User", "A user")
  System(app, "App", "Main application")
  Rel(user, app, "Uses", "HTTPS")`;

      const model = parseMermaidC4(input);
      expect(model.level).toBe('context');
      expect(model.title).toBe('System Context');
      expect(model.elements).toHaveLength(2);
      expect(model.elements[0]).toEqual({
        id: 'user', type: 'person', name: 'User', description: 'A user',
      });
      expect(model.elements[1]).toEqual({
        id: 'app', type: 'system', name: 'App', description: 'Main application',
      });
      expect(model.relationships).toHaveLength(1);
      expect(model.relationships[0]).toEqual({
        from: 'user', to: 'app', label: 'Uses', technology: 'HTTPS',
      });
    });

    it('should parse external systems', () => {
      const input = `C4Context
  System_Ext(mail, "Email", "Sends email")`;

      const model = parseMermaidC4(input);
      expect(model.elements[0]).toEqual({
        id: 'mail', type: 'system', name: 'Email', description: 'Sends email', external: true,
      });
    });

    it('should parse boundaries', () => {
      const input = `C4Context
  System_Boundary(b1, "Enterprise") {
    System(app, "App", "Main")
  }`;

      const model = parseMermaidC4(input);
      expect(model.elements).toHaveLength(1);
      expect(model.elements[0].boundaryId).toBe('b1');
    });
  });

  describe('C4Container', () => {
    it('should parse Container and ContainerDb', () => {
      const input = `C4Container
  Container(api, "API", "Node.js", "REST API")
  ContainerDb(db, "Database", "PostgreSQL", "Stores data")`;

      const model = parseMermaidC4(input);
      expect(model.level).toBe('container');
      expect(model.elements[0]).toEqual({
        id: 'api', type: 'container', name: 'API', technology: 'Node.js', description: 'REST API',
      });
      expect(model.elements[1]).toEqual({
        id: 'db', type: 'containerDb', name: 'Database', technology: 'PostgreSQL', description: 'Stores data',
      });
    });
  });

  describe('C4Component', () => {
    it('should parse Component', () => {
      const input = `C4Component
  Component(ctrl, "Controller", "TypeScript", "Handles requests")`;

      const model = parseMermaidC4(input);
      expect(model.level).toBe('component');
      expect(model.elements[0]).toEqual({
        id: 'ctrl', type: 'component', name: 'Controller', technology: 'TypeScript', description: 'Handles requests',
      });
    });
  });

  describe('relationships', () => {
    it('should parse BiRel', () => {
      const input = `C4Context
  Person(a, "A", "")
  System(b, "B", "")
  BiRel(a, b, "Communicates")`;

      const model = parseMermaidC4(input);
      expect(model.relationships[0].bidirectional).toBe(true);
    });

    it('should parse directional Rel variants', () => {
      const input = `C4Context
  Person(a, "A", "")
  System(b, "B", "")
  Rel_D(a, b, "Down")
  Rel_U(b, a, "Up")`;

      const model = parseMermaidC4(input);
      expect(model.relationships).toHaveLength(2);
    });
  });

  describe('Code element', () => {
    it('should parse Code elements', () => {
      const input = `C4Component
    Container_Boundary(pkg, "my-pkg") {
      Code(file1, "index.ts")
    }`;
      const model = parseMermaidC4(input);
      expect(model.elements).toHaveLength(1);
      expect(model.elements[0]).toEqual({
        id: 'file1',
        type: 'code',
        name: 'index.ts',
        boundaryId: 'pkg',
      });
    });
  });

  describe('error handling', () => {
    it('should throw on empty input', () => {
      expect(() => parseMermaidC4('')).toThrow();
    });

    it('should throw on missing C4 diagram type', () => {
      expect(() => parseMermaidC4('flowchart TD\n  A --> B')).toThrow();
    });
  });

  describe('parser edge cases', () => {
    it('skips empty lines and %% comments', () => {
      const input = `C4Context
%% This is a comment

Person(u, "User", "A user")`;
      const model = parseMermaidC4(input);
      expect(model.elements).toHaveLength(1);
    });

    it('skips unknown function names gracefully', () => {
      const input = `C4Context
UnknownFn(x, "something")
Person(u, "User")`;
      const model = parseMermaidC4(input);
      expect(model.elements).toHaveLength(1);
      expect(model.elements[0].id).toBe('u');
    });

    it('Rel with missing label uses undefined', () => {
      const input = `C4Context
Person(a, "A")
System(b, "B")
Rel(a, b)`;
      const model = parseMermaidC4(input);
      expect(model.relationships).toHaveLength(1);
      expect(model.relationships[0].label).toBeUndefined();
    });

    it('Element without hasTech uses args[2] as description', () => {
      const input = `C4Context
Person(u, "User", "A human user")`;
      const model = parseMermaidC4(input);
      expect(model.elements[0].description).toBe('A human user');
    });
  });
});

describe('extractBoundaries', () => {
  it('extracts System_Boundary', () => {
    const input = `C4Component\n  System_Boundary(frontend, "Frontend")`;
    const result = extractBoundaries(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'frontend', name: 'Frontend' });
  });

  it('extracts multiple boundaries', () => {
    const input = `C4Component
  System_Boundary(bA, "Service A")
  Container_Boundary(bB, "Service B")`;
    const result = extractBoundaries(input);
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.id)).toEqual(['bA', 'bB']);
  });

  it('returns empty array when no boundaries present', () => {
    expect(extractBoundaries('C4Context\n  Person(u, "User")')).toHaveLength(0);
  });

  it('handles Enterprise_Boundary variant', () => {
    const input = 'Enterprise_Boundary(ent, "Enterprise")';
    const result = extractBoundaries(input);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('ent');
  });
});
