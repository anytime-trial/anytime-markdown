import { c4ToGraphDocument } from '../transform/toGraphDocument';
import type { C4Model } from '../types';

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
});
