import { c4ToGraphDocument } from '../transform/toGraphDocument';
import type { C4Model, BoundaryInfo } from '../types';

describe('c4ToGraphDocument', () => {
  it('should convert person to ellipse node', () => {
    const model: C4Model = {
      level: 'context',
      elements: [{ id: 'u1', type: 'person', name: 'User', description: 'A user' }],
      relationships: [],
    };
    const doc = c4ToGraphDocument(model);
    const node = doc.nodes.find(n => n.text.includes('User'));
    expect(node).toBeDefined();
    expect(node!.type).toBe('ellipse');
  });

  it('should convert system to rect node', () => {
    const model: C4Model = {
      level: 'context',
      elements: [{ id: 's1', type: 'system', name: 'App' }],
      relationships: [],
    };
    const doc = c4ToGraphDocument(model);
    const node = doc.nodes.find(n => n.text === 'App');
    expect(node).toBeDefined();
    expect(node!.type).toBe('rect');
  });

  it('should convert external system with dashed style', () => {
    const model: C4Model = {
      level: 'context',
      elements: [{ id: 's1', type: 'system', name: 'Ext', external: true }],
      relationships: [],
    };
    const doc = c4ToGraphDocument(model);
    const node = doc.nodes.find(n => n.text === 'Ext');
    expect(node!.style.dashed).toBe(true);
  });

  it('should convert containerDb to cylinder node', () => {
    const model: C4Model = {
      level: 'container',
      elements: [{ id: 'db1', type: 'containerDb', name: 'DB', technology: 'PostgreSQL' }],
      relationships: [],
    };
    const doc = c4ToGraphDocument(model);
    const node = doc.nodes.find(n => n.text.includes('DB'));
    expect(node!.type).toBe('cylinder');
  });

  it('should create frame for boundary elements', () => {
    const model: C4Model = {
      level: 'context',
      elements: [
        { id: 'a', type: 'system', name: 'App', boundaryId: 'b1' },
      ],
      relationships: [],
    };
    const doc = c4ToGraphDocument(model, [{ id: 'b1', name: 'Enterprise' }]);
    const frame = doc.nodes.find(n => n.type === 'frame');
    expect(frame).toBeDefined();
    expect(frame!.text).toBe('Enterprise');
    const child = doc.nodes.find(n => n.text.includes('App'));
    expect(child!.groupId).toBe(frame!.id);
  });

  it('should create frame for container elements', () => {
    const model: C4Model = {
      level: 'component',
      elements: [
        { id: 'pkg_app', type: 'container', name: 'app' },
        { id: 'f1', type: 'code', name: 'index.ts', boundaryId: 'pkg_app' },
      ],
      relationships: [],
    };
    const doc = c4ToGraphDocument(model);
    const frame = doc.nodes.find(n => n.type === 'frame' && n.text === 'app');
    expect(frame).toBeDefined();
    const child = doc.nodes.find(n => n.text === 'index.ts');
    expect(child!.groupId).toBe(frame!.id);
  });

  it('should create nested frames for container > component hierarchy', () => {
    const model: C4Model = {
      level: 'code',
      elements: [
        { id: 'pkg_core', type: 'container', name: 'core' },
        { id: 'pkg_core/analyzer', type: 'component', name: 'analyzer', boundaryId: 'pkg_core' },
        { id: 'f1', type: 'code', name: 'Parser.ts', boundaryId: 'pkg_core/analyzer' },
      ],
      relationships: [],
    };
    const doc = c4ToGraphDocument(model);
    const containerFrame = doc.nodes.find(n => n.type === 'frame' && n.text === 'core');
    const componentFrame = doc.nodes.find(n => n.type === 'frame' && n.text === 'analyzer');
    const codeNode = doc.nodes.find(n => n.text === 'Parser.ts');
    expect(containerFrame).toBeDefined();
    expect(componentFrame).toBeDefined();
    expect(componentFrame!.groupId).toBe(containerFrame!.id);
    expect(codeNode!.groupId).toBe(componentFrame!.id);
  });

  it('should resolve edges between boundary and non-boundary elements', () => {
    const model: C4Model = {
      level: 'component',
      elements: [
        { id: 'pkg_a', type: 'container', name: 'A' },
        { id: 'pkg_b', type: 'container', name: 'B' },
      ],
      relationships: [{ from: 'pkg_a', to: 'pkg_b', label: 'imports' }],
    };
    const doc = c4ToGraphDocument(model);
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0].label).toBe('imports');
  });

  it('should create connector edges for relationships', () => {
    const model: C4Model = {
      level: 'context',
      elements: [
        { id: 'u1', type: 'person', name: 'User' },
        { id: 's1', type: 'system', name: 'App' },
      ],
      relationships: [{ from: 'u1', to: 's1', label: 'Uses' }],
    };
    const doc = c4ToGraphDocument(model);
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0].label).toBe('Uses');
    expect(doc.edges[0].type).toBe('connector');
  });

  it('should set groupId on boundary frames when element has boundaryId', () => {
    const model: C4Model = {
      title: 'Nested Test',
      level: 'component',
      elements: [
        { id: 'outer', type: 'container', name: 'Outer' },
        { id: 'inner', type: 'component', name: 'Inner', boundaryId: 'outer' },
        { id: 'leaf', type: 'code', name: 'leaf.ts', boundaryId: 'inner' },
      ],
      relationships: [],
    };
    const boundaries: BoundaryInfo[] = [
      { id: 'outer', name: 'Outer' },
      { id: 'inner', name: 'Inner' },
    ];
    const doc = c4ToGraphDocument(model, boundaries);

    const outerFrame = doc.nodes.find(n => n.text === 'Outer');
    const innerFrame = doc.nodes.find(n => n.text === 'Inner');
    const leafNode = doc.nodes.find(n => n.text === 'leaf.ts');

    expect(outerFrame).toBeDefined();
    expect(innerFrame).toBeDefined();
    expect(leafNode).toBeDefined();
    // innerFrame は outerFrame の子
    expect(innerFrame!.groupId).toBe(outerFrame!.id);
    // leafNode は innerFrame の子
    expect(leafNode!.groupId).toBe(innerFrame!.id);
  });
});
