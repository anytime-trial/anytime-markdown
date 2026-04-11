const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: '2-digit', day: '2-digit',
});

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit', minute: '2-digit', hour12: false,
});

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

/** UTC ISO文字列をローカルタイムゾーンの日付文字列に変換する */
export function formatLocalDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dateFmt.format(d);
}

/** UTC ISO文字列をローカルタイムゾーンの時刻文字列に変換する */
export function formatLocalTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return timeFmt.format(d);
}

/** UTC ISO文字列をローカルタイムゾーンの日時文字列に変換する */
export function formatLocalDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dateTimeFmt.format(d);
}

/** UTC ISO文字列をローカルタイムゾーンのYYYY-MM-DD形式に変換する */
export function toLocalDateKey(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
