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
});
