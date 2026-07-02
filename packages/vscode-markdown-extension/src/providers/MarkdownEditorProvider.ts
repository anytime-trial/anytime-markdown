import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveLocale } from '@anytime-markdown/vscode-common';
import { resolveRepositoryRoot, scanRepository, resolveDocPath } from '../noteGraph/scan';
import { addRelatedEntry, isSafeRelPath } from '../noteGraph/frontmatter';
import { coerceRelationType, type RelationType } from '../noteGraph/relations';
import { buildLinkCandidates } from '../utils/linkCandidates';
import { planLinkOpen } from '../utils/linkOpenTarget';
import {
  resolveLinkedMdCandidates,
  tokensMatch,
  type LinkedMdToken,
} from '../utils/linkedMdFs';
import { ClaudeLockTracker } from '../claude/ClaudeLockTracker';
import { MarkdownLogger } from '../utils/MarkdownLogger';

/** Claude editing=false 観測からロック解除を確定するまでの遅延 (ms)。 */
const CLAUDE_UNLOCK_DELAY_MS = 3000;
export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider, vscode.Disposable {
  public static readonly viewType = 'anytimeMarkdown';

  private static instance: MarkdownEditorProvider | null = null;
  private activePanel: vscode.WebviewPanel | null = null;
  public compareFileUri: vscode.Uri | null = null;
  public activeDocumentUri: vscode.Uri | null = null;
  public onHeadingsChanged?: (headings: unknown[]) => void;
  public onCommentsChanged?: (comments: unknown[]) => void;
  public onStatusChanged?: (status: { line: number; col: number; charCount: number; lineCount: number; lineEnding: string; encoding: string }) => void;
  public compareModeActive = false;
  public pendingCompareContent: string | null = null;
  public skipDiffDetection = false;
  /** アクティブパネルの autoReload 状態 */
  private autoReloadEnabled = true;
  private autoReloadSetter: ((enabled: boolean) => void) | null = null;
  /** アクティブパネルの editorMode 状態 */
  private editorMode: string = 'wysiwyg';
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  /** diff ビュー検出用: 最後にパネルが開かれた時刻 */
  private lastPanelOpenTime = 0;
  private readonly readyPanels = new Set<string>();
  private readonly readyResolvers = new Map<string, Array<() => void>>();

  public static getInstance(): MarkdownEditorProvider | null {
    return MarkdownEditorProvider.instance;
  }

  public postMessageToActivePanel(message: unknown): void {
    this.activePanel?.webview.postMessage(message);
  }

  /** エディタモードを切り替え、webview に通知する */
  public switchMode(mode: string): void {
    this.editorMode = mode;
    this.postMessageToActivePanel({ type: 'setMode', mode });
    vscode.commands.executeCommand('setContext', 'anytimeMarkdown.editorMode', mode);
  }

  /** autoReload の状態を切り替え、webview に通知する */
  public toggleAutoReload(): boolean {
    const next = !this.autoReloadEnabled;
    this.autoReloadEnabled = next;
    this.autoReloadSetter?.(next);
    this.postMessageToActivePanel({ type: 'setAutoReload', enabled: next });
    vscode.commands.executeCommand('setContext', 'anytimeMarkdown.autoReload', next);
    return next;
  }

  public waitForReady(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    if (this.readyPanels.has(key)) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const resolvers = this.readyResolvers.get(key) ?? [];
      resolvers.push(resolve);
      this.readyResolvers.set(key, resolvers);
    });
  }

  public postMessageToPanel(uri: vscode.Uri, message: unknown): boolean {
    const panel = this.panels.get(uri.toString());
    if (panel) {
      panel.webview.postMessage(message);
      return true;
    }
    return false;
  }

  /**
   * Claude Code 編集ロックのファイル別状態。解除は「対象ファイルのパネル」へ直接配信する
   * （`retainContextWhenHidden` のため非表示パネルにも届く）。アクティブパネル限定だと、
   * 解除確定の瞬間に別ファイルへ切り替えているとバナーが残る不具合があった。
   */
  private readonly claudeLock = new ClaudeLockTracker({
    unlockDelayMs: CLAUDE_UNLOCK_DELAY_MS,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    onLockChange: (filePath, locked) => this.postClaudeLock(filePath, locked),
  });

  /** 指定ファイルのパネルへロック状態を送る（存在しなければ no-op）。 */
  private postClaudeLock(filePath: string, locked: boolean): void {
    const panel = this.panels.get(vscode.Uri.file(filePath).toString());
    panel?.webview.postMessage({ type: 'setTheme', claudeLocked: locked });
  }

  public handleClaudeStatus(editing: boolean, filePath: string): void {
    this.claudeLock.setStatus(editing, filePath);
  }

  public static register(
    context: vscode.ExtensionContext,
    logLine?: (line: string) => void,
  ): vscode.Disposable {
    const provider = new MarkdownEditorProvider(context, logLine);
    MarkdownEditorProvider.instance = provider;
    return vscode.Disposable.from(
      provider,
      vscode.window.registerCustomEditorProvider(
        MarkdownEditorProvider.viewType,
        provider,
        { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }
      ),
    );
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logLine?: (line: string) => void,
  ) {}

  /** 保留中の Claude 編集ロック解除タイマーを破棄する（register() の Disposable 経路から呼ばれる）。 */
  public dispose(): void {
    this.claudeLock.dispose();
  }

  /** webview のエディタエラーバウンダリから転送された描画エラーを Output へ記録する */
  private handleEditorError(message: { [key: string]: unknown }): void {
    const ts = new Date().toISOString();
    const msg = typeof message.message === 'string' ? message.message : '';
    const stack = typeof message.stack === 'string' ? message.stack : '';
    const componentStack = typeof message.componentStack === 'string' ? message.componentStack : '';
    this.logLine?.(
      `[${ts}] [ERROR] [Editor] ${msg}\n${stack}\nComponent stack:${componentStack}`
    );
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const localResourceRoots = [
      vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
      vscode.Uri.joinPath(this.context.extensionUri, 'images'),
    ];

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
      localResourceRoots.push(workspaceFolder.uri);
    } else {
      const docDir = vscode.Uri.file(path.dirname(document.uri.fsPath));
      localResourceRoots.push(docDir);
    }

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    const docDirUri = vscode.Uri.file(path.dirname(document.uri.fsPath));
    const baseUri = webviewPanel.webview.asWebviewUri(docDirUri).toString();

    this.activePanel = webviewPanel;
    this.activeDocumentUri = document.uri;
    this.panels.set(document.uri.toString(), webviewPanel);
    vscode.commands.executeCommand('setContext', 'anytimeMarkdown.autoReload', this.autoReloadEnabled);
    vscode.commands.executeCommand('setContext', 'anytimeMarkdown.editorMode', this.editorMode);

    // diff ビュー検出: 1秒以内に2つ目のパネルが開かれた場合
    // skipDiffDetection が true の場合は拡張機能からの意図的なオープンなのでスキップ
    const now = Date.now();
    const isDiffView = !this.skipDiffDetection && now - this.lastPanelOpenTime < 1000;
    this.lastPanelOpenTime = now;
    this.skipDiffDetection = false;

    let isApplyingWebviewEdit = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    // 初回ロード後の TipTap 正規化による contentChanged を無視するタイムスタンプ
    // ready 受信後 3 秒以内の最初の contentChanged をスキップ
    let initialLoadTime = 0;
    let initialNormalizationSkipped = false;

    const isLargeFile = () => document.getText().length > 100 * 1024;

    const resolveThemeMode = (): 'light' | 'dark' => {
      const config = vscode.workspace.getConfiguration('anytimeMarkdown');
      const mode = config.get<string>('themeMode', 'auto');
      if (mode === 'light' || mode === 'dark') { return mode; }
      return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light
        || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight
        ? 'light' : 'dark';
    };

    const resolveLanguage = (): 'en' | 'ja' => {
      const config = vscode.workspace.getConfiguration('anytimeMarkdown');
      const lang = config.get<string>('language', 'auto');
      return resolveLocale(lang, vscode.env.language);
    };

    const sendTheme = () => {
      if (disposed) { return; }
      webviewPanel.webview.postMessage({
        type: 'setTheme',
        themeMode: resolveThemeMode(),
      });
    };

    const sendSettings = () => {
      if (disposed) { return; }
      const config = vscode.workspace.getConfiguration('anytimeMarkdown');
      webviewPanel.webview.postMessage({
        type: 'setSettings',
        settings: {
          fontSize: config.get<number>('fontSize', 0),
          measure: config.get<string>('measure', 'standard'),
          language: resolveLanguage(),
          themeMode: resolveThemeMode(),
          themePreset: config.get<string>('themePreset', 'handwritten'),
        },
      });
    };

    const updateWebview = () => {
      if (disposed) { return; }
      webviewPanel.webview.postMessage({
        type: 'setBaseUri',
        baseUri,
      });
      const msg: { type: string; content: string; compareContent?: string } = {
        type: 'setContent',
        content: document.getText(),
      };
      if (this.pendingCompareContent !== null) {
        msg.compareContent = this.pendingCompareContent;
        this.pendingCompareContent = null;
      }
      webviewPanel.webview.postMessage(msg);
    };

    // 自身の編集・保存直後（2秒以内）の変更通知を抑制するタイムスタンプ
    let lastApplyTime = 0;

    const docChangeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) { return; }
      if (isApplyingWebviewEdit) { return; }
      // Undo/Redo は即反映、それ以外（外部変更の同期）は VS Code 通知
      if (e.reason === vscode.TextDocumentChangeReason.Undo || e.reason === vscode.TextDocumentChangeReason.Redo) {
        updateWebview();
      } else if (Date.now() - lastApplyTime >= 2000) {
        showExternalChangeNotification(document.getText());
      }
    });

    // 保存前に lastApplyTime を更新（Ctrl+S 等の VS Code ネイティブ保存を含む）
    // onWillSave はファイル書き込み前に発火するため、fileWatcher より先に抑制できる
    const saveSubscription = vscode.workspace.onWillSaveTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        lastApplyTime = Date.now();
      }
    });

    // 外部変更検知（Claude Code、git 操作、他のエディタなど）
    let notificationVisible = false;
    let autoReload = this.autoReloadEnabled;
    this.autoReloadSetter = (enabled: boolean) => { autoReload = enabled; };
    const showExternalChangeNotification = (content: string) => {
      if (disposed) { return; }
      // 自動再読み込みモード: 通知なしで即座にコンテンツを更新
      if (autoReload) {
        webviewPanel.webview.postMessage({ type: 'setBaseUri', baseUri });
        webviewPanel.webview.postMessage({ type: 'setContent', content });
        return;
      }
      if (notificationVisible) { return; }
      notificationVisible = true;
      const fileName = path.basename(document.uri.fsPath);
      vscode.window.showInformationMessage(
        `${fileName} が外部で変更されました`,
        '再読込'
      ).then((selection) => {
        notificationVisible = false;
        if (selection === '再読込' && !disposed) {
          webviewPanel.webview.postMessage({ type: 'setBaseUri', baseUri });
          webviewPanel.webview.postMessage({ type: 'setContent', content });
        }
      });
    };

    const fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.dirname(document.uri.fsPath)), path.basename(document.uri.fsPath))
    );
    const checkDiskContent = async () => {
      if (disposed) { return; }
      // 自身の保存直後（2秒以内）は無視
      if (Date.now() - lastApplyTime < 2000) { return; }
      try {
        const bytes = await vscode.workspace.fs.readFile(document.uri);
        const diskContent = new TextDecoder().decode(bytes);
        if (diskContent === document.getText()) { return; }
        showExternalChangeNotification(diskContent);
      } catch (err) {
        MarkdownLogger.error(`checkDiskContent: failed to read ${document.uri.fsPath}`, err);
      }
    };
    fileWatcher.onDidChange(checkDiskContent);
    // アトミック書き込み（一時ファイル→リネーム）対応
    fileWatcher.onDidCreate(checkDiskContent);

    // フォールバック: FileSystemWatcher がイベントを取りこぼす環境（WSL2 等）向け
    // mtime ベースのポーリングで外部変更を検知
    let lastMtime = 0;
    const pollInterval = setInterval(async () => {
      if (disposed) { return; }
      if (Date.now() - lastApplyTime < 2000) { return; }
      try {
        const stat = await vscode.workspace.fs.stat(document.uri);
        if (lastMtime === 0) {
          lastMtime = stat.mtime;
          return;
        }
        if (stat.mtime === lastMtime) { return; }
        lastMtime = stat.mtime;
        await checkDiskContent();
      } catch (err) {
        MarkdownLogger.error(`pollInterval: failed to stat ${document.uri.fsPath}`, err);
      }
    }, 3000);

    const configChangeSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('anytimeMarkdown')) {
        sendSettings();
      }
    });

    const themeChangeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
      sendTheme();
    });

    // --- Message handler context shared by all handlers ---
    interface MessageHandlerContext {
      webviewPanel: vscode.WebviewPanel;
      document: vscode.TextDocument;
      baseUri: string;
      isDiffView: boolean;
      updateWebview: () => void;
      sendSettings: () => void;
      sendTheme: () => void;
      isLargeFile: () => boolean;
      getDisposed: () => boolean;
    }

    const ctx: MessageHandlerContext = {
      webviewPanel,
      document,
      baseUri,
      isDiffView,
      updateWebview,
      sendSettings,
      sendTheme,
      isLargeFile,
      getDisposed: () => disposed,
    };

    const handleReady = (message: Record<string, unknown>) => {
      initialLoadTime = Date.now();
      initialNormalizationSkipped = false;
      ctx.updateWebview();
      ctx.sendSettings();
      ctx.sendTheme();
      // ロック中ファイルを開いた/再読込した直後に現在のロック状態を反映する
      // （sendTheme は claudeLocked を載せないため、ここで明示同期する）。
      ctx.webviewPanel.webview.postMessage({
        type: 'setTheme',
        claudeLocked: this.claudeLock.isLocked(ctx.document.uri.fsPath),
      });
      if (ctx.isDiffView) {
        for (const [, panel] of this.panels) {
          panel.webview.postMessage({ type: 'setLanding', landing: true });
        }
      }
      const key = ctx.document.uri.toString();
      this.readyPanels.add(key);
      const resolvers = this.readyResolvers.get(key);
      if (resolvers) {
        this.readyResolvers.delete(key);
        resolvers.forEach(r => r());
      }
    };

    const handleScrollChanged = (message: Record<string, unknown>) => {
      const ratio = (message as { type: string; ratio: number }).ratio;
      for (const [, panel] of this.panels) {
        if (panel !== ctx.webviewPanel) {
          panel.webview.postMessage({ type: 'syncScroll', ratio });
        }
      }
    };

    const handleCompareModeChanged = (message: Record<string, unknown>) => {
      this.compareModeActive = !!message.active;
      vscode.commands.executeCommand('setContext', 'anytimeMarkdown.compareModeActive', this.compareModeActive);
    };

    const handleHeadingsChanged = (message: Record<string, unknown>) => {
      if (message.headings) { this.onHeadingsChanged?.(message.headings as unknown[]); }
    };

    const handleCommentsChanged = (message: Record<string, unknown>) => {
      if (message.comments) { this.onCommentsChanged?.(message.comments as unknown[]); }
    };

    const handleStatusChanged = (message: Record<string, unknown>) => {
      if (message.status) { this.onStatusChanged?.(message.status as { line: number; col: number; charCount: number; lineCount: number; lineEnding: string; encoding: string }); }
    };

    const handleSaveCompareFile = async (message: Record<string, unknown>) => {
      if (this.compareFileUri && typeof message.content === 'string') {
        try {
          await vscode.workspace.fs.writeFile(this.compareFileUri, new TextEncoder().encode(message.content));
        } catch (err) {
          vscode.window.showErrorMessage(`Error saving compare file: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };

    const handleContentChanged = (message: Record<string, unknown>) => {
      let newContent = message.content;
      if (typeof newContent !== 'string') { return; }
      if (newContent && !newContent.endsWith("\n")) { newContent += "\n"; }
      if (newContent === ctx.document.getText()) { return; }
      if (!initialNormalizationSkipped && Date.now() - initialLoadTime < 3000) {
        initialNormalizationSkipped = true;
        const fileName = path.basename(ctx.document.uri.fsPath);
        vscode.window.showInformationMessage(
          `${fileName}: 保存時にフォーマット整形が行われます`
        );
        return;
      }

      if (debounceTimer) { clearTimeout(debounceTimer); }
      const delay = ctx.isLargeFile() ? 800 : 300;
      debounceTimer = setTimeout(async () => {
        if (ctx.getDisposed()) { return; }
        // getText() はバッファ全体をコピーするため、同一同期コンテキストで1回だけ取得し再利用する
        const currentText = ctx.document.getText();
        if (newContent === currentText) { return; }
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          ctx.document.positionAt(0),
          ctx.document.positionAt(currentText.length)
        );
        edit.replace(ctx.document.uri, fullRange, newContent);
        lastApplyTime = Date.now();
        isApplyingWebviewEdit = true;
        try {
          const success = await vscode.workspace.applyEdit(edit);
          if (!success) {
            vscode.window.showWarningMessage('Failed to apply edit to the document.');
          } else if (!this.claudeLock.isLocked(ctx.document.uri.fsPath)) {
            await ctx.document.save();
          }
        } catch (err) {
          vscode.window.showErrorMessage(`Error saving changes: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          isApplyingWebviewEdit = false;
        }
      }, delay);
    };

    const handleWriteClipboard = async (message: Record<string, unknown>) => {
      const text = typeof message.text === 'string' ? message.text : '';
      await vscode.env.clipboard.writeText(text);
    };

    const handleReadClipboard = async () => {
      const text = await vscode.env.clipboard.readText();
      ctx.webviewPanel.webview.postMessage({ type: 'pasteMarkdown', text });
    };

    const handleReadClipboardForCodeBlock = async () => {
      const cbText = await vscode.env.clipboard.readText();
      ctx.webviewPanel.webview.postMessage({ type: 'pasteCodeBlock', text: cbText });
    };

    const handleSaveClipboardImage = (message: Record<string, unknown>) => {
      const imgData = typeof message.dataUrl === 'string' ? message.dataUrl : '';
      const imgFileName = typeof message.fileName === 'string' ? message.fileName : '';
      // 保存結果(imageSaved)を発信元ノードに紐付けるための任意 ID（GIF ノード等が使用）
      const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
      if (!imgData || !imgFileName) return;
      if (imgFileName.includes('/') || imgFileName.includes('\\') || imgFileName.startsWith('.')) {
        vscode.window.showErrorMessage('Invalid filename');
        return;
      }
      const docDir = path.dirname(ctx.document.uri.fsPath);
      const imagesDir = path.join(docDir, 'images');
      try {
        if (!fs.existsSync(imagesDir)) {
          fs.mkdirSync(imagesDir, { recursive: true });
        }
        const match = /^data:image\/\w+;base64,(.+)$/.exec(imgData);
        if (!match) return;
        const buffer = Buffer.from(match[1], 'base64');
        const filePath = path.join(imagesDir, imgFileName);
        if (!filePath.startsWith(imagesDir + path.sep) && filePath !== imagesDir) {
          vscode.window.showErrorMessage('Path traversal detected');
          return;
        }
        fs.writeFileSync(filePath, buffer);
        const relativePath = `images/${imgFileName}`;
        const webviewUri = ctx.webviewPanel.webview.asWebviewUri(vscode.Uri.file(filePath)).toString();
        ctx.webviewPanel.webview.postMessage({ type: 'imageSaved', path: relativePath, webviewUri, requestId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Image save failed: ${msg}`);
      }
    };

    const handleDownloadImage = async (message: Record<string, unknown>) => {
      const url = typeof message.url === 'string' ? message.url : '';
      if (!url) return;

      const docDir = path.dirname(ctx.document.uri.fsPath);
      const imagesDir = path.join(docDir, 'images');

      // data:image URL の場合: base64 をデコードしてローカル保存
      const dataMatch = /^data:image\/(\w+);base64,(.+)$/.exec(url);
      if (dataMatch) {
        try {
          if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
          }
          const ext = dataMatch[1] === 'jpeg' ? 'jpg' : dataMatch[1];
          const buffer = Buffer.from(dataMatch[2], 'base64');
          if (buffer.byteLength > 10 * 1024 * 1024) return;
          const now = new Date();
          const ts = [
            now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'), '-',
            String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0'),
          ].join('');
          const fileName = `dl-${ts}.${ext}`;
          const filePath = path.join(imagesDir, fileName);
          fs.writeFileSync(filePath, buffer);
          ctx.webviewPanel.webview.postMessage({
            type: 'imageDownloaded', originalUrl: url, localPath: `images/${fileName}`,
          });
        } catch (err) {
          MarkdownLogger.error(`handleDownloadImage: failed to save data URL image for ${ctx.document.uri.fsPath}`, err);
        }
        return;
      }

      // スキーム検証: https / http のみ許可
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;

      try {
        fs.mkdirSync(imagesDir, { recursive: true });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return;

        const contentType = res.headers.get('content-type') ?? '';
        const extMap: Record<string, string> = {
          'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
          'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp',
        };
        const ext = extMap[contentType.split(';')[0].trim()];
        // 許可されていない Content-Type の場合はスキップ
        if (!ext) return;
        const now = new Date();
        const ts = [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, '0'),
          String(now.getDate()).padStart(2, '0'),
          '-',
          String(now.getHours()).padStart(2, '0'),
          String(now.getMinutes()).padStart(2, '0'),
          String(now.getSeconds()).padStart(2, '0'),
        ].join('');
        const fileName = `dl-${ts}.${ext}`;
        const filePath = path.join(imagesDir, fileName);

        // パス走査防止: 解決後のパスが imagesDir 内であることを検証
        if (!path.resolve(filePath).startsWith(path.resolve(imagesDir))) return;

        // ファストパス: Content-Length で 10MB 超を全読み込み前に弾く（ヒープ圧迫の軽減）
        const declaredLen = Number(res.headers.get('content-length'));
        if (Number.isFinite(declaredLen) && declaredLen > 10 * 1024 * 1024) return;
        const arrayBuf = await res.arrayBuffer();
        // サイズ上限: 10MB（Content-Length が無い/偽の場合の保険）
        if (arrayBuf.byteLength > 10 * 1024 * 1024) return;
        fs.writeFileSync(filePath, Buffer.from(arrayBuf));

        const relativePath = `images/${fileName}`;
        ctx.webviewPanel.webview.postMessage({
          type: 'imageDownloaded',
          originalUrl: url,
          localPath: relativePath,
        });
      } catch (err) {
        MarkdownLogger.error(`handleDownloadImage: failed to download ${url}`, err);
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Image download failed: ${msg}`);
      }
    };

    const handleOverwriteImage = (message: Record<string, unknown>) => {
      const imgPath = typeof message.path === 'string' ? message.path : '';
      const imgDataUrl = typeof message.dataUrl === 'string' ? message.dataUrl : '';
      if (!imgPath || !imgDataUrl) return;
      try {
        const match = /^data:image\/\w+;base64,(.+)$/.exec(imgDataUrl);
        if (!match) return;
        const buffer = Buffer.from(match[1], 'base64');
        const cleanPath = imgPath.split('?')[0];
        const docDir = path.dirname(ctx.document.uri.fsPath);
        const absPath = path.resolve(docDir, cleanPath);
        if (!absPath.startsWith(docDir + path.sep) && absPath !== docDir) {
          vscode.window.showErrorMessage('Path traversal detected');
          return;
        }
        fs.writeFileSync(absPath, buffer);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Image overwrite failed: ${msg}`);
      }
    };

    const tryOpenCandidate = async (candidate: string, lineMatch: RegExpMatchArray | null): Promise<boolean> => {
      const uri = vscode.Uri.file(candidate);
      const line = lineMatch ? Math.max(0, Number.parseInt(lineMatch[1], 10) - 1) : null;
      const plan = planLinkOpen(candidate, line);
      try {
        if (plan.kind === 'customEditor') {
          // md は Anytime Markdown カスタムエディタ（WYSIWYG）で開く。
          await vscode.commands.executeCommand('vscode.openWith', uri, plan.viewType);
        } else if (plan.kind === 'textEditorAtLine') {
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc, { selection: new vscode.Range(plan.line, 0, plan.line, 0) });
        } else {
          await vscode.commands.executeCommand('vscode.open', uri);
        }
        return true;
      } catch {
        return false;
      }
    };

    const handleOpenLink = async (message: Record<string, unknown>) => {
      const rawHref = (message as { type: string; href?: string }).href;
      if (typeof rawHref !== 'string') return;
      const href = decodeURIComponent(rawHref);
      const lineMatch = /#L(\d+)$/.exec(href);
      const filePath = lineMatch ? href.replace(/#L\d+$/, '') : href;
      const docDir = path.dirname(ctx.document.uri.fsPath);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const candidates = buildLinkCandidates(filePath, docDir, workspaceRoot);
      if (!candidates) {
        vscode.window.showWarningMessage(`Invalid file path: ${filePath}`);
        return;
      }
      let opened = false;
      for (const candidate of candidates) {
        opened = await tryOpenCandidate(candidate, lineMatch);
        if (opened) break;
      }
      if (!opened) {
        vscode.window.showWarningMessage(`Cannot open file: ${href}`);
      }
    };

    const handleSave = async () => {
      try {
        await ctx.document.save();
      } catch (err) {
        vscode.window.showErrorMessage(`Error saving file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    const handleFetchOgp = async (message: Record<string, unknown>) => {
      const requestId = typeof message.requestId === 'string' ? message.requestId : '';
      const url = typeof message.url === 'string' ? message.url : '';
      if (!requestId || !url) return;
      try {
        const { parseOgpHtml, assertSafeUrl } = await import('./embedFetchHelpers.js');
        await assertSafeUrl(url);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'anytime-markdown-ogp/1.0' },
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`upstream-${res.status}`);
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('html')) throw new Error('unsupported-content');
        // ファストパス: Content-Length で 2MB 超を全読み込み前に弾く
        const declaredLen = Number(res.headers.get('content-length'));
        if (Number.isFinite(declaredLen) && declaredLen > 2 * 1024 * 1024) throw new Error('too-large');
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 2 * 1024 * 1024) throw new Error('too-large');
        const html = new TextDecoder().decode(Buffer.from(buf));
        const data = parseOgpHtml(html, url);
        ctx.webviewPanel.webview.postMessage({ type: 'ogpResult', requestId, data });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'fetch-failed';
        ctx.webviewPanel.webview.postMessage({ type: 'ogpResult', requestId, error });
      }
    };

    const handleFetchWebPage = async (message: Record<string, unknown>) => {
      const requestId = typeof message.requestId === 'string' ? message.requestId : '';
      const url = typeof message.url === 'string' ? message.url : '';
      if (!requestId || !url) return;
      try {
        const { safeFetch } = await import('./embedFetchHelpers.js');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try {
          const res = await safeFetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'anytime-markdown-webimport/1.0' },
          });
          if (!res.ok) throw new Error(`upstream-${res.status}`);
          const ct = res.headers.get('content-type') ?? '';
          if (!ct.includes('html')) throw new Error('unsupported-content');
          const declaredLen = Number(res.headers.get('content-length'));
          if (Number.isFinite(declaredLen) && declaredLen > 2 * 1024 * 1024) throw new Error('too-large');
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 2 * 1024 * 1024) throw new Error('too-large');
          const html = new TextDecoder().decode(Buffer.from(buf));
          ctx.webviewPanel.webview.postMessage({
            type: 'fetchWebPageResult',
            requestId,
            html,
            finalUrl: res.url,
            contentType: ct,
          });
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'fetch-failed';
        this.logLine?.(`[${new Date().toISOString()}] [WARN] [webImport] fetch failed: ${url} ${error}`);
        ctx.webviewPanel.webview.postMessage({ type: 'fetchWebPageResult', requestId, error });
      }
    };

    const handleCreateWebImportDocument = async (message: Record<string, unknown>) => {
      const markdown = typeof message.markdown === 'string' ? message.markdown : '';
      const title = typeof message.title === 'string' ? message.title : '';
      if (!markdown) {
        this.logLine?.(`[${new Date().toISOString()}] [WARN] [webImport] create document rejected: empty markdown`);
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument({
          language: 'markdown',
          content: markdown,
        });
        await vscode.window.showTextDocument(doc);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.logLine?.(`[${new Date().toISOString()}] [WARN] [webImport] create document failed${title ? `: ${title}` : ''} ${error}`);
        void vscode.window.showErrorMessage(`Web import: failed to create document: ${error}`);
      }
    };

    const tokenFromStats = (stats: fs.Stats): LinkedMdToken => ({
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    });

    const findExistingLinkedMd = async (candidates: string[]): Promise<string | null> => {
      for (const candidate of candidates) {
        try {
          const stats = await fs.promises.stat(candidate);
          if (stats.isFile()) return candidate;
        } catch (err) {
          const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
          if (code !== 'ENOENT' && code !== 'ENOTDIR') {
            throw err;
          }
        }
      }
      return null;
    };

    const isLinkedMdToken = (value: unknown): value is LinkedMdToken => {
      if (typeof value !== 'object' || value === null) return false;
      const record = value as Record<string, unknown>;
      return typeof record.mtimeMs === 'number' && typeof record.size === 'number';
    };

    const handleFetchLinkedMd = async (message: Record<string, unknown>) => {
      const requestId = typeof message.requestId === 'string' ? message.requestId : '';
      const href = typeof message.href === 'string' ? message.href : '';
      if (!requestId) return;

      const respondError = (error: string): void => {
        ctx.webviewPanel.webview.postMessage({
          type: 'linkedMdContent',
          requestId,
          content: '',
          resolvedPath: '',
          token: { mtimeMs: 0, size: 0 },
          error,
        });
      };

      if (!href) {
        respondError('missing-href');
        return;
      }

      try {
        const docDir = path.dirname(ctx.document.uri.fsPath);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const candidates = resolveLinkedMdCandidates(href, docDir, workspaceRoot);
        if (candidates.length === 0) {
          respondError('no-candidates');
          return;
        }

        const selected = await findExistingLinkedMd(candidates);
        if (!selected) {
          respondError('not-found');
          return;
        }

        const [content, stats] = await Promise.all([
          fs.promises.readFile(selected, 'utf8'),
          fs.promises.stat(selected),
        ]);
        ctx.webviewPanel.webview.postMessage({
          type: 'linkedMdContent',
          requestId,
          content,
          resolvedPath: selected,
          token: tokenFromStats(stats),
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        respondError(`fetch-failed: ${error}`);
      }
    };

    const replaceOpenTextDocument = async (
      targetPath: string,
      content: string,
    ): Promise<void> => {
      const target = path.resolve(targetPath);
      const opened = vscode.workspace.textDocuments.find(doc => path.resolve(doc.uri.fsPath) === target);
      if (!opened) {
        await fs.promises.writeFile(targetPath, content, 'utf8');
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const currentText = opened.getText();
      edit.replace(
        opened.uri,
        new vscode.Range(opened.positionAt(0), opened.positionAt(currentText.length)),
        content,
      );
      const success = await vscode.workspace.applyEdit(edit);
      if (!success) {
        throw new Error('apply-edit-failed');
      }
      await opened.save();
    };

    const handleSaveLinkedMd = async (message: Record<string, unknown>) => {
      const requestId = typeof message.requestId === 'string' ? message.requestId : '';
      const href = typeof message.href === 'string' ? message.href : '';
      const content = typeof message.content === 'string' ? message.content : null;
      const baseToken = isLinkedMdToken(message.baseToken) ? message.baseToken : null;
      if (!requestId) return;

      const respond = (payload: {
        token: LinkedMdToken | null;
        conflict: boolean;
        error?: string;
      }): void => {
        ctx.webviewPanel.webview.postMessage({
          type: 'linkedMdSaved',
          requestId,
          ...payload,
        });
      };

      if (!href || content === null || !baseToken) {
        respond({ token: null, conflict: false, error: 'invalid-save-request' });
        return;
      }

      try {
        const docDir = path.dirname(ctx.document.uri.fsPath);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const candidates = resolveLinkedMdCandidates(href, docDir, workspaceRoot);
        if (candidates.length === 0) {
          respond({ token: null, conflict: false, error: 'no-candidates' });
          return;
        }

        const existing = await findExistingLinkedMd(candidates);
        const target = existing ?? candidates[0];

        if (existing) {
          const currentToken = tokenFromStats(await fs.promises.stat(existing));
          if (!tokensMatch(currentToken, baseToken)) {
            respond({ token: currentToken, conflict: true });
            return;
          }
          const target = path.resolve(existing);
          const opened = vscode.workspace.textDocuments.find(
            doc => doc.uri.scheme === 'file' && path.resolve(doc.uri.fsPath) === target
          );
          if (opened?.isDirty) {
            respond({ token: currentToken, conflict: true });
            return;
          }
        }

        await replaceOpenTextDocument(target, content);
        const nextToken = tokenFromStats(await fs.promises.stat(target));
        respond({ token: nextToken, conflict: false });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        respond({ token: null, conflict: false, error: `save-failed: ${error}` });
      }
    };

    const handleFetchOembed = async (message: Record<string, unknown>) => {
      const requestId = typeof message.requestId === 'string' ? message.requestId : '';
      const url = typeof message.url === 'string' ? message.url : '';
      if (!requestId || !url) return;
      try {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error('invalid-url');
        }
        const allowed = new Set(['twitter.com', 'x.com', 'www.twitter.com', 'www.x.com']);
        if (!allowed.has(parsed.hostname)) throw new Error('host-not-allowed');
        const endpoint = new URL('https://publish.twitter.com/oembed');
        endpoint.searchParams.set('url', url);
        endpoint.searchParams.set('omit_script', 'true');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        const res = await fetch(endpoint.toString(), {
          signal: controller.signal,
          headers: { 'User-Agent': 'anytime-markdown-oembed/1.0' },
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`upstream-${res.status}`);
        const body = (await res.json()) as { html?: string; author_name?: string };
        if (typeof body.html !== 'string') throw new Error('no-html');
        const data = {
          url,
          provider: 'twitter' as const,
          // webview 側で sanitizeTweetHtml にかけて描画するため、ここでは生 HTML を返す
          html: body.html,
          authorName: body.author_name ?? null,
        };
        ctx.webviewPanel.webview.postMessage({ type: 'oembedResult', requestId, data });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'fetch-failed';
        ctx.webviewPanel.webview.postMessage({ type: 'oembedResult', requestId, error });
      }
    };

    const handleFetchRss = async (message: Record<string, unknown>) => {
      const requestId = typeof message.requestId === 'string' ? message.requestId : '';
      const feedUrl = typeof message.feedUrl === 'string' ? message.feedUrl : '';
      if (!requestId || !feedUrl) return;
      try {
        const { fetchRssLatest } = await import('./rssFetch.js');
        const data = await fetchRssLatest(feedUrl);
        ctx.webviewPanel.webview.postMessage({ type: 'rssResult', requestId, data });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'fetch-failed';
        ctx.webviewPanel.webview.postMessage({ type: 'rssResult', requestId, error });
      }
    };

    // === ノート網パネル（エディタ右パネル）の host 配線 ======================
    const noteGraphRoot = (): string | null => {
      const configPath =
        vscode.workspace.getConfiguration('anytimeMarkdown').get<string>('docsRoot', '') ?? '';
      return resolveRepositoryRoot(configPath, path.dirname(document.uri.fsPath));
    };
    /** `[ISO8601] [LEVEL]` を自動付与して logLine へ委譲する（ログ書式規約: 全行に時刻+レベル）。 */
    const ngLog = (level: 'INFO' | 'WARN' | 'ERROR', line: string): void => {
      this.logLine?.(`[${new Date().toISOString()}] [${level}] ${line}`);
    };
    /** scanRepository は自前で `[ISO8601] [LEVEL]` を付与済みのため、素通しのシンクを渡す。 */
    const rawNgLog = (line: string): void => this.logLine?.(line);
    const sendNoteGraphDocs = async (): Promise<void> => {
      const root = noteGraphRoot();
      if (!root) return;
      try {
        const docs = await scanRepository(root, rawNgLog);
        // 中心表示用に現在のドキュメントの root 相対パスを渡す
        const currentPath = path.relative(root, document.uri.fsPath).split(path.sep).join('/');
        webviewPanel.webview.postMessage({ type: 'setNoteGraphDocs', docs, currentPath });
      } catch (err) {
        ngLog('ERROR', `[noteGraph] scan failed: ${String(err)}`);
      }
    };
    const openNoteGraphDoc = async (relPath: string): Promise<void> => {
      const root = noteGraphRoot();
      if (!root) return;
      let uri: vscode.Uri;
      try {
        uri = vscode.Uri.file(resolveDocPath(root, relPath));
      } catch (err) {
        ngLog('WARN', `[noteGraph] openDoc rejected: ${relPath} ${String(err)}`);
        return;
      }
      try {
        await vscode.commands.executeCommand('vscode.openWith', uri, MarkdownEditorProvider.viewType);
      } catch (err) {
        ngLog('WARN', `[noteGraph] openWith failed (falling back): ${relPath} ${String(err)}`);
        await vscode.window.showTextDocument(uri).then(undefined, (e) =>
          ngLog('ERROR', `[noteGraph] openDoc failed: ${relPath} ${String(e)}`),
        );
      }
    };
    const connectNoteGraph = async (from: string, to: string, relationType: RelationType): Promise<void> => {
      if (from === to) return;
      // `to` は frontmatter に書き込むため、リポジトリ外/不正パス（YAML 破壊・traversal）を拒否
      if (!isSafeRelPath(to)) {
        ngLog('WARN', `[noteGraph] connect rejected (invalid to): ${to}`);
        return;
      }
      const root = noteGraphRoot();
      if (!root) return;
      let fromPath: string;
      try {
        fromPath = resolveDocPath(root, from);
      } catch (err) {
        ngLog('WARN', `[noteGraph] connect rejected: ${from} ${String(err)}`);
        return;
      }
      try {
        const content = await fs.promises.readFile(fromPath, 'utf8');
        const next = addRelatedEntry(content, to, (message) => ngLog('WARN', `[noteGraph] ${message}`), relationType);
        if (next !== content) await fs.promises.writeFile(fromPath, next, 'utf8');
        await sendNoteGraphDocs();
      } catch (err) {
        ngLog('ERROR', `[noteGraph] connect failed: ${from} -> ${to} ${String(err)}`);
        void vscode.window.showErrorMessage(`Note Graph: failed to link ${from}`);
      }
    };

    webviewPanel.webview.onDidReceiveMessage(async (message: { type: string; [key: string]: unknown }) => {
      switch (message.type) {
        case 'ready': handleReady(message); break;
        case 'editorError': this.handleEditorError(message); break;
        case 'scrollChanged': handleScrollChanged(message); break;
        case 'compareModeChanged': handleCompareModeChanged(message); break;
        case 'headingsChanged': handleHeadingsChanged(message); break;
        case 'commentsChanged': handleCommentsChanged(message); break;
        case 'statusChanged': handleStatusChanged(message); break;
        case 'saveCompareFile': await handleSaveCompareFile(message); break;
        case 'contentChanged': handleContentChanged(message); break;
        case 'writeClipboard': await handleWriteClipboard(message); break;
        case 'readClipboard': await handleReadClipboard(); break;
        case 'readClipboardForCodeBlock': await handleReadClipboardForCodeBlock(); break;
        case 'saveClipboardImage': handleSaveClipboardImage(message); break;
        case 'overwriteImage': handleOverwriteImage(message); break;
        case 'downloadImage': await handleDownloadImage(message); break;
        case 'openLink': await handleOpenLink(message); break;
        case 'setAutoReload':
          autoReload = !!message.enabled;
          this.autoReloadEnabled = autoReload;
          vscode.commands.executeCommand('setContext', 'anytimeMarkdown.autoReload', autoReload);
          break;
        case 'modeChanged':
          if (typeof message.mode === 'string') {
            this.editorMode = message.mode;
            vscode.commands.executeCommand('setContext', 'anytimeMarkdown.editorMode', message.mode);
          }
          break;
        case 'save': await handleSave(); break;
        case 'fetchOgp': await handleFetchOgp(message); break;
        case 'fetchWebPage': await handleFetchWebPage(message); break;
        case 'createWebImportDocument': await handleCreateWebImportDocument(message); break;
        case 'fetchLinkedMd': await handleFetchLinkedMd(message); break;
        case 'saveLinkedMd': await handleSaveLinkedMd(message); break;
        case 'fetchOembed': await handleFetchOembed(message); break;
        case 'fetchRss': await handleFetchRss(message); break;
        case 'requestNoteGraphDocs': await sendNoteGraphDocs(); break;
        case 'noteGraphOpenDoc':
          if (typeof message.path === 'string') await openNoteGraphDoc(message.path);
          break;
        case 'noteGraphConnect':
          if (typeof message.from === 'string' && typeof message.to === 'string') {
            // relationType は webview 由来の未検証値。未知/欠落は references へフォールバック。
            await connectNoteGraph(
              message.from,
              message.to,
              coerceRelationType(message.relationType, (msg) => ngLog('WARN', `[noteGraph] ${msg}`)),
            );
          }
          break;
      }
    });

    webviewPanel.onDidDispose(() => {
      disposed = true;
      const key = document.uri.toString();
      this.panels.delete(key);
      this.readyPanels.delete(key);
      const resolvers = this.readyResolvers.get(key);
      if (resolvers) {
        this.readyResolvers.delete(key);
        resolvers.forEach(r => r());
      }
      if (this.activePanel === webviewPanel) {
        this.activePanel = null;
        this.compareFileUri = null;
        this.activeDocumentUri = null;
        this.compareModeActive = false;
        this.autoReloadSetter = null;
        vscode.commands.executeCommand('setContext', 'anytimeMarkdown.compareModeActive', false);
      }
      docChangeSubscription.dispose();
      saveSubscription.dispose();
      configChangeSubscription.dispose();
      themeChangeSubscription.dispose();
      fileWatcher.dispose();
      clearInterval(pollInterval);
      if (debounceTimer) { clearTimeout(debounceTimer); }
    });
  }

  private async getRelativePath(uri: vscode.Uri): Promise<string | null> {
    const gitExtension = vscode.extensions.getExtension<{ getAPI(version: 1): { getRepository(uri: vscode.Uri): { rootUri: vscode.Uri } | null } }>('vscode.git');
    if (!gitExtension) { return null; }
    if (!gitExtension.isActive) { await gitExtension.activate(); }
    const repo = gitExtension.exports.getAPI(1).getRepository(uri);
    if (!repo) { return null; }
    return path.relative(repo.rootUri.fsPath, uri.fsPath).replaceAll("\\", '/');
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'images', 'camel_markdown.png')
    );
    const nonce = randomBytes(16).toString('hex');

    return `<!DOCTYPE html>
<html lang="${resolveLocale(undefined, vscode.env.language)}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; worker-src blob:;">
    <title>Markdown Editor</title>
    <style>
      html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; font-size: 16px; }
      #root > .MuiBox-root { padding: 0 !important; }
      #root > .MuiBox-root > .MuiBox-root:empty { display: none !important; margin: 0 !important; }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">window.__LOGO_URI__ = "${logoUri}";</script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
