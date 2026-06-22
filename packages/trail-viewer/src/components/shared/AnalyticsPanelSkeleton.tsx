import { VanillaIsland } from '../../shared/vanillaIsland';
import { mountAnalyticsPanelSkeleton } from '../../views/shared/analyticsPanelSkeleton';

const EMPTY_PROPS = {} as Record<string, never>;

function mountWrapper(container: HTMLElement, _props: Record<string, never>) {
  const { el } = mountAnalyticsPanelSkeleton(container);
  return {
    update() { /* static skeleton — no update needed */ },
    destroy() { el.remove(); },
  };
}

export function AnalyticsPanelSkeleton() {
  return <VanillaIsland mount={mountWrapper} props={EMPTY_PROPS} />;
}
