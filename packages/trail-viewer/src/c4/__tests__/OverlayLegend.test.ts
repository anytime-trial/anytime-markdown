import { mountOverlayLegend, type OverlayLegendVanillaProps } from '../../views/c4/overlays/overlayLegend';

function baseProps(overrides: Partial<OverlayLegendVanillaProps> = {}): OverlayLegendVanillaProps {
  return {
    overlay: 'defect-risk',
    isDark: false,
    t: (k: string) => k,
    textColor: '#222',
    bg: '#fff',
    dividerColor: '#ccc',
    ...overrides,
  };
}

describe('OverlayLegend / placement', () => {
  it('floats at bottom-right by default (floating variant)', () => {
    const container = document.createElement('div');
    const handle = mountOverlayLegend(container, baseProps());
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.position).toBe('absolute');
    expect(root.style.bottom).toBe('12px');
    expect(root.style.right).toBe('12px');
    handle.destroy();
  });

  it('flows inline (no absolute float) when inline=true so it stacks under the left panel', () => {
    const container = document.createElement('div');
    const handle = mountOverlayLegend(container, baseProps({ inline: true }));
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.position).not.toBe('absolute');
    expect(root.style.bottom).toBe('');
    expect(root.style.right).toBe('');
    // 列が伸び切らないよう高さ制限+スクロールを維持する
    expect(root.style.maxHeight).toBe('240px');
    expect(root.style.overflowY).toBe('auto');
    handle.destroy();
  });

  it('hides itself when there is nothing to show', () => {
    const container = document.createElement('div');
    const handle = mountOverlayLegend(container, baseProps({ overlay: 'none', inline: true }));
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.display).toBe('none');
    handle.destroy();
  });
});
