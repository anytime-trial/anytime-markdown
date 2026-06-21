/**
 * TopEntitiesTable の vanilla DOM 版。
 * memory pipeline で頻出のエンティティ上位 N 件をテーブル表示する。
 */
import { createChip } from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';
import type { MemoryTopEntityRow } from '../../data/types';

export interface TopEntitiesTableProps {
  readonly t: (key: string) => string;
  readonly entities: readonly MemoryTopEntityRow[];
}

export function mountTopEntitiesTable(
  container: HTMLElement,
  initial: TopEntitiesTableProps,
): VanillaViewHandle<TopEntitiesTableProps> {
  let props = initial;

  const root = document.createElement('div');
  container.appendChild(root);

  const CHARCOAL = 'var(--am-color-bg-default)';
  const HEAD_CSS = `color:var(--am-color-text-secondary);font-size:0.7rem;padding:2px 8px;background-color:${CHARCOAL};text-align:left;font-weight:600;`;
  const CELL_CSS = 'padding:2px 8px;';

  function render(): void {
    root.replaceChildren();

    if (props.entities.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText =
        'padding:16px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:var(--am-color-text-secondary);';
      empty.textContent = props.t('memory.runs.empty');
      root.appendChild(empty);
      return;
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'max-height:280px;overflow:auto;';

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.75rem;';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const label of ['Type', 'Name', 'Updated']) {
      const th = document.createElement('th');
      th.style.cssText = HEAD_CSS;
      th.textContent = label;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of props.entities) {
      const tr = document.createElement('tr');
      tr.addEventListener('mouseenter', () => {
        tr.style.backgroundColor = 'var(--am-color-action-hover)';
      });
      tr.addEventListener('mouseleave', () => {
        tr.style.backgroundColor = '';
      });

      // Type cell (chip)
      const tdType = document.createElement('td');
      tdType.style.cssText = CELL_CSS;
      const { el: chip } = createChip({ label: row.type, size: 'small' });
      chip.style.fontSize = '0.65rem';
      chip.style.height = '18px';
      tdType.appendChild(chip);

      // Name cell
      const tdName = document.createElement('td');
      tdName.style.cssText = `${CELL_CSS}max-width:280px;`;
      const nameSpan = document.createElement('span');
      nameSpan.style.cssText =
        'display:block;font-size:0.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--am-color-text-primary);';
      nameSpan.textContent = row.displayName || row.canonicalName;
      nameSpan.title = row.displayName || row.canonicalName;
      tdName.appendChild(nameSpan);

      // Updated cell
      const tdUpdated = document.createElement('td');
      tdUpdated.style.cssText = `${CELL_CSS}font-size:0.7rem;white-space:nowrap;color:var(--am-color-text-secondary);`;
      tdUpdated.textContent = row.lastUpdatedAt.slice(0, 10);

      tr.append(tdType, tdName, tdUpdated);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    root.appendChild(wrap);
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
