/**
 * GroupLabelDialog — vanilla DOM view.
 * Thin port of c4/components/dialogs/GroupLabelDialog.tsx.
 */
import {
  createDialog,
  createDialogTitle,
  createDialogContent,
  createDialogActions,
  createButton,
  createTextField,
} from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface GroupLabelDialogVanillaProps {
  readonly open: boolean;
  readonly initialLabel?: string;
  readonly onClose: () => void;
  readonly onSave: (label: string) => void;
}

export function mountGroupLabelDialog(
  _container: HTMLElement,
  initial: GroupLabelDialogVanillaProps,
): VanillaViewHandle<GroupLabelDialogVanillaProps> {
  let props = initial;
  let labelValue = props.initialLabel ?? '';

  const labelField = createTextField({
    label: 'ラベル',
    value: labelValue,
    autoFocus: true,
    size: 'small',
    fullWidth: true,
    style: { marginTop: '8px' },
    onChange: (e) => { labelValue = (e.target as HTMLInputElement).value; },
    onKeyDown: (e) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') props.onClose();
    },
  });

  const cancelBtn = createButton({
    label: 'キャンセル',
    onClick: () => props.onClose(),
  });

  const saveBtn = createButton({
    label: '保存',
    variant: 'contained',
    onClick: handleSave,
  });

  function handleSave(): void {
    props.onSave(labelValue.trim());
    props.onClose();
  }

  const titleEl = createDialogTitle({ children: 'グループラベルの編集' });
  const contentEl = createDialogContent({ children: labelField.el });
  const actionsEl = createDialogActions({ children: [cancelBtn.el, saveBtn.el] });

  let dialog: ReturnType<typeof createDialog> | null = null;

  function openDialog(): void {
    if (dialog) return;
    labelValue = props.initialLabel ?? '';
    labelField.update({ value: labelValue });
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
        // Resync if open and initialLabel changed
        labelValue = next.initialLabel ?? '';
        labelField.update({ value: labelValue });
      }
    },
    destroy() {
      closeDialog();
      labelField.destroy();
      cancelBtn.destroy();
      saveBtn.destroy();
    },
  };
}
