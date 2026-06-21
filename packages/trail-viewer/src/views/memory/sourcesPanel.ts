/**
 * SourcesPanel の vanilla DOM 版。
 * チャット応答に添付されたソース一覧を右ペインに表示する。
 */
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import type { ChatUiSource } from '../../components/memory/chatReducer';

export interface SourcesPanelProps {
  readonly t: (key: string) => string;
  readonly sources: ReadonlyArray<ChatUiSource>;
  readonly onSelect?: (source: ChatUiSource) => void;
}

export function mountSourcesPanel(
  container: HTMLElement,
  initial: SourcesPanelProps,
): VanillaViewHandle<SourcesPanelProps> {
  let props = initial;

  const root = document.createElement('div');
  root.style.cssText =
    'border-left:1px solid var(--am-color-divider);padding:8px;overflow-y:auto;height:100%;box-sizing:border-box;';
  container.appendChild(root);

  function render(): void {
    root.replaceChildren();

    const heading = document.createElement('div');
    heading.style.cssText =
      'display:block;margin-bottom:8px;font-size:0.625rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--am-color-text-secondary);font-weight:600;';
    heading.textContent = props.t('memory.chat.sources.title');
    root.appendChild(heading);

    if (props.sources.length === 0) {
      const empty = document.createElement('span');
      empty.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);';
      empty.textContent = props.t('memory.chat.sources.empty');
      root.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.style.cssText = 'list-style:none;padding:0;margin:0;';

    for (const s of props.sources) {
      const item = document.createElement('li');
      item.style.cssText = 'padding:0;';

      const btn = document.createElement('button');
      btn.style.cssText =
        'display:block;width:100%;text-align:left;padding:4px 8px;background:none;border:none;cursor:pointer;border-radius:4px;';
      btn.addEventListener('click', () => props.onSelect?.(s));
      btn.addEventListener('mouseenter', () => {
        btn.style.backgroundColor = 'var(--am-color-action-hover)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.backgroundColor = '';
      });

      const primary = document.createElement('div');
      primary.style.cssText =
        'font-size:0.875rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--am-color-text-primary);';
      primary.textContent = s.title;
      primary.title = s.title;

      const secondary = document.createElement('div');
      secondary.style.cssText =
        'font-size:0.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--am-color-text-secondary);';
      secondary.textContent = `${s.kind}:${s.id}`;

      btn.append(primary, secondary);
      item.appendChild(btn);
      list.appendChild(item);
    }

    root.appendChild(list);
  }

  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      root.remove();
    },
  };
}
