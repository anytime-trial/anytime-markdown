import * as vscode from 'vscode';
import type { TrailDataServer } from '../server/TrailDataServer';

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
   * force=true の場合は viewerOpened ガードを無視して必ず開く。
   */
  public static openViewer(force = false): void {
    if (!TrailPanel.dataServer?.isRunning) return;
    if (!force && TrailPanel.viewerOpened) return;
    TrailPanel.viewerOpened = true;
    const port = vscode.workspace.getConfiguration('anytimeTrail.trailServer').get<number>('port', 19841);
    vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`));
  }

  public static getInstance(): TrailPanel {
    TrailPanel.instance ??= new TrailPanel();
    return TrailPanel.instance;
  }
}
