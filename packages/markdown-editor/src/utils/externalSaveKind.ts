/**
 * 上書き保存の宛先種別（ツールバーのラベル切替用）の遷移規則。
 *
 * `fileOpsController` は宛先を `"local" | "external"` の 2 値でしか通知しないため、
 * external が GitHub か Drive かはホスト（web-app 等）が持つ値が唯一の真実源になる。
 * ローカルへ「名前を付けて保存」した後の上書き保存はローカルへ行くので、種別は消える。
 */
export type ExternalSaveKind = "github" | "drive";

/**
 * 保存先の遷移後に採用する宛先種別を返す。
 *
 * @param targetKind fileOpsController が通知した新しい保存先（null は保存先なし）
 * @param hostKind ホストが保持する外部保存の宛先種別（GitHub から Drive へ移った場合はこちらが先に変わる）
 */
export function nextExternalSaveKind(
  targetKind: "local" | "external" | null,
  hostKind: ExternalSaveKind | undefined,
): ExternalSaveKind | undefined {
  return targetKind === "local" ? undefined : hostKind;
}

/**
 * ステータスバーに表示する「本文がどこのファイルか」。
 *
 * `ExternalSaveKind` が上書き保存の宛先種別なのに対し、こちらは表示専用。
 */
export type FileOrigin = "local" | ExternalSaveKind;

/**
 * 表示中のファイル名と外部保存の宛先種別から、ファイルの所在を判定する。
 *
 * 外部保存の種別があればそれが所在（GitHub / Drive）、無ければローカルファイル。
 * ファイル名が無い（新規未保存）ときは表示するものが無いので null。
 *
 * @param fileName 表示中のファイル名（null / undefined は新規未保存）
 * @param externalSaveKind 外部保存の宛先種別（undefined はローカル保存先）
 */
export function fileOriginFor(
  fileName: string | null | undefined,
  externalSaveKind: ExternalSaveKind | undefined,
): FileOrigin | null {
  if (!fileName) return null;
  return externalSaveKind ?? "local";
}
