import { VanillaIsland } from '../../shared/vanillaIsland';
import { mountTabSkeleton, type TabSkeletonProps } from '../../views/shared/tabSkeleton';

function mountWrapper(container: HTMLElement, props: TabSkeletonProps) {
  const { el } = mountTabSkeleton(container, props);
  return {
    update(next: TabSkeletonProps) {
      // Height change: update root style in place
      const height = next.height ?? '70vh';
      el.style.height = typeof height === 'number' ? `${height}px` : height;
    },
    destroy() { el.remove(); },
  };
}

export function TabSkeleton({ height = '70vh' }: Readonly<{ height?: string | number }>) {
  const props: TabSkeletonProps = { height };
  return <VanillaIsland mount={mountWrapper} props={props} />;
}
