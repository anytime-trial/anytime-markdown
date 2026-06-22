import { VanillaIsland } from '../../shared/vanillaIsland';
import { mountC4PanelSkeleton } from '../../views/shared/c4PanelSkeleton';

const EMPTY_PROPS = {} as Record<string, never>;

function mountWrapper(container: HTMLElement, _props: Record<string, never>) {
  const { el } = mountC4PanelSkeleton(container);
  return {
    update() { /* static skeleton — no update needed */ },
    destroy() { el.remove(); },
  };
}

export function C4PanelSkeleton() {
  return <VanillaIsland mount={mountWrapper} props={EMPTY_PROPS} />;
}
