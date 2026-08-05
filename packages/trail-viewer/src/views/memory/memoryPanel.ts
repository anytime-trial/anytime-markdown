/**
 * MemoryPanel（表示名 Trail Pipeline）の vanilla DOM 版。
 *
 * 中身は pipeline runs の 1 枚だけである。かつては Drift / Bugs / Reviews / Chat をサブタブで
 * 切り替えていたが、2026-08-05 に Chat をトップレベルタブへ、残り 3 つを Flight Record へ移設し、
 * 同日サブタブバーも畳んだ。選択肢が 1 つしかないタブバーは操作の余地が無く、押しても何も
 * 変わらないコントロールを画面に残すだけになるため。
 *
 * したがって本パネルが持つのは `MemoryReader` と DB 存在プローブ（loading / noDb / 本体の
 * 3 状態）だけで、サブタブ状態・hash routing・サブビューの出し分けは持たない。
 * `#memory/<tab>` の hash も解釈しない（対応する選択肢が無い）。
 *
 * 呼び出し側（components/MemoryPanel.tsx）は thin React wrapper として
 * useTrailTheme / useTrailI18n を解決し、
 * tokens / isDark / t を props に含めてこのビューに渡す。
 */
import type { TrailThemeTokens } from '../../theme/designTokens';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import { MemoryReader } from '../../data/readers/MemoryReader';
import { mountPipelineRunsPanel } from './pipelineRunsPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryPanelViewProps {
  readonly serverUrl: string;
  readonly tokens: TrailThemeTokens;
  readonly isDark: boolean;
  readonly t: (key: string) => string;
}

type RunsHandle = VanillaViewHandle<Parameters<typeof mountPipelineRunsPanel>[1]>;

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function mountMemoryPanel(
  container: HTMLElement,
  initial: MemoryPanelViewProps,
): VanillaViewHandle<MemoryPanelViewProps> {
  let props = initial;
  let destroyed = false;

  // --- State -----------------------------------------------------------------
  let dbExists: boolean | null = null;

  const reader = new MemoryReader(props.serverUrl);
  let currentServerUrl = props.serverUrl;

  // --- Root layout -----------------------------------------------------------
  const root = document.createElement('div');
  root.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;';
  container.appendChild(root);

  // --- Loading / noDb placeholders ------------------------------------------
  const loadingEl = document.createElement('div');
  loadingEl.style.cssText =
    'flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;';

  const spinner = document.createElement('div');
  spinner.setAttribute('role', 'progressbar');
  spinner.style.cssText =
    'width:24px;height:24px;border:3px solid var(--am-color-divider);' +
    'border-top-color:var(--am-color-primary-main);border-radius:50%;' +
    'animation:am-spin 0.8s linear infinite;';
  // inject spin keyframes once
  if (!document.getElementById('am-spin-keyframes')) {
    const style = document.createElement('style');
    style.id = 'am-spin-keyframes';
    style.textContent = '@keyframes am-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }

  const loadingText = document.createElement('span');
  loadingText.style.cssText =
    'font-size:0.875rem;color:var(--am-color-text-secondary);';
  loadingText.textContent = props.t('memory.loading');
  loadingEl.append(spinner, loadingText);

  const noDbEl = document.createElement('div');
  noDbEl.style.cssText =
    'flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;';

  const noDbTitle = document.createElement('span');
  noDbTitle.style.cssText = 'font-size:1rem;color:var(--am-color-text-primary);';
  noDbTitle.textContent = props.t('memory.noDb');

  const noDbDesc = document.createElement('span');
  noDbDesc.style.cssText = 'font-size:0.875rem;color:var(--am-color-text-secondary);';
  noDbDesc.textContent = props.t('memory.noDb.description');
  noDbEl.append(noDbTitle, noDbDesc);

  // --- Panel host ------------------------------------------------------------
  // 一度マウントしたら破棄しない（展開行・スクロール位置などの下位 UI 状態を保つ）。
  const panelHost = document.createElement('div');
  panelHost.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;';
  panelHost.dataset['memoryPanelHost'] = 'runs';

  let runsHandle: RunsHandle | null = null;

  function runsProps(): Parameters<typeof mountPipelineRunsPanel>[1] {
    return { t: props.t, reader, isDark: props.isDark };
  }

  function mountRuns(): void {
    if (runsHandle === null) {
      runsHandle = mountPipelineRunsPanel(panelHost, runsProps());
      return;
    }
    runsHandle.update(runsProps());
  }

  // --- Root render -----------------------------------------------------------
  function render(): void {
    root.replaceChildren();

    if (dbExists === null) {
      // still probing
      loadingText.textContent = props.t('memory.loading');
      root.appendChild(loadingEl);
      return;
    }

    if (dbExists === false) {
      noDbTitle.textContent = props.t('memory.noDb');
      noDbDesc.textContent = props.t('memory.noDb.description');
      root.appendChild(noDbEl);
      return;
    }

    // dbExists === true
    root.appendChild(panelHost);
    mountRuns();
  }

  // --- Probe on mount --------------------------------------------------------
  void reader.probe().then((exists) => {
    if (destroyed) return;
    dbExists = exists;
    render();
  });

  // initial render (shows loading spinner)
  render();

  // --- Public handle ---------------------------------------------------------
  return {
    update(next) {
      const urlChanged = next.serverUrl !== currentServerUrl;
      props = next;

      if (urlChanged) {
        // serverUrl changed: re-probe with new reader is not worth the complexity;
        // the React wrapper recreates the whole island if serverUrl changes.
        // For now reflect only t/isDark changes to the mounted panel.
        currentServerUrl = next.serverUrl;
      }

      // Update placeholder texts if visible
      loadingText.textContent = props.t('memory.loading');
      noDbTitle.textContent = props.t('memory.noDb');
      noDbDesc.textContent = props.t('memory.noDb.description');

      if (runsHandle !== null) runsHandle.update(runsProps());
    },
    destroy() {
      destroyed = true;
      runsHandle?.destroy();
      runsHandle = null;
      root.remove();
    },
  };
}
