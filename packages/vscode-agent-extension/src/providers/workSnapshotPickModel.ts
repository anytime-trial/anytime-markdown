import type { WorkSnapshot } from '@anytime-markdown/agent-core';
import { formatLocalDateTime } from '@anytime-markdown/vscode-common';

/** 日時を解釈できなかった行のラベル。兄弟ビュー（GitActivityItem）と同じ文言に揃える。 */
const UNKNOWN_TIME_LABEL = '時刻不明';

export interface SnapshotPickItem {
  /** QuickPickItem.label は string 必須。null を漏らすと行が選べなくなる。 */
  readonly label: string;
  readonly description: string;
  readonly detail: string;
  readonly snapshot: WorkSnapshot;
}

/**
 * 作業スナップショットを QuickPick の項目へ変換する。
 *
 * `formatLocalDateTime` は解釈できない日時に `null` を返す。これをそのまま
 * `QuickPickItem.label`（`string` 必須）へ渡すと、破損した 1 件のせいでその行のラベルが
 * 消えて選択できなくなる。1 件の破損で機能全体を巻き込まないよう、必ず string へ落とす。
 *
 * 保存・比較は UTC ISO のまま。表示のみローカル TZ へ変換する（拡張ホストは TZ=UTC のため
 * 素朴な変換は効かず、vscode-common の解決順序に従う必要がある）。
 */
export function buildSnapshotPickItems(
  snapshots: readonly WorkSnapshot[],
): readonly SnapshotPickItem[] {
  return snapshots.map((snapshot) => ({
    label: formatLocalDateTime(snapshot.createdAt) ?? UNKNOWN_TIME_LABEL,
    description: `${snapshot.fileCount} files`,
    detail: snapshot.sha.slice(0, 12),
    snapshot,
  }));
}
