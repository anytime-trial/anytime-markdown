/**
 * 拡張ホスト（`TicketsPanelManager.postInit`）から webview へ届く `init` メッセージの型。
 * postMessage で届く値はプロセス境界を越えた外部入力であり信頼できないため、
 * `rpcGateway.ts` の `isRecord` 等と同じ型ガードパターンで形を検証してから読む
 * （型アサーションでは中身が不正でも実行時まで気付けない）。
 */
export interface InitMessage {
  type: 'init';
  source: { label: string } | null;
  currentUser?: string;
  locale: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSource(value: unknown): value is { label: string } {
  return isRecord(value) && typeof value.label === 'string';
}

export function isInitMessage(value: unknown): value is InitMessage {
  if (!isRecord(value) || value.type !== 'init') {
    return false;
  }
  if (value.source !== null && !isSource(value.source)) {
    return false;
  }
  if (value.currentUser !== undefined && typeof value.currentUser !== 'string') {
    return false;
  }
  return typeof value.locale === 'string';
}
