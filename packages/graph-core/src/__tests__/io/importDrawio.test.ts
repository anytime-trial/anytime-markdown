/**
 * @jest-environment jsdom
 */
import { importFromDrawio } from '../../io/importDrawio';

describe('importFromDrawio', () => {
  it('should parse a minimal draw.io XML with one vertex node', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile>
<diagram>
<mxGraphModel>
<root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="2" value="Hello" style="rounded=0;fillColor=#FF0000;strokeColor=#000000" vertex="1" parent="1">
  <mxGeometry x="100" y="200" width="150" height="80" as="geometry"/>
</mxCell>
</root>
</mxGraphModel>
</diagram>
</mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.edges).toHaveLength(0);
    const node = doc.nodes[0];
    expect(node.id).toBe('2');
    expect(node.text).toBe('Hello');
    expect(node.x).toBe(100);
    expect(node.y).toBe(200);
    expect(node.width).toBe(150);
    expect(node.height).toBe(80);
    expect(node.type).toBe('rect');
    expect(node.style.fill).toBe('#FF0000');
    expect(node.style.stroke).toBe('#000000');
  });

  it('should parse XML with two nodes and one edge', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile>
<diagram>
<mxGraphModel>
<root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="n1" value="A" style="rounded=0" vertex="1" parent="1">
  <mxGeometry x="10" y="20" width="100" height="50" as="geometry"/>
</mxCell>
<mxCell id="n2" value="B" style="rounded=0" vertex="1" parent="1">
  <mxGeometry x="300" y="20" width="100" height="50" as="geometry"/>
</mxCell>
<mxCell id="e1" value="" style="endArrow=classic;endFill=1" edge="1" parent="1" source="n1" target="n2">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
</root>
</mxGraphModel>
</diagram>
</mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes).toHaveLength(2);
    expect(doc.edges).toHaveLength(1);
    const edge = doc.edges[0];
    expect(edge.id).toBe('e1');
    expect(edge.from.nodeId).toBe('n1');
    expect(edge.to.nodeId).toBe('n2');
    expect(edge.type).toBe('arrow');
  });

  it('should produce empty document when no mxCell elements present', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile>
<diagram>
<mxGraphModel>
<root>
</root>
</mxGraphModel>
</diagram>
</mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes).toHaveLength(0);
    expect(doc.edges).toHaveLength(0);
    expect(doc.name).toBe('Imported');
  });

  it('should map ellipse style to ellipse NodeType', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="3" value="Oval" style="ellipse" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="60" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].type).toBe('ellipse');
  });

  it('should map rhombus style to diamond NodeType', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="4" value="Diamond" style="rhombus" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="100" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].type).toBe('diamond');
  });

  it('should strip HTML tags from value', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="5" value="Line1&lt;br&gt;Line2" style="rounded=0" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    // <br> should be converted to newline, other tags stripped
    expect(doc.nodes[0].text).toContain('Line1');
    expect(doc.nodes[0].text).toContain('Line2');
    expect(doc.nodes[0].text).not.toContain('<br');
  });

  it('should throw on malformed XML', () => {
    expect(() => importFromDrawio('<not valid xml<>')).toThrow('Invalid XML');
  });
});
