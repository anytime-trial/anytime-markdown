import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../server';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('mcp-graph integration', () => {
  let tmpDir: string;
  let client: Client;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-int-'));
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

  it('should list all 12 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(12);
    const names = tools.map((t) => t.name);
    expect(names).toContain('read_graph');
    expect(names).toContain('write_graph');
    expect(names).toContain('create_graph');
    expect(names).toContain('add_node');
    expect(names).toContain('update_node');
    expect(names).toContain('remove_node');
    expect(names).toContain('add_edge');
    expect(names).toContain('remove_edge');
    expect(names).toContain('list_nodes');
    expect(names).toContain('export_svg');
    expect(names).toContain('export_drawio');
    expect(names).toContain('import_drawio');
  });

  it('should create graph, add nodes, add edge, export SVG', async () => {
    // Create
    await client.callTool({ name: 'create_graph', arguments: { path: 'test.graph.json', name: 'E2E' } });

    // Add nodes
    const n1Result = await client.callTool({
      name: 'add_node',
      arguments: { path: 'test.graph.json', type: 'rect', x: 0, y: 0, text: 'Start' },
    });
    const n1 = JSON.parse(getText(n1Result));

    const n2Result = await client.callTool({
      name: 'add_node',
      arguments: { path: 'test.graph.json', type: 'rect', x: 200, y: 0, text: 'End' },
    });
    const n2 = JSON.parse(getText(n2Result));

    // Add edge
    await client.callTool({
      name: 'add_edge',
      arguments: {
        path: 'test.graph.json',
        type: 'arrow',
        from: { nodeId: n1.id, x: 0, y: 0 },
        to: { nodeId: n2.id, x: 0, y: 0 },
      },
    });

    // List nodes
    const listResult = await client.callTool({ name: 'list_nodes', arguments: { path: 'test.graph.json' } });
    const nodes = JSON.parse(getText(listResult));
    expect(nodes).toHaveLength(2);

    // Export SVG
    const svgResult = await client.callTool({ name: 'export_svg', arguments: { path: 'test.graph.json' } });
    expect(getText(svgResult)).toContain('<svg');

    // Export draw.io
    const drawioResult = await client.callTool({ name: 'export_drawio', arguments: { path: 'test.graph.json' } });
    expect(getText(drawioResult)).toContain('mxGraphModel');
  });

  it('should return error for non-existent file', async () => {
    const result = await client.callTool({ name: 'read_graph', arguments: { path: 'missing.graph.json' } });
    expect(result.isError).toBe(true);
  });

  it('should return error for path traversal', async () => {
    const result = await client.callTool({ name: 'read_graph', arguments: { path: '../evil.graph.json' } });
    expect(result.isError).toBe(true);
  });
});
