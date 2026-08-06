/**
 * driftSection — Drift 一覧の**データ供給付き**マウント単位。
 *
 * `driftPanel` は presentational（受け取った rows を描くだけ）で、行の取得・履歴の取得・
 * 解決後の再取得は所有者側の責務になっている。その責務をここへ集約し、ホスト（Flight Record）
 * は「マウントするだけ」で済むようにする。ロード処理をホスト側へ複製すると、同じ view に
 * 供給元が 2 つできて片方だけ育つ既知の失敗形になる。
 *
 * 設計の要点:
 *   - `MemoryReader` は props.serverUrl から作り、`update()` で serverUrl が変わったら作り直す
 *     （mount 時に閉じ込めると接続先変更後も旧サーバーを読み続ける）。
 *   - ロードは非同期に完了するため、完了時に自分で `panel.update()` を呼ぶ。マウント時点の
 *     空配列で固定されない（「データはあるのに白紙」を防ぐ）。
 *   - 破棄後・reader 差し替え後に着弾した応答は捨てる（世代チェック）。
 */
import type { DriftHistoryPoint } from '@anytime-markdown/trail-core';
import { MemoryReader } from '../../data/readers/MemoryReader';
import type { MemoryDriftEventRow } from '../../data/types';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import { mountDriftPanel, type DriftPanelProps } from './driftPanel';

/** 一覧の取得上限。推移グラフはサーバー側集計（by-day）から別経路で取る。 */
const DRIFT_ROW_LIMIT = 200;

export interface DriftSectionProps {
  readonly serverUrl: string;
  readonly t: (key: string) => string;
  readonly isDark: boolean;
  /**
   * ワークスペース（repo_name）で乖離を絞る。空文字は「すべて」。
   *
   * サーバー側で絞るのは、`DRIFT_ROW_LIMIT` が絞り込み前に効くと、選んだワークスペースの
   * 乖離が窓から溢れて「0 件」に見えるため。
   */
  readonly workspace: string;
}

export function mountDriftSection(
  container: HTMLElement,
  initial: DriftSectionProps,
): VanillaViewHandle<DriftSectionProps> {
  let props = initial;
  let destroyed = false;

  let reader = new MemoryReader(props.serverUrl);
  let rows: readonly MemoryDriftEventRow[] = [];
  let historyPoints: readonly DriftHistoryPoint[] = [];

  const host = document.createElement('div');
  host.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;';
  container.appendChild(host);

  function buildPanelProps(): DriftPanelProps {
    return {
      t: props.t,
      rows,
      historyPoints,
      isDark: props.isDark,
      onResolve: handleResolve,
      onLoadDetail: (id) => reader.getDriftEventDetail(id),
    };
  }

  const panel = mountDriftPanel(host, buildPanelProps());

  /** 現行 reader 世代の応答だけを受け付ける（破棄後・接続先変更後の着弾を捨てる）。 */
  function isCurrent(generation: MemoryReader): boolean {
    return !destroyed && generation === reader;
  }

  function load(): void {
    const generation = reader;
    void generation
      .listDriftEvents({ unresolvedOnly: false, workspace: props.workspace, limit: DRIFT_ROW_LIMIT })
      .then((next) => {
        if (!isCurrent(generation)) return;
        rows = next;
        panel.update(buildPanelProps());
      })
      .catch((err: unknown) => {
        console.error('[driftSection] listDriftEvents failed', err);
      });
    void generation
      .getDriftHistoryByDay()
      .then((points) => {
        if (!isCurrent(generation)) return;
        historyPoints = points;
        panel.update(buildPanelProps());
      })
      .catch((err: unknown) => {
        console.error('[driftSection] getDriftHistoryByDay failed', err);
      });
  }

  async function handleResolve(id: string, note: string): Promise<void> {
    const generation = reader;
    await generation.resolveDriftEvent(id, note);
    const [nextRows, nextPoints] = await Promise.all([
      generation.listDriftEvents({ unresolvedOnly: false, workspace: props.workspace, limit: DRIFT_ROW_LIMIT }),
      generation.getDriftHistoryByDay(),
    ]);
    if (!isCurrent(generation)) return;
    rows = nextRows;
    historyPoints = nextPoints;
    panel.update(buildPanelProps());
  }

  load();

  return {
    update(next) {
      const serverUrlChanged = next.serverUrl !== props.serverUrl;
      const workspaceChanged = next.workspace !== props.workspace;
      props = next;
      if (serverUrlChanged) {
        // 接続先が変わったら reader ごと作り直し、旧世代の応答は捨てて取り直す。
        reader = new MemoryReader(props.serverUrl);
        rows = [];
        historyPoints = [];
        load();
      } else if (workspaceChanged) {
        // 絞り込みが変わったら取り直す。前の結果を残すと「別のワークスペースの行」を
        // 今の選択の結果として見せることになる。
        rows = [];
        load();
      }
      panel.update(buildPanelProps());
    },
    destroy() {
      destroyed = true;
      panel.destroy();
      host.remove();
    },
  };
}
