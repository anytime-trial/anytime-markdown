/**
 * AddElementDialog — vanilla DOM view.
 * Thin port of c4/components/dialogs/C4EditDialogs.tsx (AddElementDialog part).
 */
import {
  createDialog,
  createDialogTitle,
  createDialogContent,
  createDialogActions,
  createButton,
  createTextField,
  createCheckbox,
  createSelect,
} from '@anytime-markdown/ui-core';
import { SERVICE_CATALOG, filterServices } from '@anytime-markdown/trail-core/c4/services';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import type {
  C4ElementKind,
  ElementFormData,
} from '../../../c4/components/dialogs/C4EditDialogs';

export type { C4ElementKind, ElementFormData };

const ELEMENT_TYPE_LABELS: Record<C4ElementKind, string> = {
  person: 'Person',
  system: 'System',
  container: 'Container',
  component: 'Component',
};

export interface AddElementDialogVanillaProps {
  readonly open: boolean;
  readonly elementType: C4ElementKind;
  readonly initial?: Partial<ElementFormData> | null;
  readonly onSubmit: (data: ElementFormData) => void;
  readonly onClose: () => void;
  readonly parentCandidates?: readonly { id: string; name: string }[];
  readonly serviceOptions?: readonly { id: string; label: string }[];
}

export function mountAddElementDialog(
  _container: HTMLElement,
  initial: AddElementDialogVanillaProps,
): VanillaViewHandle<AddElementDialogVanillaProps> {
  let props = initial;

  // Internal form state
  let name = props.initial?.name ?? '';
  let description = props.initial?.description ?? '';
  let external = props.initial?.external ?? false;
  let parentId = props.initial?.parentId ?? '';
  let serviceType = props.initial?.serviceType ?? '';
  let serviceQuery = '';

  // ---- Form elements ----
  const nameField = createTextField({
    label: 'Name',
    value: name,
    autoFocus: true,
    required: true,
    size: 'small',
    fullWidth: true,
    onChange: (e) => { name = (e.target as HTMLInputElement).value; submitBtn.update({ disabled: !name.trim() }); },
    onKeyDown: (e) => { if (e.key === 'Enter') handleSubmit(); },
  });

  const descField = createTextField({
    label: 'Description',
    value: description,
    size: 'small',
    fullWidth: true,
    multiline: true,
    minRows: 2,
    onChange: (e) => { description = (e.target as HTMLInputElement).value; },
  });

  const externalCheckbox = createCheckbox({
    checked: external,
    onChange: (checked) => { external = checked; },
  });

  const externalWrap = document.createElement('label');
  externalWrap.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;font-size:0.875rem;';
  externalWrap.appendChild(externalCheckbox.el);
  const externalLabel = document.createElement('span');
  externalLabel.textContent = 'External system';
  externalWrap.appendChild(externalLabel);

  // Parent select (built dynamically based on candidates)
  let parentSelect: ReturnType<typeof createSelect<string>> | null = null;
  const parentWrap = document.createElement('div');

  // Service search (for container)
  const serviceSearchField = createTextField({
    label: 'サービス名で検索...',
    value: serviceQuery,
    size: 'small',
    fullWidth: true,
    onChange: (e) => {
      serviceQuery = (e.target as HTMLInputElement).value;
      renderServiceGrid();
    },
  });

  const serviceGrid = document.createElement('div');
  serviceGrid.style.cssText =
    'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;' +
    'max-height:160px;overflow-y:auto;margin-top:4px;';

  const serviceWrap = document.createElement('div');
  serviceWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  const serviceLabel = document.createElement('div');
  serviceLabel.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);';
  serviceLabel.textContent = '外部サービス（任意）';
  serviceWrap.appendChild(serviceLabel);
  serviceWrap.appendChild(serviceSearchField.el);
  serviceWrap.appendChild(serviceGrid);

  function renderServiceGrid(): void {
    serviceGrid.replaceChildren();
    const filtered = filterServices(serviceQuery);
    for (const entry of filtered) {
      const card = document.createElement('div');
      card.style.cssText =
        'display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px;' +
        'border-radius:4px;cursor:pointer;border:1px solid;' +
        `border-color:${entry.id === serviceType ? 'var(--am-color-primary-main)' : 'var(--am-color-divider)'};` +
        `background:${entry.id === serviceType ? 'var(--am-color-primary-bg,rgba(25,118,210,0.08))' : 'transparent'};` +
        'transition:border-color 150ms,background-color 150ms;';
      card.addEventListener('click', () => {
        const prev = serviceType;
        serviceType = entry.id === prev ? '' : entry.id;
        if (serviceType && !name.trim()) {
          const found = SERVICE_CATALOG.find((s) => s.id === serviceType);
          if (found) {
            name = found.label;
            nameField.update({ value: name });
            submitBtn.update({ disabled: !name.trim() });
          }
        }
        renderServiceGrid();
      });

      // Icon
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', entry.iconViewBox ?? '0 0 24 24');
      svg.style.cssText = 'width:20px;height:20px;';
      if (entry.iconBody) {
        // iconBody is static, developer-authored SVG content (not user input)
        svg.innerHTML = entry.iconBody;
      } else {
        svg.setAttribute('fill', entry.brandColor ?? 'currentColor');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', entry.iconPath ?? '');
        svg.appendChild(path);
      }
      card.appendChild(svg);

      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:9px;text-align:center;line-height:1.2;word-break:break-all;';
      lbl.textContent = entry.label;
      card.appendChild(lbl);

      serviceGrid.appendChild(card);
    }
  }

  // Content area
  const contentBox = document.createElement('div');
  contentBox.style.cssText = 'display:flex;flex-direction:column;gap:16px;padding-top:8px;';
  contentBox.appendChild(nameField.el);
  contentBox.appendChild(descField.el);

  // Action buttons
  const cancelBtn = createButton({
    label: 'Cancel',
    onClick: () => props.onClose(),
  });

  const submitBtn = createButton({
    label: getSubmitLabel(),
    variant: 'contained',
    disabled: !name.trim(),
    onClick: handleSubmit,
  });

  function getSubmitLabel(): string {
    return props.initial?.name ? 'Update' : 'Add';
  }

  function getTitle(): string {
    const typeLabel = ELEMENT_TYPE_LABELS[props.elementType];
    return props.initial?.name ? `Edit ${typeLabel}` : `Add ${typeLabel}`;
  }

  function handleSubmit(): void {
    if (!name.trim()) return;
    const needsParent =
      props.elementType === 'container' || props.elementType === 'component';
    props.onSubmit({
      type: props.elementType,
      name: name.trim(),
      description: description.trim(),
      external,
      parentId: needsParent ? (parentId || null) : null,
      serviceType: serviceType || undefined,
    });
    props.onClose();
  }

  // Build initial content
  function buildContent(): void {
    contentBox.replaceChildren();
    contentBox.appendChild(nameField.el);
    contentBox.appendChild(descField.el);

    if (props.elementType === 'system') {
      contentBox.appendChild(externalWrap);
    }

    const needsParent =
      props.elementType === 'container' || props.elementType === 'component';
    if (needsParent && props.parentCandidates && props.parentCandidates.length > 0) {
      // Build/rebuild parent select
      if (parentSelect) parentSelect.destroy();
      parentSelect = createSelect<string>({
        value: parentId,
        options: [
          { value: '', label: 'None' },
          ...props.parentCandidates.map((c) => ({ value: c.id, label: c.name })),
        ],
        ariaLabel: 'Parent',
        fullWidth: true,
        onChange: (v) => { parentId = v; },
      });
      parentWrap.replaceChildren(parentSelect.el);
      contentBox.appendChild(parentWrap);
    }

    if (props.elementType === 'container') {
      renderServiceGrid();
      contentBox.appendChild(serviceWrap);
    }
  }

  const titleEl = createDialogTitle({ children: getTitle() });
  const contentEl = createDialogContent({ children: contentBox });
  const actionsEl = createDialogActions({ children: [cancelBtn.el, submitBtn.el] });

  let dialog: ReturnType<typeof createDialog> | null = null;

  function openDialog(): void {
    if (dialog) return;
    // Reset form state
    name = props.initial?.name ?? '';
    description = props.initial?.description ?? '';
    external = props.initial?.external ?? false;
    parentId = props.initial?.parentId ?? '';
    serviceType = props.initial?.serviceType ?? '';
    serviceQuery = '';

    nameField.update({ value: name });
    descField.update({ value: description });
    externalCheckbox.setChecked(external);
    submitBtn.update({ label: getSubmitLabel(), disabled: !name.trim() });

    buildContent();

    titleEl.el.textContent = getTitle();

    dialog = createDialog({
      maxWidth: 'xs',
      fullWidth: true,
      onClose: () => props.onClose(),
      children: [titleEl.el, contentEl.el, actionsEl.el],
    });
  }

  function closeDialog(): void {
    if (!dialog) return;
    dialog.destroy();
    dialog = null;
  }

  if (props.open) openDialog();

  return {
    update(next) {
      const wasOpen = props.open;
      props = next;

      if (!wasOpen && next.open) {
        openDialog();
      } else if (wasOpen && !next.open) {
        closeDialog();
      } else if (next.open && dialog) {
        // Update title if needed
        titleEl.el.textContent = getTitle();
        submitBtn.update({ label: getSubmitLabel() });
        buildContent();
      }
    },
    destroy() {
      closeDialog();
      if (parentSelect) parentSelect.destroy();
      nameField.destroy();
      descField.destroy();
      externalCheckbox.destroy();
      serviceSearchField.destroy();
      cancelBtn.destroy();
      submitBtn.destroy();
    },
  };
}
