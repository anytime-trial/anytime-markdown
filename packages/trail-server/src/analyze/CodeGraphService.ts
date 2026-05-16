import fs from 'node:fs';
import path from 'node:path';

import { analyze } from '@anytime-markdown/trail-core/analyze';
import type { TrailGraph } from '@anytime-markdown/trail-core';
import type { C4Element } from '@anytime-markdown/trail-core/c4';
import { loadAnalyzeExclude } from '@anytime-markdown/trail-core/analyzeExclude';

import type { Logger } from '../runtime/Logger';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { CodeGraph, CodeGraphEdge, CodeGraphNode, CodeGraphRepository } from './CodeGraph.types';
import { GraphBuilder } from './GraphBuilder';
import { GraphClusterer } from './GraphClusterer';
import { GraphDetector } from './GraphDetector';
import { GraphLayout } from './GraphLayout';
import { trailGraphToCodeGraphInputs } from './trailGraphToCodeGraphInputs';

export interface CodeGraphServiceConfig {
  readonly repositories: readonly CodeGraphRepository[];
  /** ディレクトリ名で除外するパターン（GraphDetector のデフォルトに追加される） */
  readonly excludePatterns?: readonly string[];
  /** Logger instance. Defaults to a no-op logger if not provided. */
  readonly logger?: Logger;
  /**
   * クラスタリング時に参照する C4 element 一覧の取得関数（任意）。
   * 供給されない／空配列の場合は package 多数決にフォールバックする。
   */
  readonly c4ElementsProvider?: () => readonly C4Element[] | undefined;
  /**
   * 既に解析済みの TrailGraph があればこれを返すフック。`Anytime Trail: Analyze Workspace`
   * で生成されたものを流用するためのルート。リポ ID → TrailGraph のマップを返す。
   */
  readonly trailGraphProvider?: () => Record<string, TrailGraph | undefined> | undefined;
  /** CodeGraph の保存・読み込みに使用する DB */
  readonly trailDb?: TrailDatabase;
}

export type ProgressCallback = (phase: string, percent: number) => void;

type NodeInput = Omit<CodeGraphNode, 'community' | 'communityLabel' | 'x' | 'y' | 'size'>;

const NOOP_LOGGER: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => NOOP_LOGGER,
};

export class CodeGraphService {
  private readonly cached = new Map<string, CodeGraph>();
  private readonly logger: Logger;

  constructor(private readonly config: CodeGraphServiceConfig) {
    this.logger = config.logger ?? NOOP_LOGGER;
  }

  private defaultRepoName(): string | undefined {
    const r = this.config.repositories[0];
    if (!r) return undefined;
    return r.label || path.basename(r.path);
  }

  getGraph(repoName?: string): CodeGraph | null {
    const key = repoName ?? this.defaultRepoName();
    if (!key) return null;
    return this.cached.get(key) ?? null;
  }

