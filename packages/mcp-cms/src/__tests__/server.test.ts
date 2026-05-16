import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// cms-core をモック。createMcpServer 内の createS3Client は実 AWS SDK を呼ぶため、
// S3Client を返す前にここでスタブ化する。
jest.mock('@anytime-markdown/cms-core', () => ({
  createCmsConfig: jest.fn(() => ({
    region: 'ap-northeast-1',
    bucket: 'test-bucket',
    docsPrefix: 'docs/',
    reportsPrefix: 'reports/',
  })),
  createS3Client: jest.fn(() => ({})),
  uploadReport: jest.fn().mockResolvedValue({ key: 'reports/test.md', name: 'test.md' }),
  listReportKeys: jest.fn().mockResolvedValue([
    { key: 'reports/a.md', name: 'a.md', size: 100, lastModified: '2026-05-15T00:00:00.000Z' },
  ]),
  uploadDoc: jest.fn().mockResolvedValue({ key: 'docs/test.md', name: 'test.md' }),
  listDocs: jest.fn().mockResolvedValue([
    { key: 'docs/a.md', name: 'a.md', size: 200, lastModified: '2026-05-15T00:00:00.000Z' },
  ]),
  deleteDoc: jest.fn().mockResolvedValue(undefined),
}));

import { createMcpServer } from '../server';
import * as cmsCore from '@anytime-markdown/cms-core';

describe('mcp-cms integration', () => {
  let tmpDir: string;
  let client: Client;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-cms-int-'));
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
    // 直前ケースの mock 呼び出し履歴をクリア
    (cmsCore.uploadReport as jest.Mock).mockClear();
    (cmsCore.listReportKeys as jest.Mock).mockClear();
    (cmsCore.uploadDoc as jest.Mock).mockClear();
    (cmsCore.listDocs as jest.Mock).mockClear();
    (cmsCore.deleteDoc as jest.Mock).mockClear();
  });

  afterEach(async () => {
    await client.close();
    await fs.rm(tmpDir, { recursive: true });
  });

  test('lists all 5 tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['upload_report', 'list_reports', 'upload_doc', 'list_docs', 'delete_doc']),
    );
    expect(tools).toHaveLength(5);
  });

  test('upload_report reads file content and calls uploadReport', async () => {
    const reportPath = path.join(tmpDir, 'report.md');
    await fs.writeFile(reportPath, '# Report');

    const result = await client.callTool({ name: 'upload_report', arguments: { filePath: reportPath } });
    expect(result.isError).not.toBe(true);

    expect(cmsCore.uploadReport).toHaveBeenCalledTimes(1);
    const callArgs = (cmsCore.uploadReport as jest.Mock).mock.calls[0][0];
    expect(callArgs.fileName).toBe('report.md');
    expect(callArgs.content).toBe('# Report');
  });

  test('list_reports returns JSON-serialized array', async () => {
    const result = await client.callTool({ name: 'list_reports', arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe('a.md');
  });

  test('upload_doc reads .md file as utf-8 text', async () => {
    const docPath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(docPath, '# Doc');

    await client.callTool({ name: 'upload_doc', arguments: { filePath: docPath, folder: 'sub' } });

    expect(cmsCore.uploadDoc).toHaveBeenCalledTimes(1);
    const callArgs = (cmsCore.uploadDoc as jest.Mock).mock.calls[0][0];
    expect(callArgs.fileName).toBe('doc.md');
    expect(callArgs.content).toBe('# Doc');
    expect(callArgs.folder).toBe('sub');
  });

  test('upload_doc reads non-md file as Buffer (image path)', async () => {
    const imgPath = path.join(tmpDir, 'image.png');
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    await fs.writeFile(imgPath, buf);

    await client.callTool({ name: 'upload_doc', arguments: { filePath: imgPath } });

    expect(cmsCore.uploadDoc).toHaveBeenCalledTimes(1);
    const callArgs = (cmsCore.uploadDoc as jest.Mock).mock.calls[0][0];
    expect(callArgs.fileName).toBe('image.png');
    expect(Buffer.isBuffer(callArgs.content)).toBe(true);
    expect((callArgs.content as Buffer).equals(buf)).toBe(true);
  });

  test('list_docs returns JSON-serialized array', async () => {
    const result = await client.callTool({ name: 'list_docs', arguments: {} });
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed[0].key).toBe('docs/a.md');
  });

  test('delete_doc passes key through', async () => {
    const result = await client.callTool({ name: 'delete_doc', arguments: { key: 'docs/old.md' } });
    expect(cmsCore.deleteDoc).toHaveBeenCalledTimes(1);
    expect((cmsCore.deleteDoc as jest.Mock).mock.calls[0][0]).toEqual({ key: 'docs/old.md' });
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed).toEqual({ deleted: true, key: 'docs/old.md' });
  });

  test('upload_report surfaces fs errors as MCP error result', async () => {
    const result = await client.callTool({
      name: 'upload_report',
      arguments: { filePath: path.join(tmpDir, 'missing.md') },
    });
    expect(result.isError).toBe(true);
  });
});
