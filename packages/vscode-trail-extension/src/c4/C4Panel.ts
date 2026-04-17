import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  buildSourceMatrix,
  clusterMatrix,
  computeImportanceMatrix,
} from '@anytime-markdown/trail-core/c4';
import type { DsmMatrix, FeatureMatrix, ImportanceMatrix } from '@anytime-markdown/trail-core/c4';
import { analyze, trailToC4 } from '@anytime-markdown/trail-core';
import type { TrailGraph } from '@anytime-markdown/trail-core';
import type { C4DataProvider } from '../server/TrailDataServer';
import type { TrailDataServer } from '../server/TrailDataServer';
import { TrailLogger } from '../utils/TrailLogger';
import type { TrailDatabase } from '../trail/TrailDatabase';
import { ExecFileGitService } from '../trail/ExecFileGitService';
import { ClaudeStatusWatcher } from '@anytime-markdown/vscode-common';
import { ClaudeActivityTracker } from './ClaudeActivityTracker';

/**
 * C4モデルのデータ管理を担当するシングルトン。
 * Webview は持たず、TrailDataServer 経由でスタンドアロンビューアにデータを配信する。
 * C4モデル本体は SQLite (trail_current_graphs) に保存し、TrailDataServer が直接読み込む。
 */
export class C4Panel implements C4DataProvider {
  private static instance: C4Panel | undefined;
  private static dataServer: TrailDataServer | undefined;
  private static trailDb: TrailDatabase | undefined;

  private lastFeatureMatrix: FeatureMatrix | undefined;
  private lastTrailGraph: TrailGraph | undefined;
  private lastTsconfigPath: string | undefined;
  private lastSourceMatrix: DsmMatrix | undefined;
  private dsmLevel: 'component' | 'package' = 'component';
  private lastImportanceMatrix: ImportanceMatrix | undefined;
  private claudeWatcher: ClaudeStatusWatcher | null = null;
  private claudeTracker: ClaudeActivityTracker | null = null;

  private constructor() {}

  // -------------------------------------------------------------------------
  //  Static setup
  // -------------------------------------------------------------------------

  public static setDataServer(server: TrailDataServer): void {
    C4Panel.dataServer = server;
  }

  public static setTrailDatabase(db: TrailDatabase): void {
    C4Panel.trailDb = db;
    // 保存済みグラフがあればアクティビティトラッキングを起動する。
    // analyzeWorkspace() を実行していない場合（VS Code 再起動後・保存済みグラフ利用時）でも
    // クロードコードの編集ハイライトが機能するようにする。
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const repoName = wsRoot ? path.basename(wsRoot) : undefined;
    try {
      const savedGraph = db.getCurrentGraph(repoName);
      if (savedGraph) {
        const panel = C4Panel.getInstance();
        panel.lastTrailGraph ??= savedGraph;
        panel.startClaudeActivityTracking(savedGraph.metadata.projectRoot);
      }
    } catch {
      // DB 初期化前やグラフ未保存の場合は無視。analyzeWorkspace() 実行時に再試行される。
    }
  }

  public static getDataProvider(): C4DataProvider | undefined {
    return C4Panel.getInstance();
  }

  public static disposeClaudeWatcher(): void {
    const inst = C4Panel.instance;
    inst?.claudeWatcher?.dispose();
    inst?.claudeTracker?.dispose();
    if (inst) {
      inst.claudeWatcher = null;
      inst.claudeTracker = null;
    }
  }

  private static viewerOpened = false;

