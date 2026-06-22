import * as React from 'react';
import { SERVICE_CATALOG } from '@anytime-markdown/trail-core/c4/services';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import {
  mountAddElementDialog,
  type AddElementDialogVanillaProps,
} from '../../../views/c4/dialogs/addElementDialog';
import {
  mountAddRelationshipDialog,
  type AddRelationshipDialogVanillaProps,
} from '../../../views/c4/dialogs/addRelationshipDialog';

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type C4ElementKind = 'person' | 'system' | 'container' | 'component';

export interface ElementFormData {
  type: C4ElementKind;
  name: string;
  description: string;
  external: boolean;
  parentId?: string | null;
  serviceType?: string;
}

export interface RelationshipFormData {
  from: string;
  to: string;
  label: string;
  technology: string;
}

export interface ElementOption {
  readonly id: string;
  readonly name: string;
}

// ---------------------------------------------------------------------------
//  AddElementDialog thin wrapper
// ---------------------------------------------------------------------------

interface AddElementDialogProps {
  readonly open: boolean;
  readonly elementType: C4ElementKind;
  readonly initial?: Partial<ElementFormData>;
  readonly onSubmit: (data: ElementFormData) => void;
  readonly onClose: () => void;
  readonly parentCandidates?: readonly ElementOption[];
}

export const AddElementDialog = React.memo(function AddElementDialog(
  props: Readonly<AddElementDialogProps>,
): React.ReactElement {
  const vanillaProps: AddElementDialogVanillaProps = {
    open: props.open,
    elementType: props.elementType,
    initial: props.initial,
    onSubmit: props.onSubmit,
    onClose: props.onClose,
    parentCandidates: props.parentCandidates,
    serviceOptions: props.elementType === 'container' ? SERVICE_CATALOG : undefined,
  };
  return <VanillaIsland mount={mountAddElementDialog} props={vanillaProps} />;
});

// ---------------------------------------------------------------------------
//  AddRelationshipDialog thin wrapper
// ---------------------------------------------------------------------------

interface AddRelationshipDialogProps {
  readonly open: boolean;
  readonly fromName: string;
  readonly onSubmit: (data: RelationshipFormData) => void;
  readonly onClose: () => void;
  readonly from: string;
  readonly candidates: readonly ElementOption[];
}

export const AddRelationshipDialog = React.memo(function AddRelationshipDialog(
  props: Readonly<AddRelationshipDialogProps>,
): React.ReactElement {
  const vanillaProps: AddRelationshipDialogVanillaProps = {
    open: props.open,
    from: props.from,
    fromName: props.fromName,
    candidates: props.candidates,
    onSubmit: props.onSubmit,
    onClose: props.onClose,
  };
  return <VanillaIsland mount={mountAddRelationshipDialog} props={vanillaProps} />;
});
