import * as vscode from 'vscode';
import type { TrailDataServer } from '@anytime-markdown/trail-server';

/**
 * Trail ビューアの管理を担当するシングルトン。
 * TrailDataServer 経由でスタンドアロンビューアにデータを配信する。
 * 外部デーモンモード（Milestone C-2）では daemonUrl を優先して開く。
 */
export class TrailPanel {
  private static instance: TrailPanel | undefined;
  private static dataServer: TrailDataServer | undefined;
  private static daemonUrl: string | undefined;
  private static viewerOpened = false;

  private constructor() {}

  public static setDataServer(server: TrailDataServer): void {
    TrailPanel.dataServer = server;
  }

  /**
   * 外部デーモンの URL を設定する。
   * 設定すると openViewer はこの URL を優先して開く。
   * undefined を渡すとローカルサーバーモードに戻る。
   */
  public static setDaemonUrl(url: string | undefined): void {
    TrailPanel.daemonUrl = url;
  }

  /**
   * ビューアをブラウザで開く。
   *
   * 外部デーモンモード（daemonUrl が設定済み）:
   *   - force=false かつ viewerOpened 済みであればスキップ。
   *   - それ以外は daemonUrl をそのまま開く。
   *
   * ローカルサーバーモード（従来）:
   *   - サーバーが稼働中かつ WebSocket クライアント未接続の場合のみ開く。
   *   - force=true の場合は viewerOpened ガードを無視する（接続中チェックは常に有効）。
   */
  public static openViewer(force = false): void {
    // 外部デーモンモード優先
    if (TrailPanel.daemonUrl) {
      if (!force && TrailPanel.viewerOpened) return;
      TrailPanel.viewerOpened = true;
      void vscode.env.openExternal(vscode.Uri.parse(TrailPanel.daemonUrl));
      return;
    }
    // 従来のローカルサーバーモード
    if (!TrailPanel.dataServer?.isRunning) return;
    if ((TrailPanel.dataServer.clientCount ?? 0) > 0) return;
    if (!force && TrailPanel.viewerOpened) return;
    TrailPanel.viewerOpened = true;
    const port = vscode.workspace.getConfiguration('anytimeTrail.viewer').get<number>('port', 19841);
    void vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`));
  }

  public static getInstance(): TrailPanel {
    TrailPanel.instance ??= new TrailPanel();
    return TrailPanel.instance;
  }
}
