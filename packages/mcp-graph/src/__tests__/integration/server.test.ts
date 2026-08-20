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

  it('should list all 8 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(8);
    const names = tools.map((t) => t.name);
    expect(names).toContain('read_graph');
    expect(names).toContain('write_graph');
    expect(names).toContain('export_svg');
    expect(names).toContain('export_drawio');
    expect(names).toContain('import_drawio');
    expect(names).toContain('batch_import');
    expect(names).toContain('write_cooccurrence');
    expect(names).toContain('read_cooccurrence');
  });

  it('should batch import a graph and export it', async () => {
    await client.callTool({
      name: 'batch_import',
      arguments: {
        path: 'test.graph',
        name: 'E2E',
        nodes: [{ id: 'start', text: 'Start' }, { id: 'end', text: 'End' }],
        edges: [{ fromId: 'start', toId: 'end' }],
      },
    });

    // Export SVG
    const svgResult = await client.callTool({ name: 'export_svg', arguments: { path: 'test.graph' } });
    expect(getText(svgResult)).toContain('<svg');

    // Export draw.io
    const drawioResult = await client.callTool({ name: 'export_drawio', arguments: { path: 'test.graph' } });
    expect(getText(drawioResult)).toContain('mxGraphModel');
  });

  it('should return error for non-existent file', async () => {
    const result = await client.callTool({ name: 'read_graph', arguments: { path: 'missing.graph' } });
    expect(result.isError).toBe(true);
  });

  it('should return error for path traversal', async () => {
    const result = await client.callTool({ name: 'read_graph', arguments: { path: '../evil.graph' } });
    expect(result.isError).toBe(true);
  });
});
