/** ISO 8601文字列をUTC ISO文字列に正規化する */
export function toUTC(isoString: string): string {
  if (!isoString) return isoString;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toISOString();
}
