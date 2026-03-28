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

  it('should import fontColor from style', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="Red" style="rounded=0;fontColor=#FF0000" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].style.fontColor).toBe('#FF0000');
  });

  it('should import fontStyle bitmask', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="Bold Italic" style="rounded=0;fontStyle=3" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].style.fontStyle).toBe(3);
  });

  it('should import align and verticalAlign', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="Left Top" style="rounded=0;align=left;verticalAlign=top" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].style.align).toBe('left');
    expect(doc.nodes[0].style.verticalAlign).toBe('top');
  });

  it('should import opacity', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="Semi" style="rounded=0;opacity=50" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].style.opacity).toBe(50);
  });

  it('should import dashed style', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="Dashed" style="rounded=0;dashed=1" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].style.dashed).toBe(true);
  });

  it('should import rounded style as borderRadius', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="Rounded" style="rounded=1;arcSize=20" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].style.borderRadius).toBe(20);
  });

  it('should import rounded=1 with default borderRadius when arcSize absent', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="Rounded" style="rounded=1" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].style.borderRadius).toBe(10);
  });

  it('should import spacing properties', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="Spaced" style="rounded=0;spacing=5;spacingTop=10;spacingRight=8;spacingBottom=12;spacingLeft=6" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].style.spacing).toBe(5);
    expect(doc.nodes[0].style.spacingTop).toBe(10);
    expect(doc.nodes[0].style.spacingRight).toBe(8);
    expect(doc.nodes[0].style.spacingBottom).toBe(12);
    expect(doc.nodes[0].style.spacingLeft).toBe(6);
  });

  it('should import locked state from connectable attribute', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="Locked" style="rounded=0" vertex="1" parent="1" connectable="0">
  <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].locked).toBe(true);
  });

  it('should assign zIndex based on cell order', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="a" value="First" style="rounded=0" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
</mxCell>
<mxCell id="b" value="Second" style="rounded=0" vertex="1" parent="1">
  <mxGeometry x="200" y="0" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].zIndex).toBe(0);
    expect(doc.nodes[1].zIndex).toBe(1);
  });

  it('should import groupId from parent attribute', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="g1" value="Group" style="rounded=0" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="300" height="200" as="geometry"/>
</mxCell>
<mxCell id="c1" value="Child" style="rounded=0" vertex="1" parent="g1">
  <mxGeometry x="10" y="10" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    const child = doc.nodes.find(n => n.id === 'c1');
    expect(child?.groupId).toBe('g1');
    const group = doc.nodes.find(n => n.id === 'g1');
    expect(group?.groupId).toBeUndefined();
  });

  it('should map parallelogram shape to parallelogram NodeType', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="P" style="shape=parallelogram" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="60" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].type).toBe('parallelogram');
  });

  it('should map cylinder shape to cylinder NodeType', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="C" style="shape=cylinder3" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="60" height="80" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].type).toBe('cylinder');
  });

  it('should map note shape to sticky NodeType', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="N" style="shape=note" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="80" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].type).toBe('sticky');
  });

  it('should map document shape to doc NodeType', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="D" style="shape=document" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="80" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].type).toBe('doc');
  });

  it('should map image shape to image NodeType', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="I" style="shape=image" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="80" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].type).toBe('image');
  });

  it('should map swimlane to frame NodeType', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="F" style="swimlane" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="200" height="150" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].type).toBe('frame');
  });

  it('should map text with no stroke/fill to text NodeType', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="T" style="text;strokeColor=none;fillColor=none" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="30" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].type).toBe('text');
  });

  it('should resolve endpoint shapes (oval, diamond, bar)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="e1" value="" style="endArrow=oval;startArrow=diamond" edge="1" parent="1">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="0" y="0" as="sourcePoint"/>
    <mxPoint x="100" y="0" as="targetPoint"/>
  </mxGeometry>
</mxCell>
<mxCell id="e2" value="" style="endArrow=block;endFill=0" edge="1" parent="1">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="0" y="50" as="sourcePoint"/>
    <mxPoint x="100" y="50" as="targetPoint"/>
  </mxGeometry>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.edges[0].style.endShape).toBe('circle');
    expect(doc.edges[0].style.startShape).toBe('diamond');
    expect(doc.edges[1].style.endShape).toBe('bar');
  });

  it('should import orthogonal connector edge type', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="e1" value="" style="edgeStyle=orthogonalEdgeStyle;endArrow=classic" edge="1" parent="1" source="n1" target="n2">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.edges[0].type).toBe('connector');
  });

  it('should import curved edge with bezier routing', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="e1" value="" style="curved=1;endArrow=classic" edge="1" parent="1">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="0" y="0" as="sourcePoint"/>
    <mxPoint x="100" y="100" as="targetPoint"/>
  </mxGeometry>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.edges[0].style.routing).toBe('bezier');
  });

  it('should import line type when no arrow and no orthogonal', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="e1" value="" style="endArrow=none" edge="1" parent="1">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="0" y="0" as="sourcePoint"/>
    <mxPoint x="100" y="100" as="targetPoint"/>
  </mxGeometry>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.edges[0].type).toBe('line');
  });

  it('should import node link/url', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="Link" style="rounded=0" vertex="1" parent="1" link="https://example.com">
  <mxGeometry x="0" y="0" width="100" height="50" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].url).toBe('https://example.com');
  });

  it('should handle parseStyle with no value (flag-only)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="" style="ellipse;" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="100" height="60" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.nodes[0].type).toBe('ellipse');
  });

  it('should import edge with dashed and opacity', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram><mxGraphModel><root>
<mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="e1" value="" style="endArrow=classic;dashed=1;opacity=60" edge="1" parent="1">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="0" y="0" as="sourcePoint"/>
    <mxPoint x="100" y="100" as="targetPoint"/>
  </mxGeometry>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const doc = importFromDrawio(xml);
    expect(doc.edges[0].style.dashed).toBe(true);
    expect(doc.edges[0].style.opacity).toBe(60);
  });
});
