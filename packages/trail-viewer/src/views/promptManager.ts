/**
 * PromptManager vanilla view — left sidebar only.
 *
 * Renders the collapsible prompt-tree sidebar (categories + prompt items).
 * The right-panel markdown preview (LazyPromptMarkdownPreview) is a React
 * component and is rendered by the thin .tsx wrapper outside this island.
 *
 * `onSelect` is called when the user picks a prompt; the .tsx wrapper uses
 * it to update the selected prompt ID and drive the preview pane.
 */
import { createChip, createCollapse } from '@anytime-markdown/ui-core';
import type { TrailPromptEntry } from '../domain/parser/types';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import { buildPromptTree } from '../components/messages/promptTree';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PromptManagerSidebarProps {
  readonly prompts: readonly TrailPromptEntry[];
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string) => void;
  readonly t: (key: string) => string;
  readonly colors: Readonly<{
    textSecondary: string;
    border: string;
    sectionBg: string;
    iceBlue: string;
    hoverBg: string;
    activeBg: string;
    iceBlueBorder: string;
  }>;
}

// ---------------------------------------------------------------------------
// Icons (inline SVG arrows, avoid importing icon package in vanilla view)
// ---------------------------------------------------------------------------

function chevronDown(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z');
  svg.appendChild(path);
  return svg;
}

function chevronUp(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z');
  svg.appendChild(path);
  return svg;
}

// ---------------------------------------------------------------------------
// mount
// ---------------------------------------------------------------------------

export function mountPromptManagerSidebar(
  container: HTMLElement,
  initial: PromptManagerSidebarProps,
): VanillaViewHandle<PromptManagerSidebarProps> {
  let props = initial;
  const collapseHandles: Array<{ destroy(): void }> = [];
  const chipHandles: Array<{ destroy(): void }> = [];

  const root = document.createElement('div');
  root.style.cssText =
    'width:100%;height:100%;overflow-y:auto;scrollbar-width:thin;' +
    'scrollbar-color:var(--am-color-action-disabled,rgba(0,0,0,0.26)) transparent;';
  container.appendChild(root);

  function renderTree(): void {
    for (const h of collapseHandles) h.destroy();
    collapseHandles.length = 0;
    for (const h of chipHandles) h.destroy();
    chipHandles.length = 0;
    root.replaceChildren();

    const promptTree = buildPromptTree(props.prompts);

    if (props.prompts.length === 0) {
      const msg = document.createElement('div');
      msg.style.cssText = `padding:16px;text-align:center;color:${props.colors.textSecondary};font-size:0.8125rem;`;
      msg.textContent = props.t('prompt.noPrompts');
      root.appendChild(msg);
      return;
    }

    for (const group of promptTree) {
      // Category header
      let collapsed = false;
      const categoryBtn = document.createElement('button');
      categoryBtn.style.cssText =
        `display:flex;align-items:center;width:100%;padding:4px 12px;` +
        `background:${props.colors.sectionBg};border:none;cursor:pointer;` +
        `color:inherit;text-align:left;gap:8px;`;

      const categoryText = document.createElement('div');
      categoryText.style.cssText = 'flex:1;min-width:0;';
      const categoryName = document.createElement('div');
      categoryName.style.cssText = 'font-size:0.875rem;font-weight:600;';
      categoryName.textContent = group.category;
      const categoryCount = document.createElement('div');
      categoryCount.style.cssText = `font-size:0.75rem;color:${props.colors.textSecondary};`;
      categoryCount.textContent = `${group.prompts.length} files`;
      categoryText.append(categoryName, categoryCount);

      const iconWrap = document.createElement('span');
      iconWrap.style.cssText = `color:${props.colors.textSecondary};display:flex;align-items:center;`;
      iconWrap.appendChild(chevronDown());

      categoryBtn.append(categoryText, iconWrap);

      // Collapse content
      const collapseContent = document.createElement('div');

      for (const prompt of group.prompts) {
        const item = document.createElement('button');
        const isSelected = prompt.id === props.selectedId;
        item.style.cssText =
          `display:flex;flex-direction:column;align-items:flex-start;` +
          `width:100%;padding:8px 16px 8px 24px;background:${isSelected ? props.colors.activeBg : 'transparent'};` +
          `border:none;cursor:pointer;color:inherit;text-align:left;` +
          `border-left:2px solid ${isSelected ? props.colors.iceBlue : 'transparent'};`;

        item.addEventListener('mouseover', () => {
          if (prompt.id !== props.selectedId) {
            item.style.backgroundColor = props.colors.hoverBg;
          }
        });
        item.addEventListener('mouseout', () => {
          if (prompt.id !== props.selectedId) {
            item.style.backgroundColor = 'transparent';
          }
        });
        item.addEventListener('click', () => {
          props.onSelect(prompt.id);
        });

        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'font-size:0.875rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;';
        nameEl.textContent = prompt.name;

        const tagsRow = document.createElement('div');
        tagsRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;';
        for (const tag of prompt.tags) {
          const chipHandle = createChip({ label: tag, size: 'small', variant: 'outlined' });
          chipHandle.el.style.cssText += `border-color:${props.colors.iceBlue};color:${props.colors.iceBlue};`;
          chipHandles.push(chipHandle);
          tagsRow.appendChild(chipHandle.el);
        }

        const dateEl = document.createElement('div');
        dateEl.style.cssText = `font-size:0.75rem;color:${props.colors.textSecondary};margin-top:4px;`;
        dateEl.textContent = new Date(prompt.updatedAt).toLocaleDateString();

        item.append(nameEl, tagsRow, dateEl);
        collapseContent.appendChild(item);
      }

      const collapseHandle = createCollapse({ in: true, children: collapseContent });
      collapseHandles.push(collapseHandle);

      categoryBtn.addEventListener('click', () => {
        collapsed = !collapsed;
        iconWrap.replaceChildren(collapsed ? chevronUp() : chevronDown());
        collapseHandle.update({ in: !collapsed });
      });

      root.appendChild(categoryBtn);
      root.appendChild(collapseHandle.el);
    }
  }

  renderTree();

  return {
    update(next) {
      props = next;
      renderTree();
    },
    destroy() {
      for (const h of collapseHandles) h.destroy();
      collapseHandles.length = 0;
      for (const h of chipHandles) h.destroy();
      chipHandles.length = 0;
      root.remove();
    },
  };
}
