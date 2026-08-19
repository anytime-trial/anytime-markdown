import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../server';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('mcp-graph server handlers', () => {
  let tmpDir: string;
  let client: Client;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-handlers-'));
    const server = createMcpServer({ rootDir: tmpDir });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await fs.rm(tmpDir, { recursive: true });
  });

  function getText(result: Awaited<ReturnType<typeof client.callTool>>): string {
    return (result.content as Array<{ type: string; text: string }>)[0].text;
  }

  async function importEmptyGraph(path: string, name: string): Promise<void> {
    await client.callTool({
      name: 'batch_import',
      arguments: { path, name, nodes: [], edges: [] },
    });
  }

  it('read_graph should return graph document', async () => {
    await importEmptyGraph('r.graph', 'R');
    const result = await client.callTool({ name: 'read_graph', arguments: { path: 'r.graph' } });
    const doc = JSON.parse(getText(result));
    expect(doc.name).toBe('R');
  });

  it('write_graph should write and return confirmation', async () => {
    await importEmptyGraph('w.graph', 'W');
    const readResult = await client.callTool({ name: 'read_graph', arguments: { path: 'w.graph' } });
    const doc = JSON.parse(getText(readResult));
    doc.name = 'Updated';
    const writeResult = await client.callTool({
      name: 'write_graph',
      arguments: { path: 'w.graph', document: JSON.stringify(doc) },
    });
    expect(getText(writeResult)).toContain('Written to w.graph');
  });

  it('import_drawio should import and return graph document', async () => {
    const drawioXml = `<?xml version="1.0" encoding="UTF-8"?>
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="2" value="Hello" style="rounded=1;" vertex="1" parent="1">
      <mxGeometry x="10" y="20" width="120" height="60" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>`;
    const result = await client.callTool({
      name: 'import_drawio',
      arguments: { path: 'imported.graph', drawioContent: drawioXml },
    });
    const doc = JSON.parse(getText(result));
    expect(doc).toBeDefined();
    expect(doc.nodes).toBeDefined();
  });
});
