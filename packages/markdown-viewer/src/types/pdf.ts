/**
 * PDF export（印刷）まわりの React 非依存型。
 *
 * - `DarkDiagramPrintPreparer`: ダークモード時に図（mermaid 等）を印刷用ライト配色へ
 *   差し替える準備関数。markdown-rich の `prepareDarkDiagramsForPrint` が実装し、
 *   consumer の PDF export フロー（`fileHandlers.onExportPdf`）へ注入される。
 * - 戻り値:
 *   - `applyBeforePrint`: print 直前に適用する
 *   - `restore`: print 後に元へ戻す
 *   - `hasChanges`: 図を準備したか。print 前の再レンダー待ち delay を入れるか判断する
 */
export type DarkDiagramPrintPreparer = () => Promise<{
  applyBeforePrint: () => void;
  restore: () => void;
  hasChanges: boolean;
}>;
