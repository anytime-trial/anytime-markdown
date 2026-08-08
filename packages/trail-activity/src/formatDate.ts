/**
 * ローカルタイムゾーンを解決する。
 * - ブラウザ: window が存在するため Intl.DateTimeFormat が正しくブラウザの TZ を返す
 * - Node.js (VS Code 拡張 on WSL): system TZ が UTC になるため
 *   process.env.TZ → Intl 解決値（UTC でない場合）→ Asia/Tokyo の順で優先
 */
export function resolveLocalTimeZone(): string {
  if (globalThis.window !== undefined) {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  if (typeof process !== 'undefined' && process.env?.TZ) return process.env.TZ;
  const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && tz !== 'UTC') return tz;
  return 'Asia/Tokyo';
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: '2-digit', day: '2-digit',
};
const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: '2-digit', minute: '2-digit', hour12: false,
};
const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * TZ はモジュールロード時ではなく呼び出しごとに解決する。
 * ロード時に固定すると、後から process.env.TZ を差し替えても反映されず、
 * TZ を明示するテストが黙って固着する（生成済み formatter は TZ ごとにキャッシュする）。
 */
function formatter(
  kind: string,
  options: Intl.DateTimeFormatOptions,
  locale?: string,
): Intl.DateTimeFormat {
  const timeZone = resolveLocalTimeZone();
  const key = `${locale ?? ''}|${kind}|${timeZone}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat(locale, { ...options, timeZone });
  formatterCache.set(key, created);
  return created;
}

const dateFmt = (): Intl.DateTimeFormat => formatter('date', DATE_OPTIONS);
const timeFmt = (): Intl.DateTimeFormat => formatter('time', TIME_OPTIONS);
const dateTimeFmt = (): Intl.DateTimeFormat => formatter('dateTime', DATE_TIME_OPTIONS);
const dateKeyFmt = (): Intl.DateTimeFormat => formatter('dateKey', DATE_OPTIONS, 'en-CA');

/** UTC ISO文字列をローカルタイムゾーンの日付文字列に変換する */
export function formatLocalDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dateFmt().format(d);
}

/** UTC ISO文字列をローカルタイムゾーンの時刻文字列に変換する */
export function formatLocalTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return timeFmt().format(d);
}

/** UTC ISO文字列をローカルタイムゾーンの日時文字列に変換する */
export function formatLocalDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dateTimeFmt().format(d);
}

/** UTC ISO文字列をローカルタイムゾーンのYYYY-MM-DD形式に変換する */
export function toLocalDateKey(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = dateKeyFmt().formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${day}`;
}
