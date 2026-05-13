import * as vscode from 'vscode';
import type { TrailDataServer } from '@anytime-markdown/trail-server';

/**
 * Trail ビューアの管理を担当するシングルトン。
 * TrailDataServer 経由でスタンドアロンビューアにデータを配信する。
 */
export class TrailPanel {
  private static instance: TrailPanel | undefined;
  private static dataServer: TrailDataServer | undefined;
  private static viewerOpened = false;

  private constructor() {}

  public static setDataServer(server: TrailDataServer): void {
    TrailPanel.dataServer = server;
  }

  /**
   * サーバーが稼働中ならブラウザでスタンドアロンビューアを開く。
   * WebSocket クライアントが接続中の場合はビューアが既に表示されているため開かない。
   * force=true の場合は viewerOpened ガードを無視する（ただし接続中チェックは常に有効）。
   */
  public static openViewer(force = false): void {
    if (!TrailPanel.dataServer?.isRunning) return;
    if ((TrailPanel.dataServer.clientCount ?? 0) > 0) return;
    if (!force && TrailPanel.viewerOpened) return;
    TrailPanel.viewerOpened = true;
    const port = vscode.workspace.getConfiguration('anytimeTrail.viewer').get<number>('port', 19841);
    vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`));
  }

  public static getInstance(): TrailPanel {
    TrailPanel.instance ??= new TrailPanel();
    return TrailPanel.instance;
  }
}
