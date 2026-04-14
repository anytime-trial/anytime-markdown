import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseMermaidC4,
  extractBoundaries,
  buildSourceMatrix,
  clusterMatrix,
  parseCoverage,
  aggregateCoverage,
  computeCoverageDiff,
  computeComplexityMatrix,
} from '@anytime-markdown/trail-core/c4';
import type { C4Element, C4Model, C4Relationship, BoundaryInfo, ComplexityMatrix, CoverageDiffMatrix, CoverageMatrix, DsmMatrix, FeatureMatrix, MessageInput } from '@anytime-markdown/trail-core/c4';
import { analyze, toMermaid } from '@anytime-markdown/trail-core';
import type { TrailGraph } from '@anytime-markdown/trail-core';
import type { C4DataProvider } from '../server/TrailDataServer';
import type { TrailDataServer } from '../server/TrailDataServer';
import { TrailLogger } from '../utils/TrailLogger';
import { CoverageHistory } from './coverageHistory';
import { CoverageWatcher } from './coverageWatcher';
import type { TrailDatabase } from '../trail/TrailDatabase';
import { ExecFileGitService } from '../trail/ExecFileGitService';

/**
 * C4モデルのデータ管理を担当するシングルトン。
 * Webview は持たず、TrailDataServer 経由でスタンドアロンビューアにデータを配信する。
 */
export class C4Panel implements C4DataProvider {
  private static instance: C4Panel | undefined;
  private static dataServer: TrailDataServer | undefined;
  private static trailDb: TrailDatabase | undefined;

  private lastModel: C4Model | undefined;
  private lastBoundaries: readonly BoundaryInfo[] | undefined;
  private lastFeatureMatrix: FeatureMatrix | undefined;
  private lastTrailGraph: TrailGraph | undefined;
  private lastProjectRoot: string | undefined;
  private lastTsconfigPath: string | undefined;
  private lastSourceMatrix: DsmMatrix | undefined;
  private dsmLevel: 'component' | 'package' = 'component';
  private lastCoverageMatrix: CoverageMatrix | undefined;
  private lastCoverageDiff: CoverageDiffMatrix | undefined;
  private lastComplexityMatrix: ComplexityMatrix | undefined;
  private coverageHistory: CoverageHistory | undefined;
  private coverageWatcher: CoverageWatcher | undefined;

  private constructor() {}

  // -------------------------------------------------------------------------
  //  Static setup
  // -------------------------------------------------------------------------

  public static setDataServer(server: TrailDataServer): void {
    C4Panel.dataServer = server;
  }

  public static setTrailDatabase(db: TrailDatabase): void {
    C4Panel.trailDb = db;
  }

  public static getDataProvider(): C4DataProvider | undefined {
    return C4Panel.getInstance();
  }

  private static viewerOpened = false;

