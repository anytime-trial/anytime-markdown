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

  it('read_graph should return graph document', async () => {
    await client.callTool({ name: 'create_graph', arguments: { path: 'r.graph', name: 'R' } });
    const result = await client.callTool({ name: 'read_graph', arguments: { path: 'r.graph' } });
    const doc = JSON.parse(getText(result));
    expect(doc.name).toBe('R');
  });

  it('write_graph should write and return confirmation', async () => {
    await client.callTool({ name: 'create_graph', arguments: { path: 'w.graph', name: 'W' } });
    const readResult = await client.callTool({ name: 'read_graph', arguments: { path: 'w.graph' } });
    const doc = JSON.parse(getText(readResult));
    doc.name = 'Updated';
    const writeResult = await client.callTool({
      name: 'write_graph',
      arguments: { path: 'w.graph', document: JSON.stringify(doc) },
    });
    expect(getText(writeResult)).toContain('Written to w.graph');
  });

  it('update_node should update and return updated node', async () => {
    await client.callTool({ name: 'create_graph', arguments: { path: 'u.graph', name: 'U' } });
    const addResult = await client.callTool({
      name: 'add_node',
      arguments: { path: 'u.graph', type: 'rect', x: 0, y: 0, text: 'Before' },
    });
    const node = JSON.parse(getText(addResult));
    const updateResult = await client.callTool({
      name: 'update_node',
      arguments: { path: 'u.graph', nodeId: node.id, changes: JSON.stringify({ text: 'After' }) },
    });
    const updated = JSON.parse(getText(updateResult));
    expect(updated.text).toBe('After');
  });

  it('remove_node should remove and return confirmation', async () => {
    await client.callTool({ name: 'create_graph', arguments: { path: 'rn.graph', name: 'RN' } });
    const addResult = await client.callTool({
      name: 'add_node',
      arguments: { path: 'rn.graph', type: 'rect', x: 0, y: 0 },
    });
    const node = JSON.parse(getText(addResult));
    const removeResult = await client.callTool({
      name: 'remove_node',
      arguments: { path: 'rn.graph', nodeId: node.id },
    });
    expect(getText(removeResult)).toContain(`Removed node ${node.id}`);
  });

  it('remove_edge should remove and return confirmation', async () => {
    await client.callTool({ name: 'create_graph', arguments: { path: 're.graph', name: 'RE' } });
    const n1 = JSON.parse(
      getText(
        await client.callTool({ name: 'add_node', arguments: { path: 're.graph', type: 'rect', x: 0, y: 0 } }),
      ),
    );
    const n2 = JSON.parse(
      getText(
        await client.callTool({ name: 'add_node', arguments: { path: 're.graph', type: 'rect', x: 200, y: 0 } }),
      ),
    );
    const edge = JSON.parse(
      getText(
        await client.callTool({
          name: 'add_edge',
          arguments: {
            path: 're.graph',
            type: 'arrow',
            from: { nodeId: n1.id, x: 0, y: 0 },
            to: { nodeId: n2.id, x: 0, y: 0 },
          },
        }),
      ),
    );
    const removeResult = await client.callTool({
      name: 'remove_edge',
      arguments: { path: 're.graph', edgeId: edge.id },
    });
    expect(getText(removeResult)).toContain(`Removed edge ${edge.id}`);
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
