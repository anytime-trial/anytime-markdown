import { classifyLayer } from '../layers';
import type { ModuleManifest } from '../types';

describe('classifyLayer', () => {
  it('classifies a VS Code extension as presentation-extension (engine wins over name)', () => {
    const r = classifyLayer({ name: 'anytime-trail', engines: { vscode: '^1.90.0' } });
    expect(r.layer).toBe('presentation-extension');
    expect(r.confidence).toBe(0.9);
    expect(r.evidence[0]).toMatch(/vscode/i);
  });

  it('classifies *-server as service-server before integration even with mcp-sdk', () => {
    const r = classifyLayer({
      name: '@anytime-markdown/trail-server',
      dependencies: { '@modelcontextprotocol/sdk': '1.0.0' },
    });
    expect(r.layer).toBe('service-server');
  });

  it('classifies an mcp-* module with the SDK as integration (strong)', () => {
    const r = classifyLayer({
      name: '@anytime-markdown/mcp-trail',
      dependencies: { '@modelcontextprotocol/sdk': '1.0.0' },
    });
    expect(r.layer).toBe('integration');
    expect(r.confidence).toBe(0.9);
  });

  it('classifies a Next.js web app as presentation-ui', () => {
    const r = classifyLayer({ name: 'web-app', dependencies: { next: '15.0.0', react: '18.0.0' } });
    expect(r.layer).toBe('presentation-ui');
  });

  it('classifies a tree-sitter module as analysis (strong)', () => {
    const r = classifyLayer({
      name: '@anytime-markdown/code-analysis-python',
      dependencies: { 'web-tree-sitter': '0.22.0' },
    });
    expect(r.layer).toBe('analysis');
    expect(r.confidence).toBe(0.9);
  });

  it('classifies ts-compiler via marker as analysis with high confidence (PoC #1 regression)', () => {
    const withMarker = classifyLayer({
      name: '@anytime-markdown/code-analysis-typescript',
      devDependencies: { typescript: '6.0.3' },
      markers: ['ts-compiler-import'],
    });
    const nameOnly = classifyLayer({ name: '@anytime-markdown/code-analysis-core' });
    expect(withMarker.layer).toBe('analysis');
    expect(nameOnly.layer).toBe('analysis');
    // marker-backed detection must outrank name-only detection
    expect(withMarker.confidence).toBeGreaterThan(nameOnly.confidence);
  });

  it('classifies a SQLite module as data (strong)', () => {
    const r = classifyLayer({
      name: '@anytime-markdown/memory-core',
      dependencies: { 'better-sqlite3': '11.0.0' },
    });
    expect(r.layer).toBe('data');
    expect(r.confidence).toBe(0.9);
  });

  it('classifies a data *-core module by name with medium confidence', () => {
    const r = classifyLayer({ name: '@anytime-markdown/trail-core' });
    expect(r.layer).toBe('data');
    expect(r.confidence).toBe(0.6);
  });

  it('classifies an AI/agent module as service-domain', () => {
    expect(classifyLayer({ name: '@anytime-markdown/agent-core' }).layer).toBe('service-domain');
    expect(classifyLayer({ name: '@anytime-markdown/ollama-core', dependencies: { ollama: '0.5.0' } }).layer).toBe(
      'service-domain',
    );
  });

  it('classifies *-core render primitives as foundation', () => {
    expect(classifyLayer({ name: '@anytime-markdown/ui-core' }).layer).toBe('foundation');
    expect(classifyLayer({ name: '@anytime-markdown/graph-core' }).layer).toBe('foundation');
  });

  it('classifies a render-only library without -core suffix as foundation', () => {
    const r = classifyLayer({
      name: '@anytime-markdown/markdown-rich',
      dependencies: { katex: '0.16.0' },
    });
    expect(r.layer).toBe('foundation');
  });

  it('falls back to utility with low confidence when no signal matches', () => {
    const r = classifyLayer({ name: '@anytime-markdown/vscode-common' });
    expect(r.layer).toBe('utility');
    expect(r.confidence).toBe(0.3);
  });

  it('always echoes the original module name and attaches frameworks', () => {
    const r = classifyLayer({ name: 'web-app', dependencies: { next: '15.0.0' } });
    expect(r.name).toBe('web-app');
    expect(r.frameworks.map((f) => f.id)).toContain('nextjs');
  });
});
