# Code Graph 機能 実装プラン

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** trail viewer に「Graph」タブを追加し、anytime-markdown と docs リポジトリを横断したコード依存グラフを可視化・検索できるようにする。

**Architecture:** 独自スキル `/build-code-graph` が Claude Code として解析を実行し `graph.json` を生成する。VS Code 拡張機能がそのファイルを読み込んで HTTP + WebSocket で trail viewer に提供する。trail viewer は sigma.js で WebGL レンダリングする。

**Tech Stack:** graphology, graphology-communities-louvain, graphology-layout-forceatlas2（Extension 側）/ sigma.js（trail-viewer UI 側）/ Node.js http + ws（既存サーバー）

**設計ドキュメント:** `plan/2026-04-27-code-graph.md`

---

## Task 1: 型定義ファイルの作成

**Files:**
- Create: `packages/vscode-trail-extension/src/graph/CodeGraph.types.ts`

**Step 1: ファイルを作成**

```typescript
// packages/vscode-trail-extension/src/graph/CodeGraph.types.ts

export interface CodeGraphRepository {
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

export type EdgeConfidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

export interface CodeGraphNode {
  readonly id: string;
  readonly label: string;
  readonly repo: string;
  readonly package: string;
  readonly fileType: 'code' | 'document';
  readonly community: number;
  readonly communityLabel: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface CodeGraphEdge {
  readonly source: string;
  readonly target: string;
  readonly confidence: EdgeConfidence;
  readonly confidence_score: number;
  readonly crossRepo: boolean;
}

export interface CodeGraph {
  readonly generatedAt: string;
  readonly repositories: readonly CodeGraphRepository[];
  readonly nodes: readonly CodeGraphNode[];
  readonly edges: readonly CodeGraphEdge[];
  readonly communities: Record<number, string>;
  readonly godNodes: readonly string[];
}

export interface CodeGraphQueryResult {
  readonly nodes: readonly string[];
  readonly edges: Array<{ source: string; target: string }>;
}

export interface CodeGraphExplainResult {
  readonly node: CodeGraphNode;
  readonly incoming: readonly CodeGraphEdge[];
  readonly outgoing: readonly CodeGraphEdge[];
}

export interface CodeGraphPathResult {
  readonly found: boolean;
  readonly path: readonly string[];
  readonly hops: number;
}
```

**Step 2: コミット**

```bash
git add packages/vscode-trail-extension/src/graph/CodeGraph.types.ts
git commit -m "feat(trail): add CodeGraph type definitions"
```

---

## Task 2: VS Code 設定スキーマの追加

**Files:**
- Modify: `packages/vscode-trail-extension/package.json`

**Step 1: `contributes.configuration.properties` に以下を追加**

既存の `"anytimeTrail.docsPath"` の直後に追記する。

```json
"anytimeTrail.codeGraph.outputDir": {
  "type": "string",
  "default": "${workspaceFolder}/.vscode/graphify-out",
  "markdownDescription": "コードグラフの出力先ディレクトリ。`${workspaceFolder}` を使用可能。"
},
"anytimeTrail.codeGraph.repositories": {
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "label": { "type": "string" }
    },
    "required": ["path", "label"]
  },
  "default": [],
  "markdownDescription": "解析対象リポジトリのリスト。`path`（絶対パス）と `label`（表示名）を指定する。"
},
"anytimeTrail.codeGraph.autoRefresh": {
  "type": "boolean",
  "default": false,
  "markdownDescription": "拡張機能起動時にコードグラフを自動生成する。"
}
```

**Step 2: ビルド確認**

```bash
cd packages/vscode-trail-extension && npm run compile
```

期待: エラーなし

**Step 3: コミット**

```bash
git add packages/vscode-trail-extension/package.json
git commit -m "feat(trail): add codeGraph VS Code settings schema"
```

---

## Task 3: GraphDetector（ファイル検出）

**Files:**
- Create: `packages/vscode-trail-extension/src/graph/GraphDetector.ts`
- Create: `packages/vscode-trail-extension/src/graph/__tests__/GraphDetector.test.ts`

**Step 1: テストを先に書く**

```typescript
// src/graph/__tests__/GraphDetector.test.ts
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { GraphDetector } from '../GraphDetector';

describe('GraphDetector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-detector-'));
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'src', 'App.tsx'), '');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '');
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'react'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'react', 'index.js'), '');
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }));

  it('detects .ts and .tsx files', () => {
    const detector = new GraphDetector(tmpDir);
    const files = detector.detectCodeFiles();
    expect(files.map(f => path.basename(f))).toEqual(expect.arrayContaining(['index.ts', 'App.tsx']));
  });

  it('detects .md files', () => {
    const detector = new GraphDetector(tmpDir);
    const files = detector.detectDocFiles();
    expect(files.map(f => path.basename(f))).toContain('README.md');
  });

  it('excludes node_modules', () => {
    const detector = new GraphDetector(tmpDir);
    const allFiles = [...detector.detectCodeFiles(), ...detector.detectDocFiles()];
    expect(allFiles.every(f => !f.includes('node_modules'))).toBe(true);
  });
});
```

**Step 2: テストが失敗することを確認**

```bash
cd /anytime-markdown && npx jest --maxWorkers=1 packages/vscode-trail-extension/src/graph/__tests__/GraphDetector.test.ts
```

期待: `Cannot find module '../GraphDetector'`

**Step 3: 実装**

```typescript
// src/graph/GraphDetector.ts
import fs from 'node:fs';
import path from 'node:path';

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.next', 'out', 'build', '.git', 'coverage', '.vscode-test', '__tests__', '.worktrees']);
const CODE_EXTS = new Set(['.ts', '.tsx']);
const DOC_EXTS = new Set(['.md', '.txt']);

export class GraphDetector {
  constructor(private readonly rootPath: string) {}

  detectCodeFiles(): string[] {
    return this.walk(this.rootPath, CODE_EXTS);
  }

  detectDocFiles(): string[] {
    return this.walk(this.rootPath, DOC_EXTS);
  }

  private walk(dir: string, exts: Set<string>): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) {
          results.push(...this.walk(path.join(dir, entry.name), exts));
        }
      } else if (exts.has(path.extname(entry.name))) {
        results.push(path.join(dir, entry.name));
      }
    }
    return results;
  }
}
```

**Step 4: テストが通ることを確認**

```bash
cd /anytime-markdown && npx jest --maxWorkers=1 packages/vscode-trail-extension/src/graph/__tests__/GraphDetector.test.ts
```

期待: `PASS`

**Step 5: コミット**

