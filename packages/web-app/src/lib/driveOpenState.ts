/**
 * Drive UI の「アプリで開く」「新規」から渡される `?state=` クエリを解析する。
 *
 * `state` は任意の第三者が組み立てられる URL クエリであり、信頼できない入力として扱う。
 * 形が合わないものはすべて null に落とし、呼び出し側は通常の新規エディタとして起動する。
 * ここで得た値を遷移先 URL に使ってはならない（オープンリダイレクトを避けるため）。
 */
export type DriveOpenIntent =
  | { action: 'open'; fileId: string; userId: string | null }
  | { action: 'create'; folderId: string | null; userId: string | null };

/** 非空文字列のみを通す。Drive は空文字の id を返さないが、state は信頼できない。 */
function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[${new Date().toISOString()}] [WARN] Invalid Drive state payload:`, err);
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** `ids` から最初の使用可能な fileId を取り出す。 */
function firstFileId(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const id of value) {
    const fileId = asNonEmptyString(id);
    if (fileId) return fileId;
  }
  return null;
}

export function parseDriveOpenState(raw: string | null): DriveOpenIntent | null {
  if (!raw) return null;

  const record = asRecord(parseJson(raw));
  if (!record) return null;

  const userId = asNonEmptyString(record.userId);

  if (record.action === 'open') {
    const fileId = firstFileId(record.ids);
    return fileId ? { action: 'open', fileId, userId } : null;
  }
  if (record.action === 'create') {
    return { action: 'create', folderId: asNonEmptyString(record.folderId), userId };
  }
  return null;
}
