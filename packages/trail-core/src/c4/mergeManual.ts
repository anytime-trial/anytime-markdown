import type { C4Model, C4Element, C4Relationship } from './types';
import type { ManualElement, ManualRelationship } from './manualTypes';

export function mergeManualIntoC4Model(
  base: C4Model,
  manualElements: readonly ManualElement[],
  manualRelationships: readonly ManualRelationship[],
): C4Model {
  const baseIds = new Set(base.elements.map(e => e.id));
  const manualIds = new Set(manualElements.map(e => e.id));

  const liveManualElements = manualElements.filter(e =>
    e.parentId === null || baseIds.has(e.parentId) || manualIds.has(e.parentId)
  );

  const addedElements: C4Element[] = liveManualElements.map(e => ({
    id: e.id,
    type: e.type,
    name: e.name,
    ...(e.description ? { description: e.description } : {}),
    ...(e.external ? { external: true } : {}),
    ...(e.parentId ? { boundaryId: e.parentId } : {}),
    ...(e.serviceType ? { serviceType: e.serviceType } : {}),
    manual: true,
  }));

  const elements: readonly C4Element[] = [...base.elements, ...addedElements];

  const liveElementIds = new Set(elements.map(e => e.id));
  const liveManualRels = manualRelationships.filter(r =>
    liveElementIds.has(r.fromId) && liveElementIds.has(r.toId)
  );

  const addedRels: C4Relationship[] = liveManualRels.map(r => ({
    from: r.fromId,
    to: r.toId,
    ...(r.label ? { label: r.label } : {}),
    ...(r.technology ? { technology: r.technology } : {}),
    manual: true,
  }));

  return {
    ...base,
    elements,
    relationships: [...base.relationships, ...addedRels],
  };
}