```bash
git add packages/vscode-trail-extension/src/graph/GraphDetector.ts \
        packages/vscode-trail-extension/src/graph/__tests__/GraphDetector.test.ts
git commit -m "feat(trail): add GraphDetector for file discovery"
```

---

## Task 4: GraphExtractor（import 解析）

**Files:**
- Create: `packages/vscode-trail-extension/src/graph/GraphExtractor.ts`
- Create: `packages/vscode-trail-extension/src/graph/__tests__/GraphExtractor.test.ts`

**Step 1: テストを先に書く**

```typescript
// src/graph/__tests__/GraphExtractor.test.ts
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { GraphExtractor } from '../GraphExtractor';

describe('GraphExtractor', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-extractor-'));
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'App.tsx'),
      `import { useHook } from './hooks/useHook';\nimport React from 'react';\n`);
    fs.writeFileSync(path.join(tmpDir, 'src', 'hooks', 'useHook.ts'), '', { flag: 'w' });
    fs.mkdirSync(path.join(tmpDir, 'src', 'hooks'), { recursive: true });
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true }));

  it('extracts relative imports as EXTRACTED edges', () => {
    const extractor = new GraphExtractor(tmpDir);
    const edges = extractor.extractFromFile(path.join(tmpDir, 'src', 'App.tsx'));
    expect(edges).toContainEqual(expect.objectContaining({
      source: expect.stringContaining('App'),
      target: expect.stringContaining('useHook'),
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
    }));
  });

  it('ignores node_modules imports', () => {
    const extractor = new GraphExtractor(tmpDir);
    const edges = extractor.extractFromFile(path.join(tmpDir, 'src', 'App.tsx'));
    expect(edges.every(e => !e.target.includes('react'))).toBe(true);
  });
});
```

**Step 2: テストが失敗することを確認**

```bash
cd /anytime-markdown && npx jest --maxWorkers=1 packages/vscode-trail-extension/src/graph/__tests__/GraphExtractor.test.ts
```

**Step 3: 実装**

```typescript
// src/graph/GraphExtractor.ts
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
```

**Step 4: テストが通ることを確認**

```bash
cd /anytime-markdown && npx jest --maxWorkers=1 packages/vscode-trail-extension/src/graph/__tests__/GraphExtractor.test.ts
```

**Step 5: コミット**

```bash
git add packages/vscode-trail-extension/src/graph/GraphExtractor.ts \
        packages/vscode-trail-extension/src/graph/__tests__/GraphExtractor.test.ts
git commit -m "feat(trail): add GraphExtractor for import analysis"
```

---

## Task 5: graphology ライブラリ追加 + GraphBuilder

**Files:**
- Modify: `packages/vscode-trail-extension/package.json`
- Create: `packages/vscode-trail-extension/src/graph/GraphBuilder.ts`
- Create: `packages/vscode-trail-extension/src/graph/__tests__/GraphBuilder.test.ts`

**Step 1: ライブラリを追加**

```bash
cd packages/vscode-trail-extension && npm install --save-exact \
  graphology@0.25.6 \
  graphology-communities-louvain@2.0.1 \
  graphology-layout-forceatlas2@0.10.1
```

**Step 2: テストを書く**

```typescript
// src/graph/__tests__/GraphBuilder.test.ts
import { GraphBuilder } from '../GraphBuilder';

describe('GraphBuilder', () => {
  it('builds graph from nodes and edges', () => {
    const builder = new GraphBuilder();
    builder.addNode({ id: 'src/A', label: 'A', repo: 'product', package: 'app', fileType: 'code' });
    builder.addNode({ id: 'src/B', label: 'B', repo: 'product', package: 'app', fileType: 'code' });
    builder.addEdge({ source: 'src/A', target: 'src/B', confidence: 'EXTRACTED', confidence_score: 1.0, crossRepo: false });
    const g = builder.build();
    expect(g.order).toBe(2);
    expect(g.size).toBe(1);
  });

  it('deduplicates edges', () => {
    const builder = new GraphBuilder();
    builder.addNode({ id: 'src/A', label: 'A', repo: 'product', package: 'app', fileType: 'code' });
    builder.addNode({ id: 'src/B', label: 'B', repo: 'product', package: 'app', fileType: 'code' });
    builder.addEdge({ source: 'src/A', target: 'src/B', confidence: 'EXTRACTED', confidence_score: 1.0, crossRepo: false });
    builder.addEdge({ source: 'src/A', target: 'src/B', confidence: 'EXTRACTED', confidence_score: 1.0, crossRepo: false });
    const g = builder.build();
    expect(g.size).toBe(1);
  });

  it('skips edges for unknown nodes', () => {
    const builder = new GraphBuilder();
    builder.addNode({ id: 'src/A', label: 'A', repo: 'product', package: 'app', fileType: 'code' });
    builder.addEdge({ source: 'src/A', target: 'src/UNKNOWN', confidence: 'EXTRACTED', confidence_score: 1.0, crossRepo: false });
    const g = builder.build();
    expect(g.size).toBe(0);
  });
});
```

**Step 3: テストが失敗することを確認**

```bash
cd /anytime-markdown && npx jest --maxWorkers=1 packages/vscode-trail-extension/src/graph/__tests__/GraphBuilder.test.ts
```

**Step 4: 実装**

```typescript
// src/graph/GraphBuilder.ts
import Graph from 'graphology';
import type { CodeGraphNode, CodeGraphEdge } from './CodeGraph.types';

type NodeInput = Omit<CodeGraphNode, 'community' | 'communityLabel' | 'x' | 'y' | 'size'>;
type EdgeInput = CodeGraphEdge;

export class GraphBuilder {
  private readonly nodes = new Map<string, NodeInput>();
  private readonly edges: EdgeInput[] = [];

  addNode(node: NodeInput): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: EdgeInput): void {
    this.edges.push(edge);
  }

  build(): Graph {
    const g = new Graph({ multi: false });
    for (const [id, attrs] of this.nodes) {
      g.addNode(id, { ...attrs, size: 0 });
    }
    for (const edge of this.edges) {
      if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) continue;
      if (g.hasEdge(edge.source, edge.target)) continue;
      g.addEdge(edge.source, edge.target, {
        confidence: edge.confidence,
        confidence_score: edge.confidence_score,
        crossRepo: edge.crossRepo,
      });
      // サイズ = 被 import 数（in-degree）
      g.setNodeAttribute(edge.target, 'size', (g.getNodeAttribute(edge.target, 'size') as number) + 1);
    }
    return g;
  }
}
```

**Step 5: テストが通ることを確認**

