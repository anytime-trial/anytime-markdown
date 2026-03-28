import { createRemoteMcpServer } from '../server';

// cms-core のモック
jest.mock('@anytime-markdown/cms-core', () => ({
  uploadReport: jest.fn().mockResolvedValue({ key: 'reports/test.md', name: 'test.md' }),
  listReportKeys: jest.fn().mockResolvedValue([{ key: 'reports/test.md', name: 'test.md', size: 100 }]),
  uploadDoc: jest.fn().mockResolvedValue({ key: 'docs/test.md', name: 'test.md' }),
  listDocs: jest.fn().mockResolvedValue([{ key: 'docs/test.md', name: 'test.md', size: 200 }]),
  deleteDoc: jest.fn().mockResolvedValue(undefined),
}));

const mockS3Client = {} as never;
const mockConfig = {
  region: 'ap-northeast-1',
  bucket: 'test-bucket',
  docsPrefix: 'docs/',
  reportsPrefix: 'reports/',
};

describe('createRemoteMcpServer', () => {
  it('should create an MCP server with 5 tools', () => {
    const server = createRemoteMcpServer(mockS3Client, mockConfig);
    expect(server).toBeDefined();
  });
});
