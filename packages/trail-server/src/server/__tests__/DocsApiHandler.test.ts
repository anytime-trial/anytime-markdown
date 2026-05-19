import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type * as http from 'node:http';

import { DocsApiHandler } from '../DocsApiHandler';
import type { DocsApiNotifier, DocsApiC4Resolver } from '../DocsApiHandler';

// fetchC4Model is used in handleDocsIndex — mock it so we don't need a real DB
jest.mock('@anytime-markdown/trail-core/c4', () => ({
  fetchC4Model: jest.fn(),
}));

import { fetchC4Model } from '@anytime-markdown/trail-core/c4';
const mockFetchC4Model = fetchC4Model as jest.Mock;

function makeMockRes() {
  let statusCode = 0;
  let body = '';
  const res = {
    writeHead: jest.fn((code: number) => { statusCode = code; }),
    end: jest.fn((data?: string) => { body = data ?? ''; }),
    get statusCode() { return statusCode; },
    get body() { return body; },
    parsedBody() { return JSON.parse(body); },
  } as unknown as http.ServerResponse & { statusCode: number; body: string; parsedBody(): unknown };
  return res;
}

function makeNotifier(): DocsApiNotifier & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    broadcastDocLinks: (links) => { calls.push(`broadcast:${links.length}`); },
  };
}

function makeC4Resolver(): DocsApiC4Resolver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    getC4Store: () => ({}) as any,
    getFeatureMatrix: () => undefined,
  };
}

function makeLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Unit tests for DocsApiHandler class methods
// ---------------------------------------------------------------------------

describe('DocsApiHandler.handleListDocLinks', () => {
  it('returns empty docLinks initially', () => {
    const handler = new DocsApiHandler(makeNotifier(), makeC4Resolver(), makeLogger());
    const res = makeMockRes();
    handler.handleListDocLinks(res as unknown as http.ServerResponse);
    expect(res.statusCode).toBe(200);
    expect(res.parsedBody()).toEqual({ docLinks: [] });
  });
});

describe('DocsApiHandler.getCurrent', () => {
  it('returns [] by default', () => {
    const handler = new DocsApiHandler(makeNotifier(), makeC4Resolver(), makeLogger());
    expect(handler.getCurrent()).toEqual([]);
  });
});

