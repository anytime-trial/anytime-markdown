import fs from 'node:fs';
import path from 'node:path';

import { analyze } from '@anytime-markdown/trail-core/analyze';
import type { TrailGraph } from '@anytime-markdown/trail-core';
import type { C4Element } from '@anytime-markdown/trail-core/c4';
import { loadAnalyzeExclude } from '@anytime-markdown/trail-core/analyzeExclude';

import { TrailLogger } from '../utils/TrailLogger';
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

export class CodeGraphService {
  private cached: CodeGraph | null = null;

  constructor(private readonly config: CodeGraphServiceConfig) {}

  getGraph(): CodeGraph | null {
    return this.cached;
  }

  async loadFromDb(): Promise<CodeGraph | null> {
    const repoName = this.config.repositories[0]?.label ?? path.basename(this.config.repositories[0]?.path ?? '');
    if (this.config.trailDb && repoName) {
      try {
        const graph = this.config.trailDb.getCurrentCodeGraph(repoName);
        if (graph) {
          this.cached = graph;
          return graph;
        }
      } catch (err) {
        TrailLogger.warn(`[CodeGraphService] DB not ready in loadFromDb: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return null;
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
    this.cached = codeGraph;
    onProgress?.('', 100);
    return codeGraph;
  }

  private runAnalyze(repo: CodeGraphRepository): TrailGraph | undefined {
    const tsconfigPath = path.join(repo.path, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      TrailLogger.info(
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
      TrailLogger.error(
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
      TrailLogger.info(`Code graph saved to DB (repo=${repoName})`);
    } else {
      TrailLogger.warn('[CodeGraphService] save() skipped: trailDb not configured');
    }
  }
}