```bash
cd /anytime-markdown && npx jest --maxWorkers=1 packages/vscode-trail-extension/src/graph/__tests__/GraphBuilder.test.ts
```

**Step 6: コミット**

```bash
git add packages/vscode-trail-extension/package.json \
        packages/vscode-trail-extension/package-lock.json \
        packages/vscode-trail-extension/src/graph/GraphBuilder.ts \
        packages/vscode-trail-extension/src/graph/__tests__/GraphBuilder.test.ts
git commit -m "feat(trail): add GraphBuilder with graphology"
```

---

## Task 6: GraphClusterer（Louvain クラスタリング）

**Files:**
- Create: `packages/vscode-trail-extension/src/graph/GraphClusterer.ts`
- Create: `packages/vscode-trail-extension/src/graph/__tests__/GraphClusterer.test.ts`

**Step 1: テストを書く**

```typescript
// src/graph/__tests__/GraphClusterer.test.ts
import Graph from 'graphology';
import { GraphClusterer } from '../GraphClusterer';

function makeGraph(nodes: string[], edges: [string, string][]): Graph {
  const g = new Graph();
  nodes.forEach(n => g.addNode(n, { package: 'app', repo: 'product', fileType: 'code', size: 0 }));
  edges.forEach(([s, t]) => g.hasEdge(s, t) || g.addEdge(s, t));
  return g;
}

describe('GraphClusterer', () => {
  it('assigns community to every node', () => {
    const g = makeGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);
    const clusterer = new GraphClusterer();
    const result = clusterer.cluster(g);
    expect(Object.keys(result.communities)).toHaveLength(g.order);
  });

  it('generates a label for each community id', () => {
    const g = makeGraph(['A', 'B'], [['A', 'B']]);
    const clusterer = new GraphClusterer();
    const result = clusterer.cluster(g);
    const communityIds = new Set(Object.values(result.communities));
    communityIds.forEach(id => {
      expect(result.labels[id]).toBeDefined();
    });
  });
});
```

**Step 2: テストが失敗することを確認**

```bash
cd /anytime-markdown && npx jest --maxWorkers=1 packages/vscode-trail-extension/src/graph/__tests__/GraphClusterer.test.ts
```

**Step 3: 実装**

```typescript
// src/graph/GraphClusterer.ts
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';

export interface ClusterResult {
  /** nodeId → communityId */
  readonly communities: Record<string, number>;
  /** communityId → ラベル文字列 */
  readonly labels: Record<number, string>;
}

export class GraphClusterer {
  cluster(graph: Graph): ClusterResult {
    if (graph.order === 0) return { communities: {}, labels: {} };

    const communities: Record<string, number> = louvain(graph) as Record<string, number>;
    const labels = this.buildLabels(graph, communities);
    return { communities, labels };
  }

  private buildLabels(graph: Graph, communities: Record<string, number>): Record<number, string> {
    // コミュニティ内の package 属性を多数決でラベル化
    const votes: Record<number, Record<string, number>> = {};
    graph.forEachNode((node) => {
      const cid = communities[node];
      const pkg = (graph.getNodeAttribute(node, 'package') as string) || 'unknown';
      votes[cid] ??= {};
      votes[cid][pkg] = (votes[cid][pkg] ?? 0) + 1;
    });
    const labels: Record<number, string> = {};
    for (const [cidStr, pkgVotes] of Object.entries(votes)) {
      const cid = Number(cidStr);
      labels[cid] = Object.entries(pkgVotes).sort((a, b) => b[1] - a[1])[0][0];
    }
    return labels;
  }
}
```

**Step 4: テストが通ることを確認**

```bash
cd /anytime-markdown && npx jest --maxWorkers=1 packages/vscode-trail-extension/src/graph/__tests__/GraphClusterer.test.ts
```

**Step 5: コミット**

```bash
git add packages/vscode-trail-extension/src/graph/GraphClusterer.ts \
        packages/vscode-trail-extension/src/graph/__tests__/GraphClusterer.test.ts
git commit -m "feat(trail): add GraphClusterer with Louvain"
```

---

## Task 7: GraphLayout（ForceAtlas2 座標計算）

**Files:**
- Create: `packages/vscode-trail-extension/src/graph/GraphLayout.ts`
- Create: `packages/vscode-trail-extension/src/graph/__tests__/GraphLayout.test.ts`

**Step 1: テストを書く**

```typescript
// src/graph/__tests__/GraphLayout.test.ts
import Graph from 'graphology';
import { GraphLayout } from '../GraphLayout';

describe('GraphLayout', () => {
  it('assigns x and y to every node', () => {
    const g = new Graph();
    g.addNode('A', { size: 1 });
    g.addNode('B', { size: 1 });
    g.addEdge('A', 'B');

    const layout = new GraphLayout();
    layout.apply(g);

    g.forEachNode((node) => {
      expect(typeof g.getNodeAttribute(node, 'x')).toBe('number');
      expect(typeof g.getNodeAttribute(node, 'y')).toBe('number');
    });
  });
});
```

**Step 2: テストが失敗することを確認**

```bash
cd /anytime-markdown && npx jest --maxWorkers=1 packages/vscode-trail-extension/src/graph/__tests__/GraphLayout.test.ts
```

**Step 3: 実装**

```typescript
// src/graph/GraphLayout.ts
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { random } from 'graphology-layout';

export class GraphLayout {
  apply(graph: Graph, iterations = 100): void {
    if (graph.order === 0) return;
    // 初期位置をランダム配置してから ForceAtlas2
    random.assign(graph);
    forceAtlas2.assign(graph, {
      iterations,
      settings: forceAtlas2.inferSettings(graph),
    });
  }
}
```

**Step 4: テストが通ることを確認**

```bash
cd /anytime-markdown && npx jest --maxWorkers=1 packages/vscode-trail-extension/src/graph/__tests__/GraphLayout.test.ts
```

> `graphology-layout` が不足していれば `npm install --save-exact graphology-layout@0.6.1` を追加する。

**Step 5: コミット**

```bash
git add packages/vscode-trail-extension/src/graph/GraphLayout.ts \
        packages/vscode-trail-extension/src/graph/__tests__/GraphLayout.test.ts
git commit -m "feat(trail): add GraphLayout with ForceAtlas2"
```

---

## Task 8: GraphQueryEngine（BFS / DFS / explain / path）

**Files:**
- Create: `packages/vscode-trail-extension/src/graph/GraphQueryEngine.ts`
- Create: `packages/vscode-trail-extension/src/graph/__tests__/GraphQueryEngine.test.ts`

**Step 1: テストを書く**

