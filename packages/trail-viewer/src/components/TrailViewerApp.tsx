/**
 * TrailViewerApp — thin React wrapper.
 *
 * Delegates all logic to mountTrailViewerApp via VanillaIsland.
 * TrailViewerAppProps is kept identical so all callers remain unchanged.
 */
import type { DocLink } from '@anytime-markdown/trail-core/c4';
import type { TrailLocale } from '../i18n/types';

import { VanillaIsland } from '../shared/vanillaIsland';
import { mountTrailViewerApp } from '../views/trailViewerApp';
import type { TrailViewerAppViewProps } from '../views/trailViewerApp';

export interface TrailViewerAppProps {
  /** Data source URL. Use '' for same-origin (Next.js relative). */
  readonly serverUrl: string;
  readonly isDark?: boolean;
  readonly locale?: TrailLocale;
  readonly containerHeight?: string;
  /**
   * C4 編集コマンドを WebSocket 経由でサーバに送信する。
   * 拡張機能では true（C4Panel で受け取って永続化）、web アプリでは false（read-only）。
   * デフォルト false。
   */
  readonly editable?: boolean;
  /**
   * Doc link クリック時のコールバック。
   * 拡張機能では VS Code に通知、web アプリでは新規タブで開く等の挙動を上書きできる。
   */
  readonly onDocLinkClick?: (doc: DocLink) => void;
  /** 初期表示タブ番号（0=Analytics, 1=Messages, 2=Prompts, 4=C4, 5=Trace）*/
  readonly initialTab?: number;
  /** C4 ビューアの初期表示レベル（1=L1 Context, 2=L2 Container, 3=L3 Component, 4=L4 Code）*/
  readonly initialC4Level?: number;
  /**
   * WebSocket 接続を無効化する。
   * web アプリなど WebSocket サーバーが存在しない場合に true を渡す。
   * デフォルト false（拡張機能モード）。
   */
  readonly disableWebSocket?: boolean;
}

export function TrailViewerApp(props: Readonly<TrailViewerAppProps>) {
  const viewProps: TrailViewerAppViewProps = { ...props };
  return <VanillaIsland mount={mountTrailViewerApp} props={viewProps} />;
}

const EMPTY_FILTER = {};
export { EMPTY_FILTER };
