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

  it('should list all 10 tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    // editor tools
    expect(names).toContain('get_outline');
    expect(names).toContain('get_section');
    expect(names).toContain('update_section');
    expect(names).toContain('format_markdown');
    // markdown-catalog search tools
    expect(names).toContain('search_docs');
    expect(names).toContain('search_sections');
    expect(names).toContain('doc_backlinks');
    expect(names).toContain('doc_neighbors');
    // markdown helper tools (Phase 2)
    expect(names).toContain('get_frontmatter');
    expect(names).toContain('update_frontmatter');
    expect(tools).toHaveLength(10);
  });

  it('should get and update frontmatter without touching the body', async () => {
    await fs.writeFile(path.join(tmpDir, 'fm.md'), '---\ntitle: T\nstatus: draft\n---\n\nbody stays\n');

    const got = await client.callTool({ name: 'get_frontmatter', arguments: { path: 'fm.md' } });
    const data = JSON.parse((got.content as Array<{ type: string; text: string }>)[0].text);
    expect(data.status).toBe('draft');

    await client.callTool({
      name: 'update_frontmatter',
      arguments: { path: 'fm.md', set: { status: 'published' }, removeKeys: [] },
    });
    const updated = await fs.readFile(path.join(tmpDir, 'fm.md'), 'utf-8');
    expect(updated).toContain('status: published');
    expect(updated).toContain('body stays');
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

});