```typescript
// src/graph/__tests__/GraphQueryEngine.test.ts
import Graph from 'graphology';
import { GraphQueryEngine } from '../GraphQueryEngine';
import type { CodeGraph } from '../CodeGraph.types';

function makeCodeGraph(): CodeGraph {
  return {
    generatedAt: new Date().toISOString(),
    repositories: [],
    nodes: [
      { id: 'src/App', label: 'App', repo: 'product', package: 'web-app', fileType: 'code', community: 0, communityLabel: 'UI', x: 0, y: 0, size: 0 },
      { id: 'src/hooks/useData', label: 'useData', repo: 'product', package: 'web-app', fileType: 'code', community: 1, communityLabel: 'Hooks', x: 1, y: 0, size: 1 },
      { id: 'src/utils/fetch', label: 'fetch', repo: 'product', package: 'web-app', fileType: 'code', community: 1, communityLabel: 'Hooks', x: 2, y: 0, size: 1 },
    ],
    edges: [
      { source: 'src/App', target: 'src/hooks/useData', confidence: 'EXTRACTED', confidence_score: 1.0, crossRepo: false },
      { source: 'src/hooks/useData', target: 'src/utils/fetch', confidence: 'EXTRACTED', confidence_score: 1.0, crossRepo: false },
    ],
    communities: { 0: 'UI', 1: 'Hooks' },
    godNodes: [],
  };
}

describe('GraphQueryEngine', () => {
  let engine: GraphQueryEngine;

  beforeEach(() => { engine = new GraphQueryEngine(makeCodeGraph()); });

  it('query: BFS でキーワードに一致するノードを探索', () => {
    const result = engine.query('useData');
    expect(result.nodes).toContain('src/hooks/useData');
  });

  it('explain: ノードの隣接情報を返す', () => {
    const result = engine.explain('src/hooks/useData');
    expect(result).not.toBeNull();
    expect(result!.node.label).toBe('useData');
    expect(result!.incoming.length).toBe(1);
    expect(result!.outgoing.length).toBe(1);
  });

  it('path: 2ノード間の最短パスを返す', () => {
    const result = engine.path('src/App', 'src/utils/fetch');
    expect(result.found).toBe(true);
    expect(result.hops).toBe(2);
  });

  it('path: 接続のないノード間は found=false', () => {
    const result = engine.path('src/utils/fetch', 'src/App');
    expect(result.found).toBe(false);
  });
});
```

**Step 2: テストが失敗することを確認**

```bash
cd /anytime-markdown && npx jest --maxWorkers=1 packages/vscode-trail-extension/src/graph/__tests__/GraphQueryEngine.test.ts
```

**Step 3: 実装**

```typescript
// src/graph/GraphQueryEngine.ts
import Graph from 'graphology';
import { bidirectional } from 'graphology-shortest-path';
import type { CodeGraph, CodeGraphQueryResult, CodeGraphExplainResult, CodeGraphPathResult } from './CodeGraph.types';

export class GraphQueryEngine {
  private readonly graph: Graph;
  private readonly nodeMap: Map<string, CodeGraph['nodes'][number]>;
  private readonly edgeList: CodeGraph['edges'];

  constructor(private readonly codeGraph: CodeGraph) {
    this.graph = new Graph({ multi: false });
    this.nodeMap = new Map(codeGraph.nodes.map(n => [n.id, n]));
    this.edgeList = codeGraph.edges;
    for (const n of codeGraph.nodes) this.graph.addNode(n.id);
    for (const e of codeGraph.edges) {
      if (!this.graph.hasEdge(e.source, e.target)) {
        this.graph.addEdge(e.source, e.target);
      }
    }
  }

  query(keyword: string, depth = 3): CodeGraphQueryResult {
    const lower = keyword.toLowerCase();
    const starts = this.codeGraph.nodes
      .filter(n => n.label.toLowerCase().includes(lower))
      .map(n => n.id);

    const visited = new Set<string>(starts);
    let frontier = new Set(starts);
    for (let i = 0; i < depth; i++) {
      const next = new Set<string>();
      for (const n of frontier) {
        this.graph.neighbors(n).forEach(nb => {
          if (!visited.has(nb)) { visited.add(nb); next.add(nb); }
        });
      }
      frontier = next;
    }
    const nodeSet = visited;
    const edges = this.edgeList.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target))
      .map(e => ({ source: e.source, target: e.target }));
    return { nodes: [...nodeSet], edges };
  }

  explain(nodeId: string): CodeGraphExplainResult | null {
    const node = this.nodeMap.get(nodeId);
    if (!node) return null;
    const incoming = this.edgeList.filter(e => e.target === nodeId);
    const outgoing = this.edgeList.filter(e => e.source === nodeId);
    return { node, incoming, outgoing };
  }

  path(from: string, to: string): CodeGraphPathResult {
    try {
      const p = bidirectional(this.graph, from, to);
      if (!p) return { found: false, path: [], hops: 0 };
      return { found: true, path: p, hops: p.length - 1 };
    } catch {
      return { found: false, path: [], hops: 0 };
    }
  }
}
```

> `graphology-shortest-path` が不足していれば `npm install --save-exact graphology-shortest-path@2.2.0` を追加する。

**Step 4: テストが通ることを確認**

```bash
cd /anytime-markdown && npx jest --maxWorkers=1 packages/vscode-trail-extension/src/graph/__tests__/GraphQueryEngine.test.ts
```

**Step 5: コミット**

```bash
git add packages/vscode-trail-extension/src/graph/GraphQueryEngine.ts \
        packages/vscode-trail-extension/src/graph/__tests__/GraphQueryEngine.test.ts
git commit -m "feat(trail): add GraphQueryEngine with BFS/DFS/explain/path"
```

---

## Task 9: CodeGraphService（パイプライン統括）

**Files:**
- Create: `packages/vscode-trail-extension/src/graph/CodeGraphService.ts`

**Step 1: 実装**

