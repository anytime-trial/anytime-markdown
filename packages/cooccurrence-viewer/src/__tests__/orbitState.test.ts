import {
  cameraPose,
  createOrbitState,
  fitDistance,
  panOrbit,
  PHI_MAX,
  PHI_MIN,
  rotateOrbit,
  zoomOrbit,
} from '../scene3d/orbitState';

describe('orbitState', () => {
  test('rotate は theta を進め、phi を極の手前でクランプする', () => {
    const base = createOrbitState({ distance: 100 });
    const rotated = rotateOrbit(base, 0.5, 0.25);
    expect(rotated.theta).toBeCloseTo(base.theta + 0.5, 9);
    expect(rotated.phi).toBeCloseTo(base.phi + 0.25, 9);
    expect(rotateOrbit(base, 0, 100).phi).toBe(PHI_MAX);
    expect(rotateOrbit(base, 0, -100).phi).toBe(PHI_MIN);
  });

  test('zoom は distance を倍率で変え、範囲でクランプする', () => {
    const base = createOrbitState({ distance: 100, minDistance: 10, maxDistance: 1000 });
    expect(zoomOrbit(base, 1.5).distance).toBeCloseTo(150, 9);
    expect(zoomOrbit(base, 0.001).distance).toBe(10);
    expect(zoomOrbit(base, 1000).distance).toBe(1000);
  });

  test('pan は視線方向と直交する平面内で target を動かす', () => {
    const base = rotateOrbit(createOrbitState({ distance: 100 }), 0.7, 0.3);
    const panned = panOrbit(base, 12, -8);
    const pose = cameraPose(base);
    const viewX = base.targetX - pose.x;
    const viewY = base.targetY - pose.y;
    const viewZ = base.targetZ - pose.z;
    const dx = panned.targetX - base.targetX;
    const dy = panned.targetY - base.targetY;
    const dz = panned.targetZ - base.targetZ;
    expect(Math.hypot(dx, dy, dz)).toBeGreaterThan(0);
    const dot = dx * viewX + dy * viewY + dz * viewZ;
    expect(Math.abs(dot) / (Math.hypot(viewX, viewY, viewZ) * Math.hypot(dx, dy, dz))).toBeLessThan(1e-9);
  });

  test('cameraPose は target から distance だけ離れた位置を返す', () => {
    const state = rotateOrbit(createOrbitState({ distance: 250 }), 1.1, 0.4);
    const pose = cameraPose(state);
    const away = Math.hypot(pose.x - state.targetX, pose.y - state.targetY, pose.z - state.targetZ);
    expect(away).toBeCloseTo(250, 6);
  });

  test('phi = π/2, theta = 0 は +z 軸上（正面）から見る', () => {
    const state = { ...createOrbitState({ distance: 100 }), theta: 0, phi: Math.PI / 2 };
    const pose = cameraPose(state);
    expect(pose.x).toBeCloseTo(0, 6);
    expect(pose.y).toBeCloseTo(0, 6);
    expect(pose.z).toBeCloseTo(100, 6);
  });

  test('fitDistance は外接半径に単調で、fov が狭いほど遠くなる', () => {
    expect(fitDistance(200, 50)).toBeGreaterThan(fitDistance(100, 50));
    expect(fitDistance(100, 30)).toBeGreaterThan(fitDistance(100, 60));
    expect(fitDistance(0, 50)).toBeGreaterThan(0);
  });
});