  /**
   * サーバーが稼働中ならブラウザでスタンドアロンビューアを開く。
   * force=true の場合は viewerOpened ガードを無視して必ず開く。
   */
  public static openViewer(force = false): void {
    if (!C4Panel.dataServer?.isRunning) return;
    if (!force && C4Panel.viewerOpened) return;
    C4Panel.viewerOpened = true;
    const port = vscode.workspace.getConfiguration('anytimeTrail.trailServer').get<number>('port', 19841);
    vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`));
  }

  private static getInstance(): C4Panel {
    C4Panel.instance ??= new C4Panel();
    return C4Panel.instance;
  }

  // -------------------------------------------------------------------------
  //  C4DataProvider interface
  // -------------------------------------------------------------------------

  public get model(): C4Model | undefined { return this.lastModel; }
  public get boundaries(): readonly BoundaryInfo[] | undefined { return this.lastBoundaries; }
  public get featureMatrix(): FeatureMatrix | undefined { return this.lastFeatureMatrix; }
  public get sourceMatrix(): DsmMatrix | undefined { return this.lastSourceMatrix; }
  public get currentDsmLevel(): 'component' | 'package' { return this.dsmLevel; }
  public get coverageMatrix(): CoverageMatrix | undefined { return this.lastCoverageMatrix; }
  public get coverageDiff(): CoverageDiffMatrix | undefined { return this.lastCoverageDiff; }
  public get complexityMatrix(): ComplexityMatrix | undefined { return this.lastComplexityMatrix; }
  public get trailGraph(): TrailGraph | undefined { return this.lastTrailGraph; }

  public handleSetDsmLevel(level: 'component' | 'package'): void {
    this.dsmLevel = level;
    this.buildDsm();
  }

  public handleCluster(enabled: boolean): void {
    this.buildDsm(enabled);
  }

  public handleRefresh(): void {
    this.buildDsm();
  }

  // -------------------------------------------------------------------------
  //  Editing handlers (manual L1 elements)
  // -------------------------------------------------------------------------

  private nextManualId(): string {
    return `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  public handleAddElement(element: { type: 'person' | 'system'; name: string; description?: string; external?: boolean }): void {
    if (!this.lastModel) return;
    const newElement: C4Element = {
      id: this.nextManualId(),
      type: element.type,
      name: element.name,
      ...(element.description ? { description: element.description } : {}),
      ...(element.external !== undefined ? { external: element.external } : {}),
      manual: true,
    };
    const model: C4Model = {
      ...this.lastModel,
      elements: [...this.lastModel.elements, newElement],
    };
    this.setModel(model, this.lastBoundaries);
  }

  public handleUpdateElement(id: string, changes: { name?: string; description?: string; external?: boolean }): void {
    if (!this.lastModel) return;
    const elem = this.lastModel.elements.find(e => e.id === id);
    if (!elem?.manual) return; // 手動要素のみ編集可能
    const model: C4Model = {
      ...this.lastModel,
      elements: this.lastModel.elements.map(e =>
        e.id === id ? { ...e, ...changes } : e,
      ),
    };
    this.setModel(model, this.lastBoundaries);
  }

  public handleRemoveElement(id: string): void {
    if (!this.lastModel) return;
    const elem = this.lastModel.elements.find(e => e.id === id);
    if (!elem?.manual && !elem?.deleted) return; // 手動要素 or 削除フラグ付き要素のみ削除可能
    const model: C4Model = {
      ...this.lastModel,
      elements: this.lastModel.elements.filter(e => e.id !== id),
      relationships: this.lastModel.relationships.filter(r => r.from !== id && r.to !== id),
    };
    // FeatureMatrix からも関連マッピングを除去
    if (this.lastFeatureMatrix) {
      this.lastFeatureMatrix = {
        ...this.lastFeatureMatrix,
        mappings: this.lastFeatureMatrix.mappings.filter(m => m.elementId !== id),
      };
    }
    this.setModel(model, this.lastBoundaries);
  }

  public handlePurgeDeletedElements(): void {
    if (!this.lastModel) return;
    const deletedIds = new Set(
      this.lastModel.elements.filter(e => e.deleted).map(e => e.id),
    );
    if (deletedIds.size === 0) return;
    const model: C4Model = {
      ...this.lastModel,
      elements: this.lastModel.elements.filter(e => !e.deleted),
      relationships: this.lastModel.relationships.filter(
        r => !deletedIds.has(r.from) && !deletedIds.has(r.to),
      ),
    };
    // FeatureMatrix からも関連マッピングを除去
    if (this.lastFeatureMatrix) {
      this.lastFeatureMatrix = {
        ...this.lastFeatureMatrix,
        mappings: this.lastFeatureMatrix.mappings.filter(m => !deletedIds.has(m.elementId)),
      };
    }
    this.setModel(model, this.lastBoundaries);
  }

  public handleAddRelationship(from: string, to: string, label?: string, technology?: string): void {
    if (!this.lastModel) return;
    const newRel: C4Relationship = {
      from,
      to,
      ...(label ? { label } : {}),
      ...(technology ? { technology } : {}),
      manual: true,
    };
    const model: C4Model = {
      ...this.lastModel,
      relationships: [...this.lastModel.relationships, newRel],
    };
    this.setModel(model, this.lastBoundaries);
  }

  public handleRemoveRelationship(from: string, to: string): void {
    if (!this.lastModel) return;
    const model: C4Model = {
      ...this.lastModel,
      relationships: this.lastModel.relationships.filter(
        r => !(r.from === from && r.to === to && r.manual),
      ),
    };
    this.setModel(model, this.lastBoundaries);
  }

  // -------------------------------------------------------------------------
  //  Model persistence
  // -------------------------------------------------------------------------

  private static resolveModelPath(): string | null {
    const configured = vscode.workspace.getConfiguration('anytimeTrail.c4').get<string>('modelPath', '.vscode/c4-model.json');
    if (!configured) return null;
    if (path.isAbsolute(configured)) return configured;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return null;
    return path.join(root, configured);
  }

  private static saveModel(model: C4Model, boundaries: readonly BoundaryInfo[], featureMatrix?: FeatureMatrix): void {
    const filePath = C4Panel.resolveModelPath();
    if (!filePath) return;
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data: Record<string, unknown> = { model, boundaries };
      if (featureMatrix) {
        // featureMatrix にプロジェクトメタデータを付与
        const panel = C4Panel.instance;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const fmData: Record<string, unknown> = { ...featureMatrix };
        if (workspaceRoot) {
          const pkgPath = path.join(workspaceRoot, 'package.json');
          if (fs.existsSync(pkgPath)) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
              fmData.project = pkg.name ?? path.basename(workspaceRoot);
            } catch {
              fmData.project = path.basename(workspaceRoot);
            }
          }
        }
        if (panel?.lastTsconfigPath && workspaceRoot) {
          fmData.tsconfig = path.relative(workspaceRoot, panel.lastTsconfigPath);
        }
        data.featureMatrix = fmData;
      }
      const jsonStr = JSON.stringify(data, null, 2);
      fs.writeFileSync(filePath, jsonStr, 'utf-8');

    } catch (err) {
      TrailLogger.error('Failed to save C4 model', err);
    }
  }

  public static loadSavedModel(): { model: C4Model; boundaries: BoundaryInfo[]; featureMatrix?: FeatureMatrix } | null {
    const filePath = C4Panel.resolveModelPath();
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data?.model?.elements && Array.isArray(data.model.elements)) {
        return {
          model: data.model,
          boundaries: data.boundaries ?? [],
          ...(data.featureMatrix ? { featureMatrix: data.featureMatrix } : {}),
        };
      }
    } catch (err) {
      TrailLogger.warn('Failed to parse saved C4 model');
    }
    return null;
  }

  /** 保存済みモデルを復元して配信する。サーバー起動後に呼ぶ。 */
  public static restoreSavedModel(): boolean {
    const saved = C4Panel.loadSavedModel();
    if (!saved) return false;
    const panel = C4Panel.getInstance();
    panel.lastFeatureMatrix = saved.featureMatrix;
    if (!panel.lastProjectRoot) {
      panel.lastProjectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }
    panel.setModel(saved.model, saved.boundaries);
    return true;
  }

  // -------------------------------------------------------------------------
  //  Commands
  // -------------------------------------------------------------------------

  /** Mermaid C4 ファイルをインポート */
  public static async importMermaid(): Promise<void> {
    const files = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: { 'Mermaid C4': ['mmd', 'mermaid', 'txt'] },
      title: 'Import Mermaid C4 Diagram',
    });
    if (!files?.[0]) return;

    const content = await vscode.workspace.fs.readFile(files[0]);
    const text = Buffer.from(content).toString('utf-8');

    try {
      const boundaries = extractBoundaries(text);
      const model = parseMermaidC4(text);

      const panel = C4Panel.getInstance();
      panel.lastTrailGraph = undefined;
      panel.setModel(model, boundaries);
      C4Panel.openViewer();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Failed to parse Mermaid C4: ${msg}`);
    }
  }

  /** ワークスペースの TypeScript を trail-core で解析 */
  public static async analyzeWorkspace(): Promise<void> {
    const repoName = vscode.workspace.workspaceFolders?.[0]?.name ?? '(no workspace)';
    TrailLogger.info(`C4 analysis [${repoName}]: searching tsconfig.json in workspace`);
    const excludePatterns: readonly string[] = vscode.workspace.getConfiguration('anytimeTrail.c4').get<string[]>('analyzeExcludePatterns', ['.worktrees', '.vscode-test', '__tests__', 'fixtures']);
    const allTsconfigFiles = await vscode.workspace.findFiles('**/tsconfig.json', '**/node_modules/**');
    const tsconfigFiles = allTsconfigFiles
      .filter(f => !excludePatterns.some(p => f.fsPath.includes(`/${p}/`)))
      .sort((a, b) => {
        // ルートの tsconfig.json を先頭にし、残りはパス順
        const aRel = vscode.workspace.asRelativePath(a);
        const bRel = vscode.workspace.asRelativePath(b);
        const aDepth = aRel.split('/').length;
        const bDepth = bRel.split('/').length;
        return aDepth !== bDepth ? aDepth - bDepth : aRel.localeCompare(bRel);
      });
    if (tsconfigFiles.length === 0) {
      TrailLogger.warn(`C4 analysis [${repoName}]: no tsconfig.json found in workspace`);
      vscode.window.showWarningMessage('No tsconfig.json found in workspace.');
      return;
    }

    let tsconfigPath: string;
    if (tsconfigFiles.length === 1) {
      tsconfigPath = tsconfigFiles[0].fsPath;
    } else {
      const items = tsconfigFiles.map(f => {
        const rel = vscode.workspace.asRelativePath(f);
        const isRoot = !rel.includes('/');
        return {
          label: rel,
          description: isRoot ? '(workspace root — analyzes all packages)' : undefined,
          uri: f,
        };
      });
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select tsconfig.json to analyze',
        matchOnDescription: true,
      });
      if (!picked) {
        TrailLogger.info(`C4 analysis [${repoName}]: cancelled at tsconfig selection`);
        return;
      }
      tsconfigPath = picked.uri.fsPath;
    }

    TrailLogger.info(`C4 analysis [${repoName}]: starting for ${tsconfigPath}`);
    const startedAt = Date.now();
    C4Panel.openViewer(true);

    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'C4 Analysis', cancellable: false },
        async (progress) => {
          const server = C4Panel.dataServer;
          const phases = ['Loading project...', 'Extracting symbols...', 'Extracting dependencies...', 'Filtering results...'];
          const phasePercent = (phase: string): number => {
            const idx = phases.indexOf(phase);
            return idx >= 0 ? Math.round((idx / phases.length) * 100) : -1;
          };

          server?.notifyProgress('Loading project...', 0);
          const graph = analyze({
            tsconfigPath,
            onProgress: (phase) => {
              TrailLogger.info(`C4 analysis [${repoName}]: ${phase}`);
              progress.report({ message: phase });
              server?.notifyProgress(phase, phasePercent(phase));
            },
          });

          TrailLogger.info(
            `C4 analysis [${repoName}]: analyzed ${graph.metadata.fileCount} files, ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
          );

          // TrailGraph を current_graphs テーブルに保存（HEAD コミット ID 付き、repo_name をキーに）
          // releases.repo_name と整合させるため path.basename(gitRoot) を使用する
          const gitRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
          const dbRepoName = gitRoot ? path.basename(gitRoot) : repoName;
          const commitId = gitRoot ? new ExecFileGitService(gitRoot).getHeadCommit() : '';
          C4Panel.trailDb?.saveCurrentGraph(graph, tsconfigPath, commitId, dbRepoName);
          TrailLogger.info(`C4 analysis [${repoName}]: TrailGraph saved to current_graphs (repo=${dbRepoName}, commit=${commitId || 'unknown'})`);

          // TODO: C4モデル変換・マージは一旦コメントアウト
          // progress.report({ message: 'Building C4 model...' });
          // server?.notifyProgress('Building C4 model...', 80);
          // const analyzed = trailToC4(graph);
          //
          // // 既存の手動要素を保持し、消失した解析要素に削除フラグを付与してマージ
          // const panel = C4Panel.getInstance();
          // const prevElements = panel.lastModel?.elements ?? [];
          // const prevRels = panel.lastModel?.relationships ?? [];
          //
          // const analyzedIdSet = new Set(analyzed.elements.map(e => e.id));
          //
          // // 手動要素: そのまま保持
          // const manualElements = prevElements.filter(e => e.manual);
          // // 解析由来の前回要素: 新結果に不在なら deleted フラグ付与
          // const deletedElements = prevElements
          //   .filter(e => !e.manual && !e.deleted && !analyzedIdSet.has(e.id))
          //   .map(e => ({ ...e, deleted: true }));
          // // 前回すでに deleted だった要素: そのまま保持（新結果に復活していなければ）
          // const prevDeletedElements = prevElements
          //   .filter(e => e.deleted && !analyzedIdSet.has(e.id));
          //
          // const manualRels = prevRels.filter(r => r.manual);
          //
          // const model: C4Model = {
          //   ...analyzed,
          //   elements: [...analyzed.elements, ...manualElements, ...deletedElements, ...prevDeletedElements],
          //   relationships: [...analyzed.relationships, ...manualRels],
          // };
          //
          // panel.setModel(model);

          const panel = C4Panel.getInstance();
          panel.lastTrailGraph = graph;
          panel.lastProjectRoot = graph.metadata.projectRoot;
          panel.lastTsconfigPath = tsconfigPath;
          panel.buildDsm();
          server?.notifyProgress('', 100);
        },
      );
      TrailLogger.info(`C4 analysis [${repoName}]: completed in ${Date.now() - startedAt}ms`);
    } catch (e) {
      TrailLogger.error(`C4 analysis [${repoName}] failed`, e);
      vscode.window.showErrorMessage(`C4 analysis failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** 解析データをエクスポート（形式選択） */
  public static async exportData(): Promise<void> {
    const panel = C4Panel.instance;
    if (!panel?.lastModel) {
      vscode.window.showWarningMessage('No C4 model to export. Run Import or Analyze first.');
      return;
    }

    const formats = [
      { label: 'JSON (C4 Model)', format: 'json' },
      { label: 'Mermaid (Module Dependencies)', format: 'mermaid' },
    ];
    const available = panel.lastTrailGraph ? formats : [formats[0]];

    const picked = available.length === 1
      ? available[0]
      : await vscode.window.showQuickPick(available, { placeHolder: 'Select export format' });
    if (!picked) return;

    if (picked.format === 'mermaid') {
      await C4Panel.exportMermaid(panel);
    } else {
      await C4Panel.exportJson(panel);
    }
  }

  private static async exportJson(panel: C4Panel): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      filters: { 'JSON': ['json'] },
      defaultUri: vscode.Uri.file('c4-model.json'),
      title: 'Export C4 Model',
    });
    if (!uri) return;

    const data = {
      model: panel.lastModel,
      boundaries: panel.lastBoundaries ?? [],
    };
    const content = Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
    await vscode.workspace.fs.writeFile(uri, content);
    vscode.window.showInformationMessage(`Exported to ${vscode.workspace.asRelativePath(uri)}`);
  }

  private static async exportMermaid(panel: C4Panel): Promise<void> {
    if (!panel.lastTrailGraph) return;

    const uri = await vscode.window.showSaveDialog({
      filters: { 'Mermaid': ['mmd'] },
      defaultUri: vscode.Uri.file('deps.mmd'),
      title: 'Export Mermaid Dependencies',
    });
    if (!uri) return;

    const mermaid = toMermaid(panel.lastTrailGraph);
    const content = Buffer.from(mermaid, 'utf-8');
    await vscode.workspace.fs.writeFile(uri, content);
    vscode.window.showInformationMessage(`Exported to ${vscode.workspace.asRelativePath(uri)}`);
  }

  // -------------------------------------------------------------------------
  //  Coverage
  // -------------------------------------------------------------------------

  public loadCoverage(coveragePath: string): void {
    if (!this.lastModel || !this.lastProjectRoot) {
      TrailLogger.warn('loadCoverage: model or projectRoot not available');
      return;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
      const files = parseCoverage(raw);
      const matrix = aggregateCoverage(files, this.lastModel, this.lastProjectRoot);
      this.lastCoverageMatrix = matrix;

      this.ensureHistory();
      const previous = this.coverageHistory!.loadLatest();
      this.coverageHistory!.save(matrix);

      if (previous) {
        this.lastCoverageDiff = computeCoverageDiff(previous, matrix);
      } else {
        this.lastCoverageDiff = undefined;
      }

      C4Panel.dataServer?.notify('coverage-updated');
      C4Panel.dataServer?.notify('coverage-diff-updated');
      TrailLogger.info(`Coverage loaded: ${matrix.entries.length} entries`);
    } catch (err) {
      TrailLogger.warn(`Failed to load coverage: ${(err as Error).message}`);
    }
  }

  public startCoverageWatch(coveragePath: string): void {
    this.coverageWatcher?.stop();
    this.coverageWatcher = new CoverageWatcher(
      (filePath) => this.loadCoverage(filePath),
      TrailLogger,
    );
    this.coverageWatcher.start(coveragePath);
  }

  public stopCoverageWatch(): void {
    this.coverageWatcher?.stop();
    this.coverageWatcher = undefined;
  }

  private ensureHistory(): void {
    if (this.coverageHistory) return;
    if (!this.lastProjectRoot) return;
    const historyDir = path.join(this.lastProjectRoot, '.anytime-trail', 'coverage-history');
    const limit = vscode.workspace.getConfiguration('anytimeTrail.coverage').get<number>('historyLimit', 50);
    this.coverageHistory = new CoverageHistory(historyDir, limit);
  }

  public static loadCoverageData(coveragePath: string): void {
    C4Panel.getInstance().loadCoverage(coveragePath);
  }

  public static startCoverageWatch(coveragePath: string): void {
    C4Panel.getInstance().startCoverageWatch(coveragePath);
  }

  public static stopCoverageWatch(): void {
    C4Panel.getInstance().stopCoverageWatch();
  }

  // -------------------------------------------------------------------------
  //  Internal data management
  // -------------------------------------------------------------------------

  /** モデルを設定し、ツリー・保存・DSM・通知を更新 */
  private setModel(model: C4Model, boundaries?: readonly BoundaryInfo[]): void {
    if (this.lastModel === model && this.lastBoundaries === boundaries) return;
    this.lastModel = model;
    this.lastBoundaries = boundaries;
    C4Panel.saveModel(model, boundaries ?? [], this.lastFeatureMatrix);
    this.buildDsm();
    void vscode.commands.executeCommand('setContext', 'anytimeTrail.c4ModelLoaded', true);
    C4Panel.dataServer?.notify('model-updated');
    this.computeAndCacheComplexity();
  }

  /** メッセージ履歴から複雑度マトリクスを計算してキャッシュ */
  private computeAndCacheComplexity(): void {
    if (!this.lastModel || !C4Panel.trailDb) return;
    try {
      const rows = C4Panel.trailDb.getAllAssistantMessages();
      const inputs: MessageInput[] = rows.map(row => {
        let toolCallNames: string[] = [];
        let editedFilePaths: string[] = [];
        if (row.tool_calls) {
          try {
            const calls = JSON.parse(row.tool_calls) as { name?: string; input?: Record<string, unknown> }[];
            if (Array.isArray(calls)) {
              toolCallNames = calls.map(c => c.name ?? '').filter(Boolean);
              editedFilePaths = calls
                .filter(c => c.name === 'Edit' || c.name === 'Write')
                .map(c => (typeof c.input?.file_path === 'string' ? c.input.file_path : ''))
                .filter(Boolean);
            }
          } catch {
            TrailLogger.warn(`Failed to parse tool_calls JSON`);
          }
        }
        return { outputTokens: row.output_tokens, toolCallNames, editedFilePaths };
      });
      this.lastComplexityMatrix = computeComplexityMatrix(inputs, this.lastModel.elements);
      C4Panel.dataServer?.notify('complexity-updated');
    } catch (err) {
      TrailLogger.warn(`Failed to compute complexity: ${(err as Error).message}`);
    }
  }

  /** DSM データをビルドしてデータサーバーに通知 */
  public buildDsm(cluster = false): void {
    if (!this.lastTrailGraph) return;

    try {
      let matrix = buildSourceMatrix(this.lastTrailGraph, this.dsmLevel);
      if (cluster) {
        matrix = clusterMatrix(matrix);
      }
      this.lastSourceMatrix = matrix;
      C4Panel.dataServer?.notify('dsm-updated');
    } catch (err) {
      TrailLogger.warn('DSM build failed');
    }
  }
}
