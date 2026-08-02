/**
 * 同一オリジンの /api/* を JSON として読む。
 *
 * HTTP エラーを例外へ倒すのが要点。`res.json()` を status を見ずに呼ぶと、
 * エラー時に返る HTML（Next.js の not-found / エラーページ）を JSON パースしようとして
 * `Unexpected token '<'` になるか、縮退用の空ペイロードを成功として描画してしまう。
 * どちらも「障害」を「データ 0 件」に化けさせる。
 */
export async function fetchApiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path}: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
