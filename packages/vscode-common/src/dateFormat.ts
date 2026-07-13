/**
 * ローカルタイムゾーンを解決する。
 * - ブラウザ（webview）: Intl.DateTimeFormat が実際の TZ を返すのでそのまま使う
 * - Node.js（VS Code 拡張 on WSL）: system TZ が UTC のため
 *   process.env.TZ → Intl 解決値（UTC でない場合）→ Asia/Tokyo の順で優先する
 *
 * 同等の実装が trail-core/src/formatDate.ts にもあるが、vscode-common は
 * trail-core に依存しない（拡張のバンドルサイズを増やさない）ため独立に持つ。
 */
export function resolveLocalTimeZone(): string {
  if ('window' in globalThis) {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  if (typeof process !== 'undefined' && process.env?.TZ) return process.env.TZ;
  const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && tz !== 'UTC') return tz;
  return 'Asia/Tokyo';
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  // ロケール非依存に yyyy/M/d HH:mm を組み立てるため、値は formatToParts から取り出す。
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

type PartPicker = (type: Intl.DateTimeFormatPartTypes) => string;

function pickParts(value: string | Date, timeZone: string): PartPicker | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = partsFormatter(timeZone).formatToParts(date);
  return (type) => parts.find((part) => part.type === type)?.value ?? '';
}

/**
 * 日時をローカル TZ の `yyyy/M/d HH:mm` に整形する。
 * パースできない場合は null を返す（表示側でフォールバック文言を選ぶ）。
 */
export function formatLocalDateTime(
  value: string | Date,
  timeZone: string = resolveLocalTimeZone(),
): string | null {
  const pick = pickParts(value, timeZone);
  if (pick === null) return null;
  return `${pick('year')}/${pick('month')}/${pick('day')} ${pick('hour')}:${pick('minute')}`;
}

/**
 * 日時をローカル TZ の `YYYY-MM-DD HH:mm`（ゼロ埋め）に整形する。
 * パースできない場合は null を返す。
 */
export function formatLocalDateTimeHyphen(
  value: string | Date,
  timeZone: string = resolveLocalTimeZone(),
): string | null {
  const pick = pickParts(value, timeZone);
  if (pick === null) return null;
  const pad = (part: Intl.DateTimeFormatPartTypes): string => pick(part).padStart(2, '0');
  return `${pick('year')}-${pad('month')}-${pad('day')} ${pick('hour')}:${pick('minute')}`;
}

/**
 * 日時をローカル TZ の `HH:mm` に整形する。
 * パースできない場合は null を返す。
 */
export function formatLocalTime(
  value: string | Date,
  timeZone: string = resolveLocalTimeZone(),
): string | null {
  const pick = pickParts(value, timeZone);
  if (pick === null) return null;
  return `${pick('hour')}:${pick('minute')}`;
}
