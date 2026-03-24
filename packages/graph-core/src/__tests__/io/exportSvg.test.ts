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
});