  async loadFromDb(repoName?: string): Promise<CodeGraph | null> {
    const key = repoName ?? this.defaultRepoName();
    if (!this.config.trailDb || !key) return null;
    try {
      const graph = this.config.trailDb.getCurrentCodeGraph(key);
      if (graph) {
        this.cached.set(key, graph);
        return graph;
      }
      this.cached.delete(key);
    } catch (err) {
      this.logger.warn(`[CodeGraphService] DB not ready in loadFromDb(${key}): ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  }

  invalidate(repoName?: string): void {
    if (repoName) {
      this.cached.delete(repoName);
    } else {
      this.cached.clear();
    }
  }

  async generate(onProgress?: ProgressCallback): Promise<CodeGraph> {
    const repos = this.config.repositories;
    onProgress?.('ファイル検出中', 0);

    const allNodes: NodeInput[] = [];
    const allEdges: CodeGraphEdge[] = [];

    const trailGraphCache = this.config.trailGraphProvider?.() ?? {};

    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i];
      const pct = Math.round((i / Math.max(repos.length, 1)) * 60);
      onProgress?.(`${repo.label} を解析中`, pct);

      const excludePatterns = this.config.excludePatterns ?? loadAnalyzeExclude(repo.path);
      const detector = new GraphDetector(repo.path, excludePatterns);
      const docFiles = detector.detectDocFiles();

      const trailGraph = trailGraphCache[repo.id] ?? this.runAnalyze(repo);

      const { nodes, edges } = trailGraphToCodeGraphInputs({
        repoId: repo.id,
        repoRootPath: repo.path,
        trailGraph,
        docFiles,
      });
      allNodes.push(...nodes);
      allEdges.push(...edges);
    }

    onProgress?.('グラフ構築中', 65);
    const builder = new GraphBuilder();
    const seenNodes = new Set<string>();
    for (const n of allNodes) {
      if (!seenNodes.has(n.id)) {
        builder.addNode(n);
        seenNodes.add(n.id);
      }
    }
    for (const e of allEdges) builder.addEdge(e);
    const graph = builder.build();

    onProgress?.('クラスタリング中', 75);
    const clusterer = new GraphClusterer();
    const c4Elements = this.config.c4ElementsProvider?.();
    const { communities, labels } = clusterer.cluster(graph, c4Elements);
    graph.forEachNode((node) => {
      const cid = communities[node] ?? 0;
      graph.setNodeAttribute(node, 'community', cid);
      graph.setNodeAttribute(node, 'communityLabel', labels[cid] ?? String(cid));
    });

    onProgress?.('レイアウト計算中', 85);
    const layout = new GraphLayout();
    layout.apply(graph);

    onProgress?.('god nodes 計算中', 92);
    const godNodes = graph
      .nodes()
      .sort(
        (a, b) =>
          (graph.getNodeAttribute(b, 'size') as number) -
          (graph.getNodeAttribute(a, 'size') as number),
      )
      .slice(0, 10);

    const nodes: CodeGraphNode[] = graph.nodes().map((id) => ({
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
    }));

    const seenEdgeKeys = new Set<string>();
    const edges: CodeGraphEdge[] = [];
    for (const e of allEdges) {
      if (!seenNodes.has(e.source) || !seenNodes.has(e.target)) continue;
      const key = `${e.source} ${e.target}`;
      if (seenEdgeKeys.has(key)) continue;
      seenEdgeKeys.add(key);
      edges.push(e);
    }

    const codeGraph: CodeGraph = {
      generatedAt: new Date().toISOString(),
      repositories: repos.slice(),
      nodes,
      edges,
      communities: labels,
      godNodes,
    };

    onProgress?.('保存中', 97);
    this.save(codeGraph);
    const repoKey = this.defaultRepoName();
    if (repoKey) this.cached.set(repoKey, codeGraph);
    onProgress?.('', 100);
    return codeGraph;
  }

  private runAnalyze(repo: CodeGraphRepository): TrailGraph | undefined {
    const tsconfigPath = path.join(repo.path, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      this.logger.info(
        `[CodeGraphService] tsconfig not found for ${repo.label}, skipping code analysis`,
      );
      return undefined;
    }
    try {
      // analyze-exclude を反映する。TrailGraph 生成時から test や除外ディレクトリを
      // 落とすことで、後段の CodeGraph 経由の current_file_analysis にも流入しない。
      const exclude = loadAnalyzeExclude(repo.path);
      return analyze({ tsconfigPath, exclude });
    } catch (err) {
      this.logger.error(
        `[CodeGraphService] analyze() failed for ${repo.label} (${tsconfigPath})`,
        err,
      );
      return undefined;
    }
  }

  private save(graph: CodeGraph): void {
    const repoName = this.config.repositories[0]?.label ?? path.basename(this.config.repositories[0]?.path ?? '');
    if (this.config.trailDb && repoName) {
      this.config.trailDb.saveCurrentCodeGraph(repoName, graph);
      this.logger.info(`Code graph saved to DB (repo=${repoName})`);
    } else {
      this.logger.warn('[CodeGraphService] save() skipped: trailDb not configured');
    }
  }
}