```typescript
// src/graph/CodeGraphService.ts
import fs from 'node:fs';
import path from 'node:path';
import { GraphDetector } from './GraphDetector';
import { GraphExtractor } from './GraphExtractor';
import { GraphBuilder } from './GraphBuilder';
import { GraphClusterer } from './GraphClusterer';
import { GraphLayout } from './GraphLayout';
import type { CodeGraph, CodeGraphRepository } from './CodeGraph.types';
import { TrailLogger } from '../utils/TrailLogger';

export interface CodeGraphServiceConfig {
  readonly repositories: readonly CodeGraphRepository[];
  readonly outputDir: string;
}

export type ProgressCallback = (phase: string, percent: number) => void;

export class CodeGraphService {
  private cached: CodeGraph | null = null;

  constructor(private readonly config: CodeGraphServiceConfig, private readonly logger: TrailLogger) {}

  getGraph(): CodeGraph | null { return this.cached; }

  async loadFromDisk(): Promise<CodeGraph | null> {
    const jsonPath = path.join(this.config.outputDir, 'graph.json');
    if (!fs.existsSync(jsonPath)) return null;
    try {
      this.cached = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as CodeGraph;
      return this.cached;
    } catch (err) {
      this.logger.error(`[${new Date().toISOString()}] [ERROR] Failed to load graph.json`, err as Error);
      return null;
    }
  }

  async generate(onProgress?: ProgressCallback): Promise<CodeGraph> {
    const repos = this.config.repositories;
    onProgress?.('ファイル検出中', 0);

    const allNodes: Parameters<typeof GraphBuilder.prototype.addNode>[0][] = [];
    const allEdges: Parameters<typeof GraphBuilder.prototype.addEdge>[0][] = [];

    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i];
      const pct = Math.round((i / repos.length) * 60);
      onProgress?.(`${repo.label} を解析中`, pct);

      const detector = new GraphDetector(repo.path);
      const extractor = new GraphExtractor(repo.path);
      const codeFiles = detector.detectCodeFiles();
      const docFiles = detector.detectDocFiles();

      for (const f of codeFiles) {
        const nodeId = extractor.toNodeId(f);
        const parts = nodeId.split('/');
        allNodes.push({
          id: nodeId,
          label: path.basename(f, path.extname(f)),
          repo: repo.id,
          package: parts[1] ?? repo.id,
          fileType: 'code',
        });
        for (const edge of extractor.extractFromFile(f)) {
          allEdges.push({ ...edge, crossRepo: false });
        }
      }

      for (const f of docFiles) {
        const nodeId = extractor.toNodeId(f);
        const parts = nodeId.split('/');
        allNodes.push({
          id: nodeId,
          label: path.basename(f, path.extname(f)),
          repo: repo.id,
          package: parts[1] ?? repo.id,
          fileType: 'document',
        });
      }
    }

    onProgress?.('グラフ構築中', 65);
    const builder = new GraphBuilder();
    const seenNodes = new Set<string>();
    for (const n of allNodes) {
      if (!seenNodes.has(n.id)) { builder.addNode(n); seenNodes.add(n.id); }
    }
    for (const e of allEdges) builder.addEdge(e);
    const graph = builder.build();

    onProgress?.('クラスタリング中', 75);
    const clusterer = new GraphClusterer();
    const { communities, labels } = clusterer.cluster(graph);
    graph.forEachNode((node) => {
      const cid = communities[node] ?? 0;
      graph.setNodeAttribute(node, 'community', cid);
      graph.setNodeAttribute(node, 'communityLabel', labels[cid] ?? String(cid));
    });

    onProgress?.('レイアウト計算中', 85);
    const layout = new GraphLayout();
    layout.apply(graph);

    onProgress?.('god nodes 計算中', 92);
    const godNodes = graph.nodes()
      .sort((a, b) => (graph.getNodeAttribute(b, 'size') as number) - (graph.getNodeAttribute(a, 'size') as number))
      .slice(0, 10);

    const codeGraph: CodeGraph = {
      generatedAt: new Date().toISOString(),
      repositories: repos.slice(),
      nodes: graph.nodes().map(id => ({
        id,
        label: graph.getNodeAttribute(id, 'label') as string,
        repo: graph.getNodeAttribute(id, 'repo') as string,
        package: graph.getNodeAttribute(id, 'package') as string,
        fileType: graph.getNodeAttribute(id, 'fileType') as 'code' | 'document',
        community: graph.getNodeAttribute(id, 'community') as number,
        communityLabel: graph.getNodeAttribute(id, 'communityLabel') as string,
        x: graph.getNodeAttribute(id, 'x') as number,
        y: graph.getNodeAttribute(id, 'y') as number,
        size: graph.getNodeAttribute(id, 'size') as number,
      })),
      edges: allEdges,
      communities: labels,
      godNodes,
    };

    onProgress?.('保存中', 97);
    this.save(codeGraph);
    this.cached = codeGraph;
    onProgress?.('', 100);
    return codeGraph;
  }

  private save(graph: CodeGraph): void {
    fs.mkdirSync(this.config.outputDir, { recursive: true });
    const jsonPath = path.join(this.config.outputDir, 'graph.json');
    fs.writeFileSync(jsonPath, JSON.stringify(graph, null, 2), 'utf-8');
    this.logger.info(`[${new Date().toISOString()}] [INFO] Code graph saved to ${jsonPath}`);
  }
}
```

**Step 2: ビルド確認**

```bash
cd packages/vscode-trail-extension && npm run compile
```

**Step 3: コミット**

```bash
git add packages/vscode-trail-extension/src/graph/CodeGraphService.ts
git commit -m "feat(trail): add CodeGraphService pipeline orchestrator"
```

---

## Task 10: server/types.ts に WebSocket メッセージ型を追加

**Files:**
- Modify: `packages/vscode-trail-extension/src/server/types.ts`

**Step 1: 以下の型を追加する**

既存の `ServerMessage` union と `ClientMessage` union に追記する。

```typescript
// ServerMessage に追加
export interface CodeGraphUpdatedMessage {
  readonly type: 'code-graph-updated';
}

export interface CodeGraphProgressMessage {
  readonly type: 'code-graph-progress';
  readonly phase: string;
  readonly percent: number;
}

// ClientMessage に追加
export interface GenerateCodeGraphCommand {
  readonly type: 'generate-code-graph';
}
```

`ServerMessage` の union に `| CodeGraphUpdatedMessage | CodeGraphProgressMessage`、\
`ClientMessage` の union に `| GenerateCodeGraphCommand` を追加する。

**Step 2: ビルド確認**

```bash
cd packages/vscode-trail-extension && npm run compile
```

**Step 3: コミット**

```bash
git add packages/vscode-trail-extension/src/server/types.ts
git commit -m "feat(trail): add CodeGraph WebSocket message types"
```

---

## Task 11: TrailDataServer に HTTP エンドポイントを追加

**Files:**
- Modify: `packages/vscode-trail-extension/src/server/TrailDataServer.ts`

**Step 1: `CodeGraphService` と `GraphQueryEngine` を import**

```typescript
import { CodeGraphService } from '../graph/CodeGraphService';
import { GraphQueryEngine } from '../graph/GraphQueryEngine';
```

