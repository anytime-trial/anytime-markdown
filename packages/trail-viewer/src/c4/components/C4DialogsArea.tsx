import type { C4Model } from '@anytime-markdown/trail-activity/c4';

import { AddElementDialog, AddRelationshipDialog } from './dialogs/C4EditDialogs';
import type { C4ElementKind, ElementFormData, RelationshipFormData } from './dialogs/C4EditDialogs';

export interface EditElementState {
  readonly id: string;
  readonly type: C4ElementKind;
  readonly name: string;
  readonly description: string;
  readonly external: boolean;
  readonly parentId?: string | null;
}

interface C4DialogsAreaProps {
  readonly c4Model: C4Model | null;
  readonly addElementType: C4ElementKind | null;
  readonly editElement: EditElementState | null;
  readonly addRelOpen: boolean;
  readonly selectedSystemId: string | null;
  readonly selectedElementId: string | null;
  readonly onCloseAddElement: () => void;
  readonly onCloseEditElement: () => void;
  readonly onCloseAddRelationship: () => void;
  readonly onSubmitAddElement: (data: ElementFormData) => void;
  readonly onSubmitUpdateElement: (data: ElementFormData) => void;
  readonly onSubmitAddRelationship: (data: RelationshipFormData) => void;
}

export function C4DialogsArea({
  c4Model,
  addElementType,
  editElement,
  addRelOpen,
  selectedSystemId,
  selectedElementId,
  onCloseAddElement,
  onCloseEditElement,
  onCloseAddRelationship,
  onSubmitAddElement,
  onSubmitUpdateElement,
  onSubmitAddRelationship,
}: Readonly<C4DialogsAreaProps>) {
  return (
    <>
      <AddElementDialog
        open={addElementType !== null && !editElement}
        elementType={addElementType ?? 'person'}
        initial={addElementType === 'container' && selectedSystemId ? { parentId: selectedSystemId } : undefined}
        onSubmit={onSubmitAddElement}
        onClose={onCloseAddElement}
        parentCandidates={
          addElementType === 'component'
            ? (c4Model?.elements.filter(e => e.type === 'container').map(e => ({ id: e.id, name: e.name })) ?? [])
            : undefined
        }
      />
      <AddElementDialog
        open={editElement !== null}
        elementType={editElement?.type ?? 'person'}
        initial={editElement ?? undefined}
        onSubmit={onSubmitUpdateElement}
        onClose={onCloseEditElement}
        parentCandidates={
          editElement?.type === 'container'
            ? (c4Model?.elements.filter(e => e.type === 'system').map(e => ({ id: e.id, name: e.name })) ?? [])
            : editElement?.type === 'component'
            ? (c4Model?.elements.filter(e => e.type === 'container').map(e => ({ id: e.id, name: e.name })) ?? [])
            : undefined
        }
      />
      {selectedElementId && (
        <AddRelationshipDialog
          open={addRelOpen}
          from={selectedElementId}
          fromName={c4Model?.elements.find(e => e.id === selectedElementId)?.name ?? selectedElementId}
          candidates={c4Model?.elements.filter(e => e.id !== selectedElementId && (e.type === 'person' || e.type === 'system' || e.type === 'container')).map(e => ({ id: e.id, name: e.name })) ?? []}
          onSubmit={onSubmitAddRelationship}
          onClose={onCloseAddRelationship}
        />
      )}
    </>
  );
}
