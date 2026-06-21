/**
 * ChatPanel の vanilla DOM 版。
 * 3カラムレイアウト（フィルタ / チャット / ソース）または SetupGuide を描画する。
 *
 * NOTE: FiltersPanel はこのモジュール内でインライン実装する（small footprint のため）。
 */
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import type { ChatBridge } from '../../hooks/useChatBridge';
import type { ChatUiSource } from '../../components/memory/chatReducer';
import { mountSetupGuide } from './setupGuide';
import { mountChatPane } from './chatPane';
import { mountSourcesPanel } from './sourcesPanel';
import { mountFiltersPanel } from './filtersPanel';

type RepoScope = 'all' | 'current';

export interface ChatPanelProps {
  readonly t: (key: string) => string;
  readonly bridge: ChatBridge;
}

export function mountChatPanel(
  container: HTMLElement,
  initial: ChatPanelProps,
): VanillaViewHandle<ChatPanelProps> {
  let props = initial;
  let repoScope: RepoScope = 'all';
  let sources: ReadonlyArray<ChatUiSource> = [];

  const root = document.createElement('div');
  root.setAttribute('aria-label', 'chat-panel');
  root.style.cssText = 'height:100%;display:flex;flex-direction:column;';
  container.appendChild(root);

  let setupHandle: VanillaViewHandle<Parameters<typeof mountSetupGuide>[1]> | null = null;
  let filtersHandle: VanillaViewHandle<Parameters<typeof mountFiltersPanel>[1]> | null = null;
  let chatPaneHandle: VanillaViewHandle<Parameters<typeof mountChatPane>[1]> | null = null;
  let sourcesHandle: VanillaViewHandle<Parameters<typeof mountSourcesPanel>[1]> | null = null;
  let gridEl: HTMLElement | null = null;

  function destroyInner(): void {
    setupHandle?.destroy();
    setupHandle = null;
    filtersHandle?.destroy();
    filtersHandle = null;
    chatPaneHandle?.destroy();
    chatPaneHandle = null;
    sourcesHandle?.destroy();
    sourcesHandle = null;
    gridEl = null;
    root.replaceChildren();
  }

  function renderSetup(): void {
    destroyInner();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'flex:1;min-height:0;';
    root.appendChild(wrap);
    setupHandle = mountSetupGuide(wrap, {
      t: props.t,
      onRecheck: () => props.bridge.recheck(),
      detail: props.bridge.detail,
    });
  }

  function renderGrid(): void {
    destroyInner();

    const grid = document.createElement('div');
    grid.style.cssText =
      'display:grid;grid-template-columns:180px 1fr 320px;height:100%;min-height:0;';
    root.appendChild(grid);
    gridEl = grid;

    // Filters column
    const filtersCol = document.createElement('div');
    filtersCol.style.cssText = 'min-height:0;overflow:hidden;';
    filtersHandle = mountFiltersPanel(filtersCol, {
      t: props.t,
      repoScope,
      onRepoScopeChange: (scope) => {
        repoScope = scope;
      },
    });
    grid.appendChild(filtersCol);

    // Chat pane column
    const chatCol = document.createElement('div');
    chatCol.style.cssText = 'min-height:0;display:flex;flex-direction:column;overflow:hidden;';
    chatPaneHandle = mountChatPane(chatCol, {
      t: props.t,
      bridge: props.bridge,
      onSourcesChange: (srcs) => {
        sources = srcs;
        sourcesHandle?.update({ t: props.t, sources, onSelect: undefined });
      },
    });
    grid.appendChild(chatCol);

    // Sources column
    const sourcesCol = document.createElement('div');
    sourcesCol.style.cssText = 'min-height:0;overflow:hidden;';
    sourcesHandle = mountSourcesPanel(sourcesCol, {
      t: props.t,
      sources,
    });
    grid.appendChild(sourcesCol);
  }

  function render(): void {
    if (props.bridge.status === 'unavailable') {
      if (!setupHandle) renderSetup();
      else {
        setupHandle.update({
          t: props.t,
          onRecheck: () => props.bridge.recheck(),
          detail: props.bridge.detail,
        });
      }
    } else {
      if (!gridEl) renderGrid();
      else {
        filtersHandle?.update({ t: props.t, repoScope, onRepoScopeChange: (scope) => { repoScope = scope; } });
        chatPaneHandle?.update({ t: props.t, bridge: props.bridge });
        sourcesHandle?.update({ t: props.t, sources });
      }
    }
  }

  render();

  return {
    update(next) {
      const statusChanged = next.bridge.status !== props.bridge.status;
      props = next;
      if (statusChanged) {
        render();
      } else {
        render();
      }
    },
    destroy() {
      destroyInner();
      root.remove();
    },
  };
}
