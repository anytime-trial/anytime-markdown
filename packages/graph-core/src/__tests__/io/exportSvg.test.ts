import { exportToSvg } from '../../io/exportSvg';
import { createDocument, createNode } from '../../types';

describe('exportToSvg', () => {
  it('should produce valid SVG for empty document', () => {
    const doc = createDocument('Empty');
    const svg = exportToSvg(doc);
    expect(svg).toContain('<?xml version="1.0"');
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
  });

  it('should render rect node with label', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 10, 20, { id: 'r1', text: 'Hello' });
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('<rect');
    expect(svg).toContain('Hello');
  });

  it('should render ellipse node', () => {
    const doc = createDocument('Test');
    const node = createNode('ellipse', 0, 0, { id: 'e1', text: 'Circle' });
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('Circle');
  });

  it('should escape special characters in labels (XSS prevention)', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'x1', text: '<script>alert("xss")</script>' });
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('should render diamond node as polygon', () => {
    const doc = createDocument('Test');
    const node = createNode('diamond', 0, 0, { id: 'd1', text: 'Decision' });
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('<polygon');
  });

  it('should export a parallelogram node', () => {
    const doc = createDocument('Test');
    const node = createNode('parallelogram', 0, 0, { id: 'p1', text: 'IO' });
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('<polygon');
    expect(svg).toContain('IO');
  });

  it('should export a cylinder node', () => {
    const doc = createDocument('Test');
    const node = createNode('cylinder', 0, 0, { id: 'cy1', text: 'DB' });
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('<path');
  });

  it('should export a frame node with dashed stroke', () => {
    const doc = createDocument('Test');
    const node = createNode('frame', 0, 0, { id: 'f1', text: 'Group' });
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('stroke-dasharray');
  });

  it('should export an image node', () => {
    const doc = createDocument('Test');
    const node = createNode('image', 0, 0, { id: 'img1', imageData: 'data:image/png;base64,abc' });
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('<image');
    expect(svg).toContain('preserveAspectRatio');
  });

  it('should export a gradient node', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'g1', text: 'Grad' });
    node.style.gradientTo = '#00FF00';
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('url(#grad-');
    expect(svg).toContain('<defs>');
  });

  it('should support horizontal gradient direction', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'g2' });
    node.style.gradientTo = '#FF0000';
    node.style.gradientDirection = 'horizontal';
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('x2="100%"');
    expect(svg).toContain('y2="0%"');
  });

  it('should add shadow filter when node has shadow enabled', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 's1', text: 'Shadow' });
    node.style.shadow = true;
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('<filter id="shadow"');
    expect(svg).toContain('feDropShadow');
    expect(svg).toContain('filter="url(#shadow)"');
  });

  it('should not add shadow filter when no node has shadow', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'ns1', text: 'NoShadow' });
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).not.toContain('<filter id="shadow"');
    expect(svg).not.toContain('filter="url(#shadow)"');
  });

  it('should export a sticky node', () => {
    const doc = createDocument('Test');
    const node = createNode('sticky', 0, 0, { id: 'st1', text: 'Note' });
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('rx="4"');
    expect(svg).toContain('Note');
  });

  it('should export a text node without shape', () => {
    const doc = createDocument('Test');
    const node = createNode('text', 0, 0, { id: 't1', text: 'Label' });
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('Label');
    // text nodes should not have rect/ellipse/polygon
    expect(svg).not.toContain('<rect x="0"');
  });

  it('should export a line edge', () => {
    const doc = createDocument('Test');
    const node1 = createNode('rect', 0, 0, { id: 'n1', text: 'A' });
    const node2 = createNode('rect', 300, 0, { id: 'n2', text: 'B' });
    doc.nodes = [node1, node2];
    doc.edges = [{
      id: 'e1', type: 'line',
      from: { x: 150, y: 50 }, to: { x: 300, y: 50 },
      style: { stroke: '#FFFFFF', strokeWidth: 2 },
    }];
    const svg = exportToSvg(doc);
    expect(svg).toContain('<line');
    expect(svg).toContain('x1="150"');
  });

  it('should export an arrow edge with arrowhead', () => {
    const doc = createDocument('Test');
    const node1 = createNode('rect', 0, 0, { id: 'n1', text: 'A' });
    const node2 = createNode('rect', 300, 0, { id: 'n2', text: 'B' });
    doc.nodes = [node1, node2];
    doc.edges = [{
      id: 'e2', type: 'arrow',
      from: { x: 150, y: 50 }, to: { x: 300, y: 50 },
      style: { stroke: '#FFFFFF', strokeWidth: 2 },
    }];
    const svg = exportToSvg(doc);
    expect(svg).toContain('<polygon'); // arrowhead
  });

  it('should export a connector edge with path', () => {
    const doc = createDocument('Test');
    const node1 = createNode('rect', 0, 0, { id: 'n1', text: 'A', width: 100, height: 80 });
    const node2 = createNode('rect', 300, 0, { id: 'n2', text: 'B', width: 100, height: 80 });
    doc.nodes = [node1, node2];
    doc.edges = [{
      id: 'e3', type: 'connector',
      from: { nodeId: 'n1', x: 100, y: 40 }, to: { nodeId: 'n2', x: 300, y: 40 },
      style: { stroke: '#FFFFFF', strokeWidth: 2 },
    }];
    const svg = exportToSvg(doc);
    expect(svg).toContain('<path');
    expect(svg).toContain('<polygon'); // connector has arrow by default
  });

  it('should export edge without arrow when endShape is none', () => {
    const doc = createDocument('Test');
    doc.edges = [{
      id: 'e4', type: 'line',
      from: { x: 0, y: 0 }, to: { x: 100, y: 100 },
      style: { stroke: '#FFFFFF', strokeWidth: 2, endShape: 'none' },
    }];
    const svg = exportToSvg(doc);
    // Should not contain polygon for arrowhead
    const edgeGroup = svg.split('id="e4"')[1]?.split('</g>')[0] ?? '';
    expect(edgeGroup).not.toContain('<polygon');
  });

  it('should include metadata as data attributes in SVG', () => {
    const doc = createDocument('test');
    const node = createNode('ellipse', 100, 100, {
      text: 'Paper',
      metadata: { year: 2023 },
    });
    doc.nodes.push(node);
    const svg = exportToSvg(doc);
    expect(svg).toContain('data-metadata=');
    expect(svg).toContain('2023');
  });

  it('should support diagonal gradient direction', () => {
    const doc = createDocument('Test');
    const node = createNode('rect', 0, 0, { id: 'g3' });
    node.style.gradientTo = '#FF0000';
    node.style.gradientDirection = 'diagonal';
    doc.nodes = [node];
    const svg = exportToSvg(doc);
    expect(svg).toContain('x2="100%"');
    expect(svg).toContain('y2="100%"');
  });
});
