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

  /**
   * config.repositories をリポジトリ単位で個別に解析し、各リポジトリの
   * ノード/エッジのみを含む CodeGraph を生成・個別保存する。
   *
   * 旧実装（全リポを 1 つの統合グラフへマージし repositories[0] 名で 1 回保存）は廃止。
   * リポ横断マージは行わない。
   *
   * @returns config.repositories の順に並んだ、リポジトリごとの CodeGraph 配列。
   *          空 repositories の場合は空配列を返し、save も行わない。
   */
  async generate(onProgress?: ProgressCallback): Promise<CodeGraph[]> {
    const repos = this.config.repositories;
    onProgress?.('ファイル検出中', 0);

    if (repos.length === 0) {
      onProgress?.('', 100);
      return [];
    }

    const trailGraphCache = this.config.trailGraphProvider?.() ?? {};
    const results: CodeGraph[] = [];

    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i];
      // 各リポジトリを 0→100 のうち均等配分した区間で進捗通知する。
      const base = (i / repos.length) * 100;
      const span = 100 / repos.length;
      const repoProgress: ProgressCallback | undefined = onProgress
        ? (phase, percent) => onProgress(phase, Math.round(base + (percent / 100) * span))
        : undefined;

      const codeGraph = this.generateForRepo(repo, trailGraphCache, repoProgress);

      onProgress?.('保存中', Math.round(base + span * 0.97));
      this.save(repo, codeGraph);
      // cache キーは save() / defaultRepoName() と同じ解決規則（label 優先、空なら basename）。
      const repoKey = repo.label || path.basename(repo.path);
      this.cached.set(repoKey, codeGraph);
      results.push(codeGraph);
    }

    onProgress?.('', 100);
    return results;
  }

  /**
   * 単一リポジトリについて detect → build → cluster → layout を行い、
   * そのリポジトリのノード/エッジのみを含む CodeGraph を組み立てる（保存はしない）。
   */
  private generateForRepo(
    repo: CodeGraphRepository,
    trailGraphCache: Record<string, TrailGraph | undefined>,
    onProgress?: ProgressCallback,
  ): CodeGraph {
    onProgress?.(`${repo.label} を解析中`, 0);

    const excludePatterns = this.config.excludePatterns ?? loadAnalyzeExclude(repo.path);
    const detector = new GraphDetector(repo.path, excludePatterns);
    const docFiles = detector.detectDocFiles();

    const trailGraph = trailGraphCache[repo.id] ?? this.runAnalyze(repo);

    const { nodes: repoNodes, edges: repoEdges } = trailGraphToCodeGraphInputs({
      repoId: repo.id,
      repoRootPath: repo.path,
      trailGraph,
      docFiles,
    });

    onProgress?.('グラフ構築中', 65);
    const builder = new GraphBuilder();
    const seenNodes = new Set<string>();
    for (const n of repoNodes) {
      if (!seenNodes.has(n.id)) {
        builder.addNode(n);
        seenNodes.add(n.id);
      }
    }
    for (const e of repoEdges) builder.addEdge(e);
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
    for (const e of repoEdges) {
      if (!seenNodes.has(e.source) || !seenNodes.has(e.target)) continue;
      const key = `${e.source} ${e.target}`;
      if (seenEdgeKeys.has(key)) continue;
      seenEdgeKeys.add(key);
      edges.push(e);
    }

    return {
      generatedAt: new Date().toISOString(),
      // per-repo グラフなので repositories は当該リポジトリ 1 件のみ。
      repositories: [repo],
      nodes,
      edges,
      communities: labels,
      godNodes,
    };
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

  private save(repo: CodeGraphRepository, graph: CodeGraph): void {
    const repoName = repo.label || path.basename(repo.path);
    if (this.config.trailDb && repoName) {
      this.config.trailDb.saveCurrentCodeGraph(repoName, graph);
      this.logger.info(`Code graph saved to DB (repo=${repoName})`);
    } else {
      this.logger.warn('[CodeGraphService] save() skipped: trailDb not configured');
    }
  }
}
