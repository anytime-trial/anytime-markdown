/**
 * AddRelationshipDialog — vanilla DOM view.
 * Thin port of c4/components/dialogs/C4EditDialogs.tsx (AddRelationshipDialog part).
 */
import {
  createDialog,
  createDialogTitle,
  createDialogContent,
  createDialogActions,
  createButton,
  createTextField,
  createSelect,
} from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import type { RelationshipFormData } from '../../../c4/components/dialogs/C4EditDialogs';

export type { RelationshipFormData };

export interface AddRelationshipDialogVanillaProps {
  readonly open: boolean;
  readonly from: string;
  readonly fromName: string;
  readonly candidates: readonly { id: string; name: string }[];
  readonly onSubmit: (data: RelationshipFormData) => void;
  readonly onClose: () => void;
}

export function mountAddRelationshipDialog(
  _container: HTMLElement,
  initial: AddRelationshipDialogVanillaProps,
): VanillaViewHandle<AddRelationshipDialogVanillaProps> {
  let props = initial;

  // Internal form state
  let toId = '';
  let label = '';
  let technology = '';

  // ---- Form elements ----
  const fromField = createTextField({
    label: 'From',
    value: props.fromName,
    size: 'small',
    fullWidth: true,
    inputAttrs: { readonly: 'true' },
  });

  const toSelect = createSelect<string>({
    value: toId,
    options: props.candidates.map((c) => ({ value: c.id, label: c.name })),
    ariaLabel: 'To',
    fullWidth: true,
    onChange: (v) => {
      toId = v;
      submitBtn.update({ disabled: !toId });
    },
  });
  const toSelectWrap = document.createElement('div');
  const toLabel = document.createElement('div');
  toLabel.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);margin-bottom:4px;';
  toLabel.textContent = 'To';
  toSelectWrap.appendChild(toLabel);
  toSelectWrap.appendChild(toSelect.el);

  const labelField = createTextField({
    label: 'Label',
    value: label,
    size: 'small',
    fullWidth: true,
    placeholder: 'e.g. Uses, Calls, Reads from',
    onChange: (e) => { label = (e.target as HTMLInputElement).value; },
    onKeyDown: (e) => { if (e.key === 'Enter') handleSubmit(); },
  });

  const technologyField = createTextField({
    label: 'Technology',
    value: technology,
    size: 'small',
    fullWidth: true,
    placeholder: 'e.g. REST API, gRPC',
    onChange: (e) => { technology = (e.target as HTMLInputElement).value; },
  });

  const cancelBtn = createButton({
    label: 'Cancel',
    onClick: () => props.onClose(),
  });

  const submitBtn = createButton({
    label: 'Add',
    variant: 'contained',
    disabled: !toId,
    onClick: handleSubmit,
  });

  function handleSubmit(): void {
    if (!toId) return;
    props.onSubmit({
      from: props.from,
      to: toId,
      label: label.trim(),
      technology: technology.trim(),
    });
    props.onClose();
  }

  const contentBox = document.createElement('div');
  contentBox.style.cssText = 'display:flex;flex-direction:column;gap:16px;padding-top:8px;';
  contentBox.appendChild(fromField.el);
  contentBox.appendChild(toSelectWrap);
  contentBox.appendChild(labelField.el);
  contentBox.appendChild(technologyField.el);

  const titleEl = createDialogTitle({ children: 'Add Relationship' });
  const contentEl = createDialogContent({ children: contentBox });
  const actionsEl = createDialogActions({ children: [cancelBtn.el, submitBtn.el] });

  let dialog: ReturnType<typeof createDialog> | null = null;

  function resetForm(): void {
    toId = '';
    label = '';
    technology = '';
    fromField.update({ value: props.fromName });
    toSelect.update({
      value: '',
      options: props.candidates.map((c) => ({ value: c.id, label: c.name })),
    });
    labelField.update({ value: '' });
    technologyField.update({ value: '' });
    submitBtn.update({ disabled: true });
  }

  function openDialog(): void {
    if (dialog) return;
    resetForm();
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
        fromField.update({ value: next.fromName });
        toSelect.update({
          options: next.candidates.map((c) => ({ value: c.id, label: c.name })),
        });
      }
    },
    destroy() {
      closeDialog();
      fromField.destroy();
      toSelect.destroy();
      labelField.destroy();
      technologyField.destroy();
      cancelBtn.destroy();
      submitBtn.destroy();
    },
  };
}