  /**
   * サーバーが稼働中ならブラウザでスタンドアロンビューアを開く。
   * WebSocket クライアントが接続中の場合はビューアが既に表示されているため開かない。
   * force=true の場合は viewerOpened ガードを無視する（ただし接続中チェックは常に有効）。
   */
  public static openViewer(force = false): void {
    if (!C4Panel.dataServer?.isRunning) return;
    // WebSocket 接続中のクライアントがいれば既に表示済み → 新規ウィンドウを開かない
    if ((C4Panel.dataServer.clientCount ?? 0) > 0) return;
    if (!force && C4Panel.viewerOpened) return;
    C4Panel.viewerOpened = true;
    // setTrailDatabase 時点でグラフがなかった場合のフォールバック（import 後に初めて開く場合等）
    const panel = C4Panel.getInstance();
    if (!panel.claudeWatcher && C4Panel.trailDb) {
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const repoName = wsRoot ? path.basename(wsRoot) : undefined;
      try {
        const savedGraph = C4Panel.trailDb.getCurrentGraph(repoName);
        if (savedGraph) {
          panel.lastTrailGraph ??= savedGraph;
          panel.startClaudeActivityTracking(savedGraph.metadata.projectRoot);
        }
      } catch {
        // グラフ未保存の場合は無視
      }
    }
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

  public get featureMatrix(): FeatureMatrix | undefined { return this.lastFeatureMatrix; }
  public get sourceMatrix(): DsmMatrix | undefined { return this.lastSourceMatrix; }
  public get currentDsmLevel(): 'component' | 'package' { return this.dsmLevel; }
  public get importanceMatrix(): ImportanceMatrix | undefined { return this.lastImportanceMatrix; }
  public get trailGraph(): TrailGraph | undefined { return this.lastTrailGraph; }

  /** anytimeTrail.coverage.path を絶対パスに解決して返す。未設定なら undefined */
  public get coveragePath(): string | undefined {
    const raw = vscode.workspace.getConfiguration('anytimeTrail.coverage').get<string>('path', '');
    if (!raw) return undefined;
    if (path.isAbsolute(raw)) return raw;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return undefined;
    return path.join(workspaceRoot, raw);
  }

  /** 解析済み TrailGraph の projectRoot。未解析時はワークスペースルートにフォールバック */
  public get projectRoot(): string | undefined {
    return this.lastTrailGraph?.metadata.projectRoot
      ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

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

  public handleResetClaudeActivity(): void {
    this.claudeTracker?.resetTouched();
    this.claudeWatcher?.clearEdits();
    C4Panel.dataServer?.notifyMultiAgentActivity([], []);
    C4Panel.dataServer?.notifyClaudeActivity([], [], []);
  }

  // -------------------------------------------------------------------------
  //  Commands
  // -------------------------------------------------------------------------

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

          const panel = C4Panel.getInstance();
          panel.lastTrailGraph = graph;
          panel.lastTsconfigPath = tsconfigPath;
          panel.buildDsm();
          panel.buildImportanceMatrix(tsconfigPath);
          panel.startClaudeActivityTracking(graph.metadata.projectRoot);
          server?.notifyProgress('', 100);
        },
      );
      TrailLogger.info(`C4 analysis [${repoName}]: completed in ${Date.now() - startedAt}ms`);
    } catch (e) {
      TrailLogger.error(`C4 analysis [${repoName}] failed`, e);
      vscode.window.showErrorMessage(`C4 analysis failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // -------------------------------------------------------------------------
  //  Internal data management
  // -------------------------------------------------------------------------

  /** Claude Code のファイル編集監視を起動し、C4 要素への紐付けを更新する */
  private startClaudeActivityTracking(projectRoot: string): void {
    if (!this.claudeWatcher) {
      // フックは VS Code ワークスペースルートの storagePath/ に書き込むため、
      // tsconfig の projectRoot ではなくワークスペースルートを使用する。
      const watchRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? projectRoot;
      const statusDir = vscode.workspace.getConfiguration('anytimeTrail.claudeStatus').get<string>('directory', '') || '.vscode';
      this.claudeWatcher = new ClaudeStatusWatcher(watchRoot, statusDir);
      this.claudeTracker = new ClaudeActivityTracker();
      this.claudeTracker.onChange((state) => {
        C4Panel.dataServer?.notifyMultiAgentActivity(state.agents, state.conflicts);
        C4Panel.dataServer?.notifyClaudeActivity(
          state.merged.activeElementIds,
          state.merged.touchedElementIds,
          state.merged.plannedElementIds,
        );
      });
      this.claudeWatcher.onStatusChange(this.claudeTracker.onFileEditing);
      this.claudeWatcher.onMultiStatusChange((agents) => {
        if (this.claudeTracker) {
          this.claudeTracker.updateAgents(agents);
        }
      });
    }
    // 解析結果から C4 モデルを構築してインデックスを更新
    if (this.lastTrailGraph && this.claudeTracker) {
      const model = trailToC4(this.lastTrailGraph);
      this.claudeTracker.setModel(model, projectRoot);
      TrailLogger.info(`ClaudeActivityTracker: model updated (${model.elements.length} elements, root=${projectRoot})`);

      // 全エージェントの状態を復元
      const agents = this.claudeWatcher!.getAgents();
      if (agents.size > 0) {
        this.claudeTracker.updateAgents(agents);
        TrailLogger.info(`ClaudeActivityTracker: restored ${agents.size} agent(s)`);
      } else {
        // 旧形式の単一ファイルからの復元（後方互換）
        const sessionEdits = this.claudeWatcher!.getSessionEdits();
        if (sessionEdits.length > 0) {
          this.claudeTracker.restoreSessionEdits(sessionEdits);
          TrailLogger.info(`ClaudeActivityTracker: restored ${sessionEdits.length} session edits (legacy)`);
        }
        const plannedEdits = this.claudeWatcher!.getPlannedEdits();
        if (plannedEdits.length > 0) {
          this.claudeTracker.setPlannedEdits(plannedEdits);
          TrailLogger.info(`ClaudeActivityTracker: restored ${plannedEdits.length} planned edits (legacy)`);
        }
      }
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

  /** tsconfig から ImportanceMatrix を計算してデータサーバーに通知 */
  public buildImportanceMatrix(tsconfigPath: string): void {
    const elements = this.lastTrailGraph ? trailToC4(this.lastTrailGraph).elements : undefined;
    if (!elements || elements.length === 0) {
      TrailLogger.warn('buildImportanceMatrix: no C4 elements available, skipping');
      return;
    }
    try {
      this.lastImportanceMatrix = computeImportanceMatrix(tsconfigPath, elements);
      C4Panel.dataServer?.notify('importance-updated');
    } catch (err) {
      TrailLogger.warn(`Failed to compute importance: ${(err as Error).message}`);
    }
  }
}
