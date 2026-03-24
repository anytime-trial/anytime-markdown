import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createGraphFile } from '../../tools/createGraph';
import { addNode } from '../../tools/addNode';
import { addEdge } from '../../tools/addEdge';
import { exportSvg } from '../../tools/exportSvg';
import { exportDrawio } from '../../tools/exportDrawio';
import { importDrawio } from '../../tools/importDrawio';
import { readGraph } from '../../tools/readGraph';

describe('exportSvg', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should export graph as SVG string', async () => {
    await createGraphFile({ path: 'test.graph.json', name: 'Test' }, tmpDir);
    await addNode({ path: 'test.graph.json', type: 'rect', x: 0, y: 0, text: 'A' }, tmpDir);
    await addNode({ path: 'test.graph.json', type: 'rect', x: 200, y: 0, text: 'B' }, tmpDir);
    const svg = await exportSvg({ path: 'test.graph.json' }, tmpDir);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});

describe('exportDrawio', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should export graph as draw.io XML', async () => {
    await createGraphFile({ path: 'test.graph.json', name: 'Test' }, tmpDir);
    await addNode({ path: 'test.graph.json', type: 'rect', x: 0, y: 0, text: 'A' }, tmpDir);
    const xml = await exportDrawio({ path: 'test.graph.json' }, tmpDir);
    expect(xml).toContain('mxGraphModel');
  });
});

describe('importDrawio', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should import draw.io XML and create graph', async () => {
    const drawioXml = `<mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="Node A" style="rounded=1;" vertex="1" parent="1">
          <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>`;
    const doc = await importDrawio({ path: 'imported.graph.json', drawioContent: drawioXml }, tmpDir);
    expect(doc.nodes.length).toBeGreaterThan(0);
    // Verify file was saved
    const saved = await readGraph({ path: 'imported.graph.json' }, tmpDir);
    expect(saved.nodes.length).toBeGreaterThan(0);
  });
});