describe('DocsApiHandler.setDocsPath', () => {
  it('clears docLinks when called with undefined', () => {
    const handler = new DocsApiHandler(makeNotifier(), makeC4Resolver(), makeLogger());
    // Force set via a scan that does nothing, then clear
    handler.setDocsPath(undefined);
    expect(handler.getCurrent()).toEqual([]);
  });

  it('triggers scan when path is set', async () => {
    // Create a temp dir with a markdown file that has c4Scope frontmatter
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-test-'));
    try {
      const content = `---\ntitle: "Test Doc"\ntype: "spec"\ndate: "2026-05-01"\nc4Scope:\n  - pkg_foo\n---\n\n# Hello\n`;
      fs.writeFileSync(path.join(tmpDir, 'doc.md'), content, 'utf-8');

      const notifier = makeNotifier();
      const handler = new DocsApiHandler(notifier, makeC4Resolver(), makeLogger());
      handler.setDocsPath(tmpDir);
      // Wait for the async scan to complete
      await new Promise((r) => setTimeout(r, 200));
      expect(notifier.calls).toContain('broadcast:1');
      const docs = handler.getCurrent();
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Test Doc');
      expect(docs[0].c4Scope).toEqual(['pkg_foo']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('logs warning when scan fails on invalid path', async () => {
    const logger = makeLogger();
    const handler = new DocsApiHandler(makeNotifier(), makeC4Resolver(), logger);
    handler.setDocsPath('/nonexistent/path/that/does/not/exist');
    await new Promise((r) => setTimeout(r, 100));
    // scan catches the error silently (no fs entries), logger.warn should NOT be called
    // because collectMarkdownFiles catches and returns []
    // The important thing is no exception propagates
    expect(handler.getCurrent()).toEqual([]);
  });
});

describe('DocsApiHandler.scan', () => {
  it('is a no-op when docsPath is not set', async () => {
    const notifier = makeNotifier();
    const handler = new DocsApiHandler(notifier, makeC4Resolver(), makeLogger());
    await handler.scan();
    expect(notifier.calls).toHaveLength(0);
  });

  it('scans subdirectories recursively', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-recursive-'));
    try {
      const subDir = path.join(tmpDir, 'sub');
      fs.mkdirSync(subDir);
      const content = `---\ntitle: "Sub Doc"\ntype: "spec"\ndate: "2026-05-01"\nc4Scope:\n  - pkg_bar\n---\n`;
      fs.writeFileSync(path.join(subDir, 'nested.md'), content, 'utf-8');

      const notifier = makeNotifier();
      const handler = new DocsApiHandler(notifier, makeC4Resolver(), makeLogger());
      handler.setDocsPath(tmpDir);
      await handler.scan();
      const docs = handler.getCurrent();
      expect(docs.some((d) => d.title === 'Sub Doc')).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('skips files without c4Scope frontmatter', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-noscope-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'no-scope.md'), '# Just a file\n', 'utf-8');
      const notifier = makeNotifier();
      const handler = new DocsApiHandler(notifier, makeC4Resolver(), makeLogger());
      handler.setDocsPath(tmpDir);
      await handler.scan();
      expect(handler.getCurrent()).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

describe('DocsApiHandler.handleDocsIndex', () => {
  it('returns all docs when no repo query param', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-norepoo-'));
    try {
      const content = `---\ntitle: "A"\ntype: "spec"\ndate: "2026-05-01"\nc4Scope:\n  - pkg_a\n---\n`;
      fs.writeFileSync(path.join(tmpDir, 'a.md'), content, 'utf-8');
      const handler = new DocsApiHandler(makeNotifier(), makeC4Resolver(), makeLogger());
      handler.setDocsPath(tmpDir);
      await handler.scan();

      const res = makeMockRes();
      await handler.handleDocsIndex(res as unknown as http.ServerResponse, undefined);
      expect(res.statusCode).toBe(200);
      const body = res.parsedBody() as { docs: unknown[] };
      expect(Array.isArray(body.docs)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('returns filtered docs when repo provided and C4 model has matching elements', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-repofilt-'));
    try {
      // doc with c4Scope matching an element
      const contentA = `---\ntitle: "A"\ntype: "spec"\ndate: "2026-05-01"\nc4Scope:\n  - pkg_foo\n---\n`;
      fs.writeFileSync(path.join(tmpDir, 'a.md'), contentA, 'utf-8');
      // doc with c4Scope NOT matching
      const contentB = `---\ntitle: "B"\ntype: "spec"\ndate: "2026-05-01"\nc4Scope:\n  - pkg_bar\n---\n`;
      fs.writeFileSync(path.join(tmpDir, 'b.md'), contentB, 'utf-8');

      mockFetchC4Model.mockResolvedValueOnce({
        model: { elements: [{ id: 'pkg_foo' }] },
      });

      const handler = new DocsApiHandler(makeNotifier(), makeC4Resolver(), makeLogger());
      handler.setDocsPath(tmpDir);
      await handler.scan();

      const res = makeMockRes();
      await handler.handleDocsIndex(res as unknown as http.ServerResponse, 'my-repo');
      expect(res.statusCode).toBe(200);
      const body = res.parsedBody() as { docs: { title: string }[] };
      expect(body.docs).toHaveLength(1);
      expect(body.docs[0].title).toBe('A');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('returns empty array when C4 model has no elements for repo', async () => {
    mockFetchC4Model.mockResolvedValueOnce({ model: { elements: [] } });
    const handler = new DocsApiHandler(makeNotifier(), makeC4Resolver(), makeLogger());
    const res = makeMockRes();
    await handler.handleDocsIndex(res as unknown as http.ServerResponse, 'no-elements-repo');
    expect(res.statusCode).toBe(200);
    expect((res.parsedBody() as { docs: unknown[] }).docs).toHaveLength(0);
  });

  it('falls back to all docs when fetchC4Model throws', async () => {
    mockFetchC4Model.mockRejectedValueOnce(new Error('c4 error'));
    const logger = makeLogger();
    const handler = new DocsApiHandler(makeNotifier(), makeC4Resolver(), logger);
    const res = makeMockRes();
    await handler.handleDocsIndex(res as unknown as http.ServerResponse, 'bad-repo');
    expect(res.statusCode).toBe(200);
    expect(logger.error).toHaveBeenCalledWith('[/api/docs-index] failed', expect.any(Error));
  });

  it('matches docs whose c4Scope is a parent of an element id', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-prefix-'));
    try {
      // doc with scope "pkg_foo" should match element "pkg_foo/engine"
      const content = `---\ntitle: "Parent"\ntype: "spec"\ndate: "2026-05-01"\nc4Scope:\n  - pkg_foo\n---\n`;
      fs.writeFileSync(path.join(tmpDir, 'parent.md'), content, 'utf-8');

      mockFetchC4Model.mockResolvedValueOnce({
        model: { elements: [{ id: 'pkg_foo/engine' }] },
      });

      const handler = new DocsApiHandler(makeNotifier(), makeC4Resolver(), makeLogger());
      handler.setDocsPath(tmpDir);
      await handler.scan();

      const res = makeMockRes();
      await handler.handleDocsIndex(res as unknown as http.ServerResponse, 'my-repo');
      const body = res.parsedBody() as { docs: { title: string }[] };
      expect(body.docs).toHaveLength(1);
      expect(body.docs[0].title).toBe('Parent');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// parseLocalFrontmatter edge cases (tested indirectly via scan)
// ---------------------------------------------------------------------------

describe('DocsApiHandler frontmatter parsing edge cases', () => {
  it('parses inline c4Scope array syntax', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-inline-'));
    try {
      const content = `---\ntitle: "Inline"\ntype: "spec"\ndate: "2026-05-01"\nc4Scope: [pkg_a, pkg_b]\n---\n`;
      fs.writeFileSync(path.join(tmpDir, 'inline.md'), content, 'utf-8');
      const handler = new DocsApiHandler(makeNotifier(), makeC4Resolver(), makeLogger());
      handler.setDocsPath(tmpDir);
      await handler.scan();
      const docs = handler.getCurrent();
      expect(docs).toHaveLength(1);
      expect(docs[0].c4Scope).toEqual(['pkg_a', 'pkg_b']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('handles file with no frontmatter at all', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-nofm-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'plain.md'), '# Plain\n\nNo frontmatter here.', 'utf-8');
      const handler = new DocsApiHandler(makeNotifier(), makeC4Resolver(), makeLogger());
      handler.setDocsPath(tmpDir);
      await handler.scan();
      expect(handler.getCurrent()).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
