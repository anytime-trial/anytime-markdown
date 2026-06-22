import * as React from 'react';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import {
  mountGroupLabelDialog,
  type GroupLabelDialogVanillaProps,
} from '../../../views/c4/dialogs/groupLabelDialog';

interface GroupLabelDialogProps {
  readonly open: boolean;
  readonly initialLabel?: string;
  readonly onClose: () => void;
  readonly onSave: (label: string) => void;
}

export function GroupLabelDialog(props: Readonly<GroupLabelDialogProps>): React.ReactElement {
  const vanillaProps: GroupLabelDialogVanillaProps = {
    open: props.open,
    initialLabel: props.initialLabel,
    onClose: props.onClose,
    onSave: props.onSave,
  };
  return <VanillaIsland mount={mountGroupLabelDialog} props={vanillaProps} />;
}
