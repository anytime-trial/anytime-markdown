import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TicketsPanel, injectTicketsStyles } from '@anytime-markdown/tickets-viewer';
import { setLocale } from './shims/next-intl';

import { createRpcTicketsGateway, isRecord, type RpcTransport } from './rpcGateway';
import { isInitMessage, type InitMessage } from './initMessage';
import { resolveThemeFromBodyClasses } from './theme';

declare const acquireVsCodeApi: () => { postMessage: (m: unknown) => void };

const vscode = acquireVsCodeApi();

function makeTransport(): RpcTransport {
  const listeners = new Set<(m: unknown) => void>();
  const onWindowMessage = (e: MessageEvent) => {
    // VS Code webview のメッセージは origin が空文字列または vscode-webview:// スキーム
    if (e.origin && !e.origin.startsWith('vscode-webview://')) return;
    const data = e.data as unknown;
    // rpcGateway.ts の isRecord を共有し、同じ検証ロジックの二重実装を避ける。
    if (!isRecord(data) || typeof data.type !== 'string') return;
    listeners.forEach((l) => l(data));
  };
  globalThis.addEventListener('message', onWindowMessage);
  return {
    postMessage: (m) => vscode.postMessage(m),
    onMessage: (l) => {
      listeners.add(l);
      // SHORTCUT: 最後の購読者が外れても window の 'message' リスナーは解除しない
      // （listeners が空になったら removeEventListener する参照カウントは実装していない）.
      // ceiling: この webview の React ルート（App）はパネル破棄までマウントされ続ける
      // 単一インスタンス前提で、makeTransport() 自体も App の生存期間中に1回しか
      // 呼ばれない（useMemo で固定）ため、実質的にリークしない。
      // upgrade: makeTransport を複数回呼ぶ構成（ホットリロード等）に変える場合、または
      // App 自体をアンマウント/再マウントするテストハーネスを導入する場合は、
      // listeners.size === 0 になった時点で removeEventListener するよう改修する。
      return () => listeners.delete(l);
    },
  };
}

/**
 * webview 側の VS Code テーマ反映。
 *
 * `tickets-viewer` の CSS（injectStyles.ts）は `[data-theme="dark"] .tk-root` を
 * ダーク配色の切替セレクタとして参照しており、これは web-app 側が
 * `document.documentElement.dataset.theme` に書き込む値と同じ契約である。
 * 一方 VS Code webview は `<body>` に `vscode-dark` 等のクラスを付与するだけで
 * `data-theme` 属性は付けないため、このブリッジが無いと拡張はライト配色に固定され、
 * ダークテーマで可読性が失われる（デザインシステムのダーク/ライト両対応要件に反する）。
 * VS Code はテーマ切替時に webview を再読み込みせず body のクラスだけ差し替えるため、
 * MutationObserver で追従する。
 */
function bindTheme(): () => void {
  const apply = () => {
    const classes = Array.from(document.body.classList);
    document.documentElement.dataset.theme = resolveThemeFromBodyClasses(classes);
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const App: React.FC = () => {
  const [init, setInit] = useState<InitMessage | null>(null);
  const transport = useMemo(() => makeTransport(), []);
  // gateway はインスタンス同一性が useTickets の再取得トリガになるため必ずメモ化する
  const gateway = useMemo(() => createRpcTicketsGateway(transport), [transport]);

  useEffect(() => {
    injectTicketsStyles();
    const offTheme = bindTheme();
    const off = transport.onMessage((m) => {
      if (!isInitMessage(m)) return;
      // setLocale は shim のモジュールスコープ変数を書き換えるだけで再レンダーを
      // 引き起こさない（next-intl 相当の Context 更新は行わない）。直後の setInit が
      // 状態更新として再レンダーを引き起こすため、useTranslations は次のレンダーで
      // 新しいロケールを読むことになり結果的に反映される。この呼び出し順序
      // （setLocale → setInit）を入れ替えると、setInit 側のレンダーが先に走った場合に
      // 旧ロケールで一度描画されてから切り替わる可能性があるため、順序は意図的である。
      setLocale(m.locale);
      setInit(m);
    });
    vscode.postMessage({ type: 'ready' });
    return () => {
      off();
      offTheme();
    };
  }, [transport]);

  if (!init) {
    return null;
  }

  // gateway は source が無いとき（`anytimeTickets.repo` 未設定など、リポジトリ自体を
  // 解決できない場合）のみ null にする。GitHub 未認証（source はあるが provider が
  // 無い）場合は Task 12 の TicketsPanelManager.postInit が source を非 null のまま
  // 送るため gateway は生成され、RPC 呼び出しは 401 の rpcResult エラーとして返る。
  // それは TicketsPanel 側の tickets.error（再読み込みボタン付きアラート）で表示される
  // 既存経路であり、未認証と未設定を空状態の二値だけで区別する必要は無い。
  return (
    <TicketsPanel
      gateway={init.source ? gateway : null}
      source={init.source}
      currentUser={init.currentUser}
      onRequestRepoSelect={() => vscode.postMessage({ type: 'selectRepo' })}
    />
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
