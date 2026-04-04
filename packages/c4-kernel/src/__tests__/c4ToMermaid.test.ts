import { c4ToMermaid } from '../serializer/c4ToMermaid';
import { parseMermaidC4 } from '../parser/mermaidC4';
import type { C4Model } from '../types';

describe('c4ToMermaid', () => {
  it('should serialize flat elements', () => {
    const model: C4Model = {
      title: 'Test',
      level: 'component',
      elements: [
        { id: 'sys1', type: 'system', name: 'System A' },
        { id: 'sys2', type: 'system', name: 'System B' },
      ],
      relationships: [
        { from: 'sys1', to: 'sys2', label: 'calls' },
      ],
    };
    const result = c4ToMermaid(model);
    expect(result).toContain('C4Component');
    expect(result).toContain('title Test');
    expect(result).toContain('System(sys1, "System A")');
    expect(result).toContain('System(sys2, "System B")');
    expect(result).toContain('Rel(sys1, sys2, "calls")');
  });

  it('should serialize boundary elements with nesting', () => {
    const model: C4Model = {
      title: 'Nested',
      level: 'component',
      elements: [
        { id: 'pkg', type: 'container', name: 'my-pkg' },
        { id: 'dir', type: 'component', name: 'model', boundaryId: 'pkg' },
        { id: 'f1', type: 'code', name: 'types.ts', boundaryId: 'dir' },
      ],
      relationships: [],
    };
    const result = c4ToMermaid(model);
    expect(result).toContain('Container(pkg, "my-pkg")');
    expect(result).toContain('Container_Boundary(pkg, "my-pkg") {');
    expect(result).toContain('Component(dir, "model")');
    expect(result).toContain('Container_Boundary(dir, "model") {');
    expect(result).toContain('Code(f1, "types.ts")');
  });

  it('should serialize external elements', () => {
    const model: C4Model = {
      level: 'context',
      elements: [
        { id: 'ext', type: 'system', name: 'External', external: true },
      ],
      relationships: [],
    };
    const result = c4ToMermaid(model);
    expect(result).toContain('System_Ext(ext, "External")');
  });

  it('should serialize elements with technology', () => {
    const model: C4Model = {
      level: 'container',
      elements: [
        { id: 'api', type: 'container', name: 'API', technology: 'Node.js' },
      ],
      relationships: [],
    };
    const result = c4ToMermaid(model);
    expect(result).toContain('Container(api, "API", "Node.js")');
  });

  it('should serialize BiRel', () => {
    const model: C4Model = {
      level: 'context',
      elements: [
        { id: 'a', type: 'system', name: 'A' },
        { id: 'b', type: 'system', name: 'B' },
      ],
      relationships: [
        { from: 'a', to: 'b', label: 'syncs', bidirectional: true },
      ],
    };
    const result = c4ToMermaid(model);
    expect(result).toContain('BiRel(a, b, "syncs")');
  });

  it('should round-trip with parseMermaidC4', () => {
    const model: C4Model = {
      title: 'Round Trip',
      level: 'component',
      elements: [
        { id: 'pkg', type: 'container', name: 'my-pkg' },
        { id: 'comp', type: 'component', name: 'engine', boundaryId: 'pkg' },
        { id: 'file', type: 'code', name: 'render.ts', boundaryId: 'comp' },
      ],
      relationships: [
        { from: 'file', to: 'pkg', label: 'imports' },
      ],
    };
    const mermaid = c4ToMermaid(model);
    const parsed = parseMermaidC4(mermaid);

    expect(parsed.title).toBe('Round Trip');
    expect(parsed.elements).toHaveLength(3);
    expect(parsed.relationships).toHaveLength(1);

    const file = parsed.elements.find(e => e.id === 'file');
    expect(file?.type).toBe('code');
    expect(file?.boundaryId).toBe('comp');
  });
});
