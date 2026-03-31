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

  it('should export parallelogram node with correct shape style', () => {
    const doc = createDocument('Test');
    const node = createNode('parallelogram', 0, 0, { id: 'p1', text: 'IO' });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('shape=parallelogram');
  });

  it('should export cylinder node with correct shape style', () => {
    const doc = createDocument('Test');
    const node = createNode('cylinder', 0, 0, { id: 'cy1', text: 'DB' });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('shape=cylinder3');
  });

  it('should export sticky node with note shape', () => {
    const doc = createDocument('Test');
    const node = createNode('sticky', 0, 0, { id: 's1', text: 'Note' });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('shape=note');
  });

  it('should export text node with no fill/stroke', () => {
    const doc = createDocument('Test');
    const node = createNode('text', 0, 0, { id: 't1', text: 'Label' });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('strokeColor=none');
    expect(xml).toContain('fillColor=none');
  });

  it('should export diamond node as rhombus', () => {
    const doc = createDocument('Test');
    const node = createNode('diamond', 0, 0, { id: 'd1', text: 'Decision' });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('rhombus');
  });

  it('should export connector edge with bezier routing', () => {
    const doc = createDocument('Test');
    const n1 = createNode('rect', 0, 0, { id: 'a', text: 'A' });
    const n2 = createNode('rect', 200, 0, { id: 'b', text: 'B' });
    const edge = createEdge('connector', { nodeId: 'a', x: 0, y: 0 }, { nodeId: 'b', x: 0, y: 0 }, { id: 'e1' });
    edge.style.routing = 'bezier';
    doc.nodes = [n1, n2];
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('curved=1');
  });

  it('should export edge with circle endShape', () => {
    const doc = createDocument('Test');
    const edge = createEdge('line', { x: 0, y: 0 }, { x: 100, y: 100 }, { id: 'e2' });
    edge.style.endShape = 'circle';
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('endArrow=oval');
  });

  it('should export edge with diamond endShape', () => {
    const doc = createDocument('Test');
    const edge = createEdge('line', { x: 0, y: 0 }, { x: 100, y: 100 }, { id: 'e3' });
    edge.style.endShape = 'diamond';
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('endArrow=diamond');
  });

  it('should export edge with bar endShape', () => {
    const doc = createDocument('Test');
    const edge = createEdge('line', { x: 0, y: 0 }, { x: 100, y: 100 }, { id: 'e4' });
    edge.style.endShape = 'bar';
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('endArrow=block;endFill=0');
  });

  it('should export edge with none endShape', () => {
    const doc = createDocument('Test');
    const edge = createEdge('line', { x: 0, y: 0 }, { x: 100, y: 100 }, { id: 'e5' });
    edge.style.endShape = 'none';
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('endArrow=none');
  });

  it('should export edge with arrow startShape', () => {
    const doc = createDocument('Test');
    const edge = createEdge('line', { x: 0, y: 0 }, { x: 100, y: 100 }, { id: 'e6' });
    edge.style.startShape = 'arrow';
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('startArrow=classic');
  });

  it('should export edge with circle startShape', () => {
    const doc = createDocument('Test');
    const edge = createEdge('line', { x: 0, y: 0 }, { x: 100, y: 100 }, { id: 'e7' });
    edge.style.startShape = 'circle';
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('startArrow=oval');
  });

  it('should export edge with diamond startShape', () => {
    const doc = createDocument('Test');
    const edge = createEdge('line', { x: 0, y: 0 }, { x: 100, y: 100 }, { id: 'e8' });
    edge.style.startShape = 'diamond';
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('startArrow=diamond');
  });

  it('should export edge with bar startShape', () => {
    const doc = createDocument('Test');
    const edge = createEdge('line', { x: 0, y: 0 }, { x: 100, y: 100 }, { id: 'e9' });
    edge.style.startShape = 'bar';
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('startArrow=block');
  });

  it('should export sourcePoint when edge has no source nodeId', () => {
    const doc = createDocument('Test');
    const edge = createEdge('line', { x: 10, y: 20 }, { nodeId: 'n1', x: 0, y: 0 }, { id: 'e10' });
    const node = createNode('rect', 200, 0, { id: 'n1', text: 'A' });
    doc.nodes = [node];
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('as="sourcePoint"');
    expect(xml).toContain('x="10"');
    expect(xml).toContain('y="20"');
  });

  it('should export targetPoint when edge has no target nodeId', () => {
    const doc = createDocument('Test');
    const edge = createEdge('line', { nodeId: 'n1', x: 0, y: 0 }, { x: 300, y: 400 }, { id: 'e11' });
    const node = createNode('rect', 0, 0, { id: 'n1', text: 'A' });
    doc.nodes = [node];
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('as="targetPoint"');
    expect(xml).toContain('x="300"');
    expect(xml).toContain('y="400"');
  });

  it('should export node with URL as link attribute', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'u1', text: 'Link', url: 'https://example.com' });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('link="https://example.com"');
  });

  it('should export edge with label', () => {
    const doc = createDocument('Test');
    const edge = createEdge('arrow', { x: 0, y: 0 }, { x: 100, y: 100 }, { id: 'el1', label: 'yes' });
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('value="yes"');
  });

  it('should export fontColor from node style', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'fc1', text: 'Red' });
    node.style.fontColor = '#FF0000';
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('fontColor=#FF0000');
  });

  it('should export default fontColor as white when not set', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'fc2', text: 'Default' });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('fontColor=#FFFFFF');
  });

  it('should export fontStyle bitmask', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'fs1', text: 'Bold' });
    node.style.fontStyle = 1;
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('fontStyle=1');
  });

  it('should export align and verticalAlign', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'al1', text: 'Left' });
    node.style.align = 'left';
    node.style.verticalAlign = 'top';
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('align=left');
    expect(xml).toContain('verticalAlign=top');
  });

  it('should not export default align=center and verticalAlign=middle', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'al2', text: 'Center' });
    node.style.align = 'center';
    node.style.verticalAlign = 'middle';
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).not.toContain('align=');
    expect(xml).not.toContain('verticalAlign=');
  });

  it('should export opacity', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'op1', text: 'Semi' });
    node.style.opacity = 50;
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('opacity=50');
  });

  it('should not export opacity=100 (default)', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'op2', text: 'Full' });
    node.style.opacity = 100;
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).not.toContain('opacity=');
  });

  it('should export dashed style', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'da1', text: 'Dashed' });
    node.style.dashed = true;
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('dashed=1');
  });

  it('should export rounded=1 when borderRadius is set', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'rd1', text: 'Rounded' });
    node.style.borderRadius = 10;
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('rounded=1');
  });

  it('should export spacing properties', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'sp1', text: 'Spaced' });
    node.style.spacing = 5;
    node.style.spacingTop = 10;
    node.style.spacingRight = 8;
    node.style.spacingBottom = 12;
    node.style.spacingLeft = 6;
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('spacing=5');
    expect(xml).toContain('spacingTop=10');
    expect(xml).toContain('spacingRight=8');
    expect(xml).toContain('spacingBottom=12');
    expect(xml).toContain('spacingLeft=6');
  });

  it('should export locked node with connectable=0', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'lk1', text: 'Locked', locked: true });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('connectable="0"');
  });

  it('should export groupId as parent attribute', () => {
    const doc = createDocument('Test');
    const group = createNode('rect', 0, 0, { id: 'g1', text: 'Group' });
    const child = createNode('rect', 10, 10, { id: 'c1', text: 'Child', groupId: 'g1' });
    doc.nodes = [group, child];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('id="c1"');
    expect(xml).toContain('parent="g1"');
  });

  it('should export nodes sorted by zIndex', () => {
    const doc = createDocument('Test');
    const n1 = createNode('rect', 0, 0, { id: 'z2', text: 'Top', zIndex: 2 });
    const n2 = createNode('rect', 100, 0, { id: 'z0', text: 'Bottom', zIndex: 0 });
    const n3 = createNode('rect', 200, 0, { id: 'z1', text: 'Middle', zIndex: 1 });
    doc.nodes = [n1, n2, n3];
    const xml = exportToDrawio(doc);
    const z0Pos = xml.indexOf('id="z0"');
    const z1Pos = xml.indexOf('id="z1"');
    const z2Pos = xml.indexOf('id="z2"');
    expect(z0Pos).toBeLessThan(z1Pos);
    expect(z1Pos).toBeLessThan(z2Pos);
  });

  it('should export doc node with document shape', () => {
    const doc = createDocument('Test');
    const node = createNode('doc', 0, 0, { id: 'doc1', text: 'Document' });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('shape=document');
  });

  it('should export frame node with swimlane style', () => {
    const doc = createDocument('Test');
    const node = createNode('frame', 0, 0, { id: 'fr1', text: 'Frame' });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('swimlane');
    expect(xml).toContain('startSize=20');
  });

  it('should export image node with image shape', () => {
    const doc = createDocument('Test');
    const node = createNode('image', 0, 0, { id: 'img1', text: 'Image' });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('shape=image');
  });

  it('should round-trip doc node type', () => {
    const doc = createDocument('RoundTrip');
    const node = createNode('doc', 10, 20, { id: 'rtd1', text: 'Doc Test', width: 200, height: 120 });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    const imported = importFromDrawio(xml);
    expect(imported.nodes[0].type).toBe('doc');
    expect(imported.nodes[0].text).toBe('Doc Test');
  });

  it('should round-trip frame node type', () => {
    const doc = createDocument('RoundTrip');
    const frame = createNode('frame', 0, 0, { id: 'rtf1', text: 'Group', width: 400, height: 300 });
    const child = createNode('rect', 10, 30, { id: 'rtc1', text: 'Child', groupId: 'rtf1' });
    doc.nodes = [frame, child];
    const xml = exportToDrawio(doc);
    const imported = importFromDrawio(xml);
    const importedFrame = imported.nodes.find(n => n.id === 'rtf1');
    const importedChild = imported.nodes.find(n => n.id === 'rtc1');
    expect(importedFrame?.type).toBe('frame');
    expect(importedChild?.groupId).toBe('rtf1');
  });

  it('should round-trip image node type', () => {
    const doc = createDocument('RoundTrip');
    const node = createNode('image', 0, 0, { id: 'rti1', text: 'Photo', width: 200, height: 150 });
    doc.nodes = [node];
    const xml = exportToDrawio(doc);
    const imported = importFromDrawio(xml);
    expect(imported.nodes[0].type).toBe('image');
  });

  it('should export edge with dashed and opacity', () => {
    const doc = createDocument('Test');
    const edge = createEdge('arrow', { x: 0, y: 0 }, { x: 100, y: 100 }, { id: 'ed1' });
    edge.style.dashed = true;
    edge.style.opacity = 70;
    doc.edges = [edge];
    const xml = exportToDrawio(doc);
    expect(xml).toContain('dashed=1');
    expect(xml).toContain('opacity=70');
  });

  it('should preserve metadata in round-trip', () => {
    const doc = createDocument('test');
    const node = createNode('ellipse', 100, 100, {
      text: 'Paper A',
      metadata: { citationCount: 42, year: 2023 },
    });
    doc.nodes.push(node);
    const xml = exportToDrawio(doc);
    const imported = importFromDrawio(xml);
    const importedNode = imported.nodes.find(n => n.text === 'Paper A');
    expect(importedNode?.metadata).toEqual({ citationCount: 42, year: 2023 });
  });

  it('should preserve edge weight in round-trip', () => {
    const doc = createDocument('test');
    const n1 = createNode('rect', 0, 0);
    const n2 = createNode('rect', 200, 0);
    doc.nodes.push(n1, n2);
    const edge = createEdge('line',
      { nodeId: n1.id, x: 0, y: 0 },
      { nodeId: n2.id, x: 200, y: 0 },
      { weight: 0.75 },
    );
    doc.edges.push(edge);
    const xml = exportToDrawio(doc);
    const imported = importFromDrawio(xml);
    expect(imported.edges[0]?.weight).toBe(0.75);
  });

  it('should round-trip new style properties', () => {
    const doc = createDocument('RoundTrip');
    const node = createNode('rect', 50, 50, { id: 'rt2', text: 'Styled', locked: true, zIndex: 3 });
    node.style.fontColor = '#00FF00';
    node.style.fontStyle = 5; // bold + underline
    node.style.align = 'right';
    node.style.verticalAlign = 'bottom';
    node.style.opacity = 80;
    node.style.dashed = true;
    node.style.borderRadius = 15;
    node.style.spacing = 4;
    doc.nodes = [node];

    const xml = exportToDrawio(doc);
    const imported = importFromDrawio(xml);
    const n = imported.nodes[0];

    expect(n.style.fontColor).toBe('#00FF00');
    expect(n.style.fontStyle).toBe(5);
    expect(n.style.align).toBe('right');
    expect(n.style.verticalAlign).toBe('bottom');
    expect(n.style.opacity).toBe(80);
    expect(n.style.dashed).toBe(true);
    expect(n.style.borderRadius).toBeTruthy();
    expect(n.style.spacing).toBe(4);
    expect(n.locked).toBe(true);
  });
});