**Step 2: `TrailDataServer` に `codeGraphService` フィールドを追加**

コンストラクタ引数を追加し、以下のエンドポイントを `handleRequest` に追加する。

```typescript
// GET /api/code-graph
if (url === '/api/code-graph') {
  const graph = this.codeGraphService.getGraph();
  if (!graph) { res.writeHead(404); res.end('{}'); return; }
  res.writeHead(200, JSON_HEADERS);
  res.end(JSON.stringify(graph));
  return;
}

// GET /api/code-graph/query?q=
if (url.startsWith('/api/code-graph/query')) {
  const q = new URL(req.url!, 'http://localhost').searchParams.get('q') ?? '';
  const graph = this.codeGraphService.getGraph();
  if (!graph) { res.writeHead(404); res.end('{}'); return; }
  const engine = new GraphQueryEngine(graph);
  res.writeHead(200, JSON_HEADERS);
  res.end(JSON.stringify(engine.query(q)));
  return;
}

// GET /api/code-graph/explain?id=
if (url.startsWith('/api/code-graph/explain')) {
  const id = new URL(req.url!, 'http://localhost').searchParams.get('id') ?? '';
  const graph = this.codeGraphService.getGraph();
  if (!graph) { res.writeHead(404); res.end('{}'); return; }
  const engine = new GraphQueryEngine(graph);
  const result = engine.explain(id);
  res.writeHead(result ? 200 : 404, JSON_HEADERS);
  res.end(JSON.stringify(result ?? {}));
  return;
}

// GET /api/code-graph/path?from=&to=
if (url.startsWith('/api/code-graph/path')) {
  const params = new URL(req.url!, 'http://localhost').searchParams;
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const graph = this.codeGraphService.getGraph();
  if (!graph) { res.writeHead(404); res.end('{}'); return; }
  const engine = new GraphQueryEngine(graph);
  res.writeHead(200, JSON_HEADERS);
  res.end(JSON.stringify(engine.path(from, to)));
  return;
}
```

**Step 3: WebSocket で `generate-code-graph` コマンドを処理**

既存の WebSocket メッセージハンドラに追加する。

```typescript
case 'generate-code-graph':
  void this.codeGraphService.generate((phase, percent) => {
    this.broadcast({ type: 'code-graph-progress', phase, percent });
  }).then(() => {
    this.broadcast({ type: 'code-graph-updated' });
  });
  break;
```

**Step 4: ビルド確認**

```bash
cd packages/vscode-trail-extension && npm run compile
```

**Step 5: コミット**

```bash
git add packages/vscode-trail-extension/src/server/TrailDataServer.ts
git commit -m "feat(trail): add code-graph HTTP endpoints and WS command"
```

---

## Task 12: extension.ts に CodeGraphService を組み込む

**Files:**
- Modify: `packages/vscode-trail-extension/src/extension.ts`

**Step 1: 設定読み込みと CodeGraphService 初期化コードを追加**

```typescript
import * as vscode from 'vscode';
import path from 'node:path';
import { CodeGraphService } from './graph/CodeGraphService';

// activate() 内で TrailDataServer 生成の前後に追加
const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
const cfg = vscode.workspace.getConfiguration('anytimeTrail');
const rawOutputDir: string = cfg.get('codeGraph.outputDir', '${workspaceFolder}/.vscode/graphify-out');
const outputDir = rawOutputDir.replace('${workspaceFolder}', workspaceRoot);
const repositories: Array<{ path: string; label: string }> = cfg.get('codeGraph.repositories', []);
const autoRefresh: boolean = cfg.get('codeGraph.autoRefresh', false);

const codeGraphService = new CodeGraphService(
  {
    repositories: repositories.map((r, i) => ({ id: String(i), label: r.label, path: r.path })),
    outputDir,
  },
  logger,
);
await codeGraphService.loadFromDisk();
if (autoRefresh) void codeGraphService.generate();
```

VS Code コマンドを登録する。

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('anytimeTrail.generateCodeGraph', async () => {
    await codeGraphService.generate((phase, pct) => {
      // 進捗は WS 経由で trail viewer に通知済み
      if (pct === 100) vscode.window.showInformationMessage('Code graph generated.');
    });
  }),
);
```

**Step 2: ビルド確認**

```bash
cd packages/vscode-trail-extension && npm run compile
```

**Step 3: コミット**

```bash
git add packages/vscode-trail-extension/src/extension.ts
git commit -m "feat(trail): integrate CodeGraphService into extension"
```

---

## Task 13: trail-viewer に sigma.js を追加

**Files:**
- Modify: `packages/trail-viewer/package.json`

**Step 1: ライブラリを追加**

```bash
cd packages/trail-viewer && npm install --save-exact sigma@3.0.0
```

**Step 2: ビルド確認**

```bash
cd packages/trail-viewer && npm run build 2>&1 | tail -5
```

**Step 3: コミット**

```bash
git add packages/trail-viewer/package.json packages/trail-viewer/package-lock.json
git commit -m "feat(trail-viewer): add sigma.js for graph rendering"
```

---

## Task 14: useCodeGraph フック

**Files:**
- Create: `packages/trail-viewer/src/hooks/useCodeGraph.ts`

**Step 1: 実装**

```typescript
// src/hooks/useCodeGraph.ts
import { useState, useEffect, useCallback } from 'react';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';

