import fs from 'node:fs';
import path from 'node:path';
import type { CodeGraphEdge } from './CodeGraph.types';

const IMPORT_RE = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;

export class GraphExtractor {
  constructor(private readonly rootPath: string) {}

  extractFromFile(filePath: string): Omit<CodeGraphEdge, 'crossRepo'>[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceId = this.toNodeId(filePath);
    const edges: Omit<CodeGraphEdge, 'crossRepo'>[] = [];
    const dir = path.dirname(filePath);

    for (const match of content.matchAll(IMPORT_RE)) {
      const resolved = this.resolve(dir, match[1]);
      if (resolved) {
        edges.push({
          source: sourceId,
          target: this.toNodeId(resolved),
          confidence: 'EXTRACTED',
          confidence_score: 1.0,
        });
      }
    }
    return edges;
  }

  toNodeId(filePath: string): string {
    return path.relative(this.rootPath, filePath).replace(/\.(tsx?|mdx?)$/, '');
  }

  private resolve(dir: string, importPath: string): string | null {
    const candidates = [
      importPath,
      `${importPath}.ts`,
      `${importPath}.tsx`,
      `${importPath}/index.ts`,
      `${importPath}/index.tsx`,
    ];
    for (const candidate of candidates) {
      const abs = path.resolve(dir, candidate);
      if (fs.existsSync(abs)) return abs;
    }
    return null;
  }
}
