import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../server';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('mcp-markdown integration', () => {
  let tmpDir: string;
  let client: Client;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-int-'));
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

  it('should list all 7 tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('read_markdown');
    expect(names).toContain('write_markdown');
    expect(names).toContain('get_outline');
    expect(names).toContain('get_section');
    expect(names).toContain('update_section');
    expect(names).toContain('sanitize_markdown');
    expect(names).toContain('compute_diff');
    expect(tools).toHaveLength(7);
  });

  it('should write and read markdown', async () => {
    await client.callTool({ name: 'write_markdown', arguments: { path: 'test.md', content: '# Hello' } });
    const result = await client.callTool({ name: 'read_markdown', arguments: { path: 'test.md' } });
    expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('# Hello');
  });

  it('should get outline', async () => {
    await fs.writeFile(path.join(tmpDir, 'doc.md'), '# Title\n## Sub A\n## Sub B\n');
    const result = await client.callTool({ name: 'get_outline', arguments: { path: 'doc.md' } });
    const outline = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(outline).toHaveLength(3);
    expect(outline[0].text).toBe('Title');
    expect(outline[1].text).toBe('Sub A');
  });

  it('should get and update section', async () => {
    await fs.writeFile(path.join(tmpDir, 'doc.md'), '# Title\n\n## A\n\nOld\n\n## B\n\nKeep\n');

    const section = await client.callTool({ name: 'get_section', arguments: { path: 'doc.md', heading: '## A' } });
    expect((section.content as Array<{ type: string; text: string }>)[0].text).toContain('Old');

    await client.callTool({
      name: 'update_section',
      arguments: { path: 'doc.md', heading: '## A', content: '## A\n\nNew\n\n' },
    });

    const updated = await fs.readFile(path.join(tmpDir, 'doc.md'), 'utf-8');
    expect(updated).toContain('New');
    expect(updated).not.toContain('Old');
    expect(updated).toContain('Keep');
  });

  it('should compute diff', async () => {
    const result = await client.callTool({
      name: 'compute_diff',
      arguments: { contentA: '# A\nold\n', contentB: '# A\nnew\n' },
    });
    const diff = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(diff.blocks.length).toBeGreaterThan(0);
  });

  it('should return error for non-existent file', async () => {
    const result = await client.callTool({ name: 'read_markdown', arguments: { path: 'missing.md' } });
    expect(result.isError).toBe(true);
  });

  it('should return error for path traversal', async () => {
    const result = await client.callTool({ name: 'read_markdown', arguments: { path: '../evil.md' } });
    expect(result.isError).toBe(true);
  });
});