export interface UseCodeGraphResult {
  graph: CodeGraph | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCodeGraph(serverUrl: string): UseCodeGraphResult {
  const [graph, setGraph] = useState<CodeGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/code-graph`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGraph(await res.json() as CodeGraph);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  useEffect(() => { void fetch_(); }, [fetch_]);

  return { graph, loading, error, refetch: fetch_ };
}
```

> `CodeGraph` 型は `packages/trail-core` に移動してから `@anytime-markdown/trail-core/codeGraph` として export する。\
> 移動先: `packages/trail-core/src/codeGraph.ts`（`CodeGraph.types.ts` の内容をコピー + export）

**Step 2: trail-core に型を追加してビルド確認**

```bash
cd /anytime-markdown && npm run build 2>&1 | tail -10
```

**Step 3: コミット**

```bash
git add packages/trail-viewer/src/hooks/useCodeGraph.ts \
        packages/trail-core/src/codeGraph.ts
git commit -m "feat(trail-viewer): add useCodeGraph hook"
```

---

## Task 15: CodeGraphCanvas（sigma.js レンダラー）

**Files:**
- Create: `packages/trail-viewer/src/components/CodeGraphCanvas.tsx`

**Step 1: 実装**

```typescript
// src/components/CodeGraphCanvas.tsx
import { useEffect, useRef } from 'react';
import Sigma from 'sigma';
import Graph from 'graphology';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';

const COMMUNITY_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
];

interface CodeGraphCanvasProps {
  readonly graph: CodeGraph;
  readonly highlightedNodes?: ReadonlySet<string>;
  readonly onNodeClick?: (nodeId: string) => void;
  readonly isDark?: boolean;
}

export function CodeGraphCanvas({ graph, highlightedNodes, onNodeClick, isDark }: Readonly<CodeGraphCanvasProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const g = new Graph();
    for (const node of graph.nodes) {
      g.addNode(node.id, {
        label: node.label,
        x: node.x,
        y: node.y,
        size: Math.max(3, Math.min(node.size + 4, 20)),
        color: COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length],
      });
    }
    for (const edge of graph.edges) {
      if (g.hasNode(edge.source) && g.hasNode(edge.target) && !g.hasEdge(edge.source, edge.target)) {
        g.addEdge(edge.source, edge.target, { color: isDark ? '#444' : '#ccc' });
      }
    }

    const sigma = new Sigma(g, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeColor: isDark ? '#444' : '#ccc',
    });

    if (onNodeClick) {
      sigma.on('clickNode', ({ node }) => onNodeClick(node));
    }

    sigmaRef.current = sigma;
    return () => { sigma.kill(); sigmaRef.current = null; };
  }, [graph, isDark, onNodeClick]);

  // ハイライト更新
  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    sigma.getGraph().forEachNode((node) => {
      const highlighted = !highlightedNodes || highlightedNodes.size === 0 || highlightedNodes.has(node);
      sigma.getGraph().setNodeAttribute(node, 'color',
        highlighted
          ? COMMUNITY_COLORS[(sigma.getGraph().getNodeAttribute(node, 'community') as number ?? 0) % COMMUNITY_COLORS.length]
          : (isDark ? '#333' : '#eee'),
      );
    });
    sigma.refresh();
  }, [highlightedNodes, isDark]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
```

**Step 2: ビルド確認**

```bash
cd /anytime-markdown && npm run build 2>&1 | tail -10
```

**Step 3: コミット**

```bash
git add packages/trail-viewer/src/components/CodeGraphCanvas.tsx
git commit -m "feat(trail-viewer): add CodeGraphCanvas with sigma.js"
```

---

## Task 16: CodeGraphPanel（タブ UI）

**Files:**
- Create: `packages/trail-viewer/src/components/CodeGraphPanel.tsx`

**Step 1: 実装**

```typescript
// src/components/CodeGraphPanel.tsx
import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { CodeGraphCanvas } from './CodeGraphCanvas';
import { useCodeGraph } from '../hooks/useCodeGraph';
import type { CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';

interface CodeGraphPanelProps {
  readonly serverUrl: string;
  readonly isDark?: boolean;
}

export function CodeGraphPanel({ serverUrl, isDark }: Readonly<CodeGraphPanelProps>) {
  const { graph, loading, error, refetch } = useCodeGraph(serverUrl);
  const [query, setQuery] = useState('');
  const [highlightedNodes, setHighlightedNodes] = useState<ReadonlySet<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<CodeGraphNode | null>(null);
  const [repoFilter, setRepoFilter] = useState<string>('all');

  const handleSearch = useCallback(async () => {
    if (!query.trim()) { setHighlightedNodes(new Set()); return; }
    const res = await fetch(`${serverUrl}/api/code-graph/query?q=${encodeURIComponent(query)}`);
    const data = await res.json() as { nodes: string[] };
    setHighlightedNodes(new Set(data.nodes));
  }, [serverUrl, query]);

  const handleNodeClick = useCallback(async (nodeId: string) => {
    const res = await fetch(`${serverUrl}/api/code-graph/explain?id=${encodeURIComponent(nodeId)}`);
    const data = await res.json() as { node: CodeGraphNode };
    setSelectedNode(data.node ?? null);
  }, [serverUrl]);

  const handleGenerate = useCallback(() => {
    // WebSocket 経由でコマンド送信は親コンポーネントが担う
    // ここではフォールバックとして直接 refetch
    refetch();
  }, [refetch]);

  if (loading) return <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}><CircularProgress size={20} /><Typography>グラフを読み込み中...</Typography></Box>;
  if (error) return <Box sx={{ p: 3 }}><Typography color="error">{error}</Typography><Button onClick={refetch}>再試行</Button></Box>;
  if (!graph) return (
    <Box sx={{ p: 3 }}>
      <Typography sx={{ mb: 2 }}>グラフがまだ生成されていません。</Typography>
      <Button variant="contained" onClick={handleGenerate}>Generate Graph</Button>
    </Box>
  );

  const repos = [{ id: 'all', label: 'All' }, ...graph.repositories];
  const filteredGraph = repoFilter === 'all' ? graph : {
    ...graph,
    nodes: graph.nodes.filter(n => n.repo === repoFilter),
    edges: graph.edges.filter(e => {
      const sn = graph.nodes.find(n => n.id === e.source);
      const tn = graph.nodes.find(n => n.id === e.target);
      return sn?.repo === repoFilter && tn?.repo === repoFilter;
    }),
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ツールバー */}
      <Box sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          size="small"
          placeholder="検索..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void handleSearch()}
          sx={{ minWidth: 200 }}
        />
        <Button size="small" variant="outlined" onClick={() => void handleSearch()}>検索</Button>
        <Button size="small" onClick={handleGenerate}>Generate Graph</Button>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {repos.map(r => (
            <Chip
              key={r.id}
              label={r.label}
              size="small"
              variant={repoFilter === r.id ? 'filled' : 'outlined'}
              onClick={() => setRepoFilter(r.id)}
            />
          ))}
        </Box>
      </Box>

      {/* グラフ + サイドパネル */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Box sx={{ flex: 1 }}>
          <CodeGraphCanvas
            graph={filteredGraph}
            highlightedNodes={highlightedNodes}
            onNodeClick={n => void handleNodeClick(n)}
            isDark={isDark}
          />
        </Box>
        {selectedNode && (
          <Box sx={{ width: 260, p: 2, borderLeft: 1, borderColor: 'divider', overflow: 'auto' }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{selectedNode.label}</Typography>
            <Typography variant="caption" color="text.secondary" display="block">{selectedNode.id}</Typography>
            <Typography variant="caption" display="block">リポジトリ: {selectedNode.repo}</Typography>
            <Typography variant="caption" display="block">コミュニティ: {selectedNode.communityLabel}</Typography>
            <Typography variant="caption" display="block">被参照数: {selectedNode.size}</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
```

**Step 2: ビルド確認**

```bash
cd /anytime-markdown && npm run build 2>&1 | tail -10
```

**Step 3: コミット**

```bash
git add packages/trail-viewer/src/components/CodeGraphPanel.tsx
git commit -m "feat(trail-viewer): add CodeGraphPanel tab UI"
```

---

## Task 17: TrailViewerCore に Graph タブを追加

**Files:**
- Modify: `packages/trail-viewer/src/components/TrailViewerCore.tsx`

**Step 1: `CodeGraphPanel` を import して既存タブ配列に追加**

`TrailViewerCore.tsx` の既存タブ定義箇所を確認し、`'Graph'` タブを追加する。

```typescript
import { CodeGraphPanel } from './CodeGraphPanel';

// タブ一覧への追加（既存タブの後ろに追記）
{ id: 'graph', label: 'Graph' }

// タブコンテンツの switch/条件分岐に追加
case 'graph':
  return <CodeGraphPanel serverUrl={serverUrl} isDark={isDark} />;
```

**Step 2: ビルド確認**

```bash
cd /anytime-markdown && npm run build 2>&1 | tail -10
```

**Step 3: コミット**

```bash
git add packages/trail-viewer/src/components/TrailViewerCore.tsx
git commit -m "feat(trail-viewer): add Graph tab to TrailViewerCore"
```

---

## Task 18: /build-code-graph 独自スキルの作成

**Files:**
- Create: `~/.claude/skills/build-code-graph/SKILL.md`

**Step 1: スキルディレクトリを作成**

```bash
mkdir -p ~/.claude/skills/build-code-graph
```

**Step 2: SKILL.md を作成**

```markdown
---
name: build-code-graph
description: "anytime-markdown + docs リポジトリを解析してコードグラフを生成する。EXTRACTED/INFERRED/AMBIGUOUS エッジ付き。"
trigger: /build-code-graph
---

# /build-code-graph

VS Code 設定 `anytimeTrail.codeGraph` を読み取り、対象リポジトリを解析して
graph.json と GRAPH_REPORT.md を生成する。

## 処理フロー

### Step 1: 設定読み込み

```bash
cat /anytime-markdown/.vscode/settings.json | python3 -c "
import json,sys
cfg = json.load(sys.stdin)
repos = cfg.get('anytimeTrail.codeGraph.repositories', [])
out   = cfg.get('anytimeTrail.codeGraph.outputDir', '/anytime-markdown/.vscode/graphify-out')
out   = out.replace('\${workspaceFolder}', '/anytime-markdown')
print(json.dumps({'repositories': repos, 'outputDir': out}))
"
```

### Step 2: TS/TSX ファイルから EXTRACTED エッジを抽出

各リポジトリの .ts/.tsx を glob し、import 文を正規表現で解析する。
出力: `outputDir/.graph_extracted.json`

### Step 3: Markdown ファイルから INFERRED エッジを抽出（subagent 並列）

各リポジトリの .md を 20 件ずつサブエージェントに渡し、
概念的関係・相互参照を抽出する。confidence_score を必ず付与する。
出力: `outputDir/.graph_inferred.json`

サブエージェントへのプロンプト:
```
以下の Markdown ファイル群を読み、概念的な関係（INFERRED）と不確かな関係（AMBIGUOUS）を抽出してください。

ファイル一覧:
[FILE_LIST]

出力形式（JSON のみ、説明文不要）:
{"edges":[{"source":"ファイルパス","target":"ファイルパス","confidence":"INFERRED","confidence_score":0.75,"reason":"関係の説明"}]}
```

### Step 4: グラフ構築・永続化

```bash
node -e "
const {CodeGraphService} = require('./packages/vscode-trail-extension/dist/graph/CodeGraphService');
// ... パイプライン実行
"
```

または拡張機能の WebSocket コマンド `generate-code-graph` をトリガーする。

### Step 5: 完了報告

god nodes・サプライズ接続・推奨クエリを出力する。
```

**Step 3: コミット（スキルはリポジトリ外）**

スキルは `~/.claude/skills/` に配置するためコミット不要。確認のみ。

```bash
ls ~/.claude/skills/build-code-graph/SKILL.md
```

---

## Task 19: 動作確認

**Step 1: 拡張機能をリビルド・リロード**

```bash
cd packages/vscode-trail-extension && npm run compile
```

VS Code で `Developer: Reload Window` を実行。

**Step 2: VS Code 設定を追加**

`.vscode/settings.json` に以下を追加する（手動）。

```json
{
  "anytimeTrail.codeGraph.repositories": [
    { "path": "/anytime-markdown", "label": "Product" },
    { "path": "/Shared/anytime-markdown-docs", "label": "Docs" }
  ],
  "anytimeTrail.codeGraph.outputDir": "${workspaceFolder}/.vscode/graphify-out"
}
```

**Step 3: コマンドパレットで実行**

`Anytime Trail: Generate Code Graph` を実行し、`.vscode/graphify-out/graph.json` が生成されることを確認。

**Step 4: trail viewer を開いて Graph タブを確認**

- グラフが sigma.js でレンダリングされている
- 検索バーでキーワードを入力するとノードがハイライトされる
- ノードをクリックするとサイドパネルにファイル情報が表示される
- リポジトリフィルタ（Product / Docs / All）が機能する

**Step 5: 最終コミット**

```bash
git add .vscode/settings.json .gitignore
git commit -m "feat(trail): complete code graph feature integration"
```

---

## 実装順序サマリー

| Task | 内容 | 依存 |
|---|---|---|
| 1 | 型定義 | なし |
| 2 | VS Code 設定スキーマ | なし |
| 3 | GraphDetector | 1 |
| 4 | GraphExtractor | 1 |
| 5 | GraphBuilder + ライブラリ追加 | 1 |
| 6 | GraphClusterer | 5 |
| 7 | GraphLayout | 5 |
| 8 | GraphQueryEngine | 1, 5 |
| 9 | CodeGraphService | 3,4,5,6,7 |
| 10 | server/types.ts 更新 | 1 |
| 11 | TrailDataServer エンドポイント | 8, 9, 10 |
| 12 | extension.ts 統合 | 9, 11 |
| 13 | sigma.js ライブラリ追加 | なし |
| 14 | useCodeGraph フック | 1, 13 |
| 15 | CodeGraphCanvas | 13, 14 |
| 16 | CodeGraphPanel | 14, 15 |
| 17 | TrailViewerCore タブ追加 | 16 |
| 18 | /build-code-graph スキル | 1 |
| 19 | 動作確認 | 全タスク |
