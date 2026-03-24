/**
 * @jest-environment jsdom
 */
import { exportToDrawio } from '../../io/exportDrawio';
import { importFromDrawio } from '../../io/importDrawio';
import { createDocument, createNode, createEdge } from '../../types';

describe('exportToDrawio', () => {
  it('should produce valid mxfile XML for empty document', () => {
    const doc = createDocument('Empty');
    const xml = exportToDrawio(doc);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<mxfile>');
    expect(xml).toContain('</mxfile>');
    expect(xml).toContain('<mxCell id="0"/>');
    expect(xml).toContain('<mxCell id="1" parent="0"/>');
  });

  it('should export a node with correct geometry', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 50, 100, { id: 'n1', text: 'Box', width: 200, height: 80 });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('value="Box"');
    expect(xml).toContain('vertex="1"');
    expect(xml).toContain('x="50"');
    expect(xml).toContain('y="100"');
    expect(xml).toContain('width="200"');
    expect(xml).toContain('height="80"');
  });

  it('should escape special characters in node text', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'n1', text: 'A & B <C>' });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
  });

  it('should round-trip: export then import preserves node properties', () => {
    const doc = createDocument('RoundTrip');
    const node = createNode('ellipse', 30, 40, {
      id: 'rt1',
      text: 'Test Node',
      width: 120,
      height: 60,
    });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    const imported = importFromDrawio(xml);

    expect(imported.nodes).toHaveLength(1);
    const importedNode = imported.nodes[0];
    expect(importedNode.id).toBe('rt1');
    expect(importedNode.type).toBe('ellipse');
    expect(importedNode.x).toBe(30);
    expect(importedNode.y).toBe(40);
    expect(importedNode.width).toBe(120);
    expect(importedNode.height).toBe(60);
    expect(importedNode.text).toBe('Test Node');
  });

  it('should round-trip edge with source and target', () => {
    const doc = createDocument('RoundTrip');
    const n1 = createNode('rect', 0, 0, { id: 'a', text: 'A' });
    const n2 = createNode('rect', 200, 0, { id: 'b', text: 'B' });
    const edge = createEdge('connector', { nodeId: 'a', x: 0, y: 0 }, { nodeId: 'b', x: 0, y: 0 }, { id: 'e1' });
    doc.nodes = [n1, n2];
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    const imported = importFromDrawio(xml);

    expect(imported.edges).toHaveLength(1);
    expect(imported.edges[0].from.nodeId).toBe('a');
    expect(imported.edges[0].to.nodeId).toBe('b');
  });
});
