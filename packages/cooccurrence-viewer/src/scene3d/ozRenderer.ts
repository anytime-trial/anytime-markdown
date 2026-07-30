import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  MeshPhongMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { ThemeMode } from '../types';
import type { OzSceneLabel, OzSceneLink, OzSceneModel } from './sceneModel';
import {
  cameraPose,
  createOrbitState,
  fitDistance,
  panOrbit,
  rotateOrbit,
  zoomOrbit,
  type OrbitState,
} from './orbitState';

/**
 * OZ 3D の three.js アダプタ。
 *
 * 判断（z 配置・淡色化・円錐・ラベル選抜）は sceneModel が済ませており、ここは
 * その座標と色を three のオブジェクトへ写すだけの層。WebGL は jsdom で再現できない
 * ため、この層はユニットテストの対象外とし、実機（Playwright）で検証する（要件書 §5）。
 */

export interface OzRendererOptions {
  container: HTMLElement;
  themeMode: ThemeMode;
  onHover(index: number | null, client: { x: number; y: number }): void;
  onSelect(index: number | null): void;
}

export interface OzRenderer {
  setModel(model: OzSceneModel): void;
  setThemeMode(mode: ThemeMode): void;
  fitView(): void;
  exportPng(): Promise<Blob | null>;
  dispose(): void;
}

const FOV_DEG = 50;
const SPHERE_SEGMENTS = 24;
/** クリックとドラッグを分ける移動量（ピクセル）。 */
const CLICK_SLOP_PX = 4;
const ROTATE_SPEED = 0.005;
const ZOOM_WHEEL_SPEED = 0.001;

interface OzThemePalette {
  background: Color;
  /** 淡色化（alpha < 1）の lerp 先。フォグと同じ色にして空間へ溶かす。 */
  fade: Color;
  ringColor: Color;
  labelColor: string;
  linkBase: Color;
  emissive: Color;
}

function paletteOf(mode: ThemeMode): OzThemePalette {
  if (mode === 'dark') {
    return {
      background: new Color('#0A0F2E'),
      fade: new Color('#0A0F2E'),
      ringColor: new Color('#2A3568'),
      labelColor: 'rgba(255,255,255,0.92)',
      linkBase: new Color('#A0BEFF'),
      emissive: new Color('#1B2354'),
    };
  }
  return {
    background: new Color('#FFFFFF'),
    fade: new Color('#FFFFFF'),
    ringColor: new Color('#D9EEFB'),
    labelColor: '#1B2A4A',
    linkBase: new Color('#5B7C99'),
    emissive: new Color('#000000'),
  };
}

/** 強度（2D の線幅 1..n）を線色の濃さへ写す。WebGL は線幅を変えられない（要件書 §2.2）。 */
function linkStrengthAlpha(width: number): number {
  return Math.min(0.2 + width * 0.12, 0.65);
}

function lineGeometry(links: readonly OzSceneLink[], base: Color, fade: Color): BufferGeometry {
  const positions = new Float32Array(links.length * 6);
  const colors = new Float32Array(links.length * 6);
  const color = new Color();
  links.forEach((link, i) => {
    positions.set([link.x1, link.y1, link.z1, link.x2, link.y2, link.z2], i * 6);
    color.copy(fade).lerp(base, linkStrengthAlpha(link.width) * link.alpha);
    colors.set([color.r, color.g, color.b, color.r, color.g, color.b], i * 6);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function makeLabelTexture(text: string, colorCss: string): { texture: CanvasTexture; aspect: number } | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = '600 28px system-ui, sans-serif';
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + 16;
  canvas.width = width;
  canvas.height = 40;
  const ctx2 = canvas.getContext('2d');
  if (!ctx2) return null;
  ctx2.font = font;
  ctx2.textBaseline = 'middle';
  ctx2.textAlign = 'center';
  ctx2.fillStyle = colorCss;
  ctx2.fillText(text, width / 2, 20);
  const texture = new CanvasTexture(canvas);
  return { texture, aspect: width / 40 };
}

export function createOzRenderer(options: OzRendererOptions): OzRenderer {
  const { container, onHover, onSelect } = options;
  let mode = options.themeMode;
  let palette = paletteOf(mode);

  // WebGL コンテキストを作れない環境はここで throw し、呼び出し側が 2D へ縮退する（要件書 §2.1）。
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV_DEG, 1, 1, 50000);
  let orbit: OrbitState = createOrbitState({ distance: 1200, minDistance: 40, maxDistance: 20000 });

  const hemisphere = new HemisphereLight(0xffffff, 0xd8e6f0, 1.0);
  const sun = new DirectionalLight(0xffffff, 1.2);
  sun.position.set(0.6, 1, 0.8);
  scene.add(hemisphere, sun);

  const sphereGeometry = new SphereGeometry(1, SPHERE_SEGMENTS, SPHERE_SEGMENTS / 2 | 0);
  const sphereMaterial = new MeshPhongMaterial({ shininess: 90, specular: new Color('#FFFFFF') });
  const coneGeometry = new ConeGeometry(0.5, 1, 12);
  const coneMaterial = new MeshPhongMaterial({ shininess: 30 });

  /** setModel のたびに作り直すオブジェクト群。dispose 漏れを防ぐためひとまとめに追跡する。 */
  let dynamicObjects: Object3D[] = [];
  let dynamicDisposables: Array<{ dispose(): void }> = [];
  let spheres: InstancedMesh | null = null;
  /** InstancedMesh の instanceId → 語 index（レイキャストの復元用）。 */
  let sphereNodeIndexes: number[] = [];
  let model: OzSceneModel | null = null;
  let disposed = false;

  function clearDynamic(): void {
    for (const object of dynamicObjects) scene.remove(object);
    for (const disposable of dynamicDisposables) disposable.dispose();
    dynamicObjects = [];
    dynamicDisposables = [];
    spheres = null;
    sphereNodeIndexes = [];
  }

  function track<T extends Object3D>(object: T, ...disposables: Array<{ dispose(): void }>): T {
    scene.add(object);
    dynamicObjects.push(object);
    dynamicDisposables.push(...disposables);
    return object;
  }

  function buildSpheres(current: OzSceneModel): void {
    if (current.nodes.length === 0) return;
    const mesh = new InstancedMesh(sphereGeometry, sphereMaterial, current.nodes.length);
    const matrix = new Matrix4();
    const color = new Color();
    current.nodes.forEach((node, i) => {
      matrix.makeScale(node.radius, node.radius, node.radius);
      matrix.setPosition(node.x, node.y, node.z);
      mesh.setMatrixAt(i, matrix);
      color.set(node.color);
      if (node.alpha < 1) color.lerp(palette.fade, 1 - node.alpha);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    sphereNodeIndexes = current.nodes.map((node) => node.index);
    spheres = track(mesh, mesh);
  }

  function buildCones(current: OzSceneModel): void {
    if (current.cones.length === 0) return;
    const mesh = new InstancedMesh(coneGeometry, coneMaterial, current.cones.length);
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const direction = new Vector3();
    const color = new Color();
    current.cones.forEach((cone, i) => {
      direction.set(cone.dirX, cone.dirY, cone.dirZ);
      quaternion.setFromUnitVectors(up, direction);
      matrix.makeRotationFromQuaternion(quaternion);
      matrix.scale(new Vector3(cone.size, cone.size, cone.size));
      matrix.setPosition(cone.x, cone.y, cone.z);
      mesh.setMatrixAt(i, matrix);
      color.copy(palette.linkBase);
      if (cone.alpha < 1) color.lerp(palette.fade, 1 - cone.alpha);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    track(mesh, mesh);
  }

  function buildLinks(current: OzSceneModel): void {
    if (current.links.length > 0) {
      const geometry = lineGeometry(current.links, palette.linkBase, palette.fade);
      const material = new LineBasicMaterial({ vertexColors: true });
      track(new LineSegments(geometry, material), geometry, material);
    }
    if (current.timeLinks.length > 0) {
      const geometry = lineGeometry(current.timeLinks, palette.linkBase, palette.fade);
      const material = new LineDashedMaterial({ vertexColors: true, dashSize: 8, gapSize: 8 });
      const lines = new LineSegments(geometry, material);
      lines.computeLineDistances();
      track(lines, geometry, material);
    }
  }

  function buildLabels(labels: readonly OzSceneLabel[], scale: number): void {
    for (const label of labels) {
      const made = makeLabelTexture(label.text, palette.labelColor);
      if (made === null) continue;
      const material = new SpriteMaterial({ map: made.texture, depthTest: false });
      const sprite = new Sprite(material);
      sprite.position.set(label.x, label.y, label.z);
      sprite.scale.set(scale * made.aspect, scale, 1);
      track(sprite, made.texture, material);
    }
  }

  /** OZ の白空間の記号: コンテンツの下に淡い同心円の床を敷く（要件書 §2.2）。 */
  function buildRings(current: OzSceneModel): void {
    const bounds = modelBounds(current);
    if (bounds === null) return;
    const floorY = bounds.minY - 120;
    const maxRadius = Math.max(bounds.radius * 1.4, 300);
    for (const ratio of [0.25, 0.45, 0.7, 1]) {
      const radius = maxRadius * ratio;
      const points = new Float32Array(129 * 3);
      for (let i = 0; i <= 128; i += 1) {
        const angle = (i / 128) * Math.PI * 2;
        points.set([bounds.centerX + Math.cos(angle) * radius, floorY, bounds.centerZ + Math.sin(angle) * radius], i * 3);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(points, 3));
      const material = new LineBasicMaterial({ color: palette.ringColor });
      track(new LineLoop(geometry, material), geometry, material);
    }
  }

  function modelBounds(current: OzSceneModel): { centerX: number; centerY: number; centerZ: number; minY: number; radius: number } | null {
    if (current.nodes.length === 0) return null;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const node of current.nodes) {
      minX = Math.min(minX, node.x - node.radius);
      minY = Math.min(minY, node.y - node.radius);
      minZ = Math.min(minZ, node.z - node.radius);
      maxX = Math.max(maxX, node.x + node.radius);
      maxY = Math.max(maxY, node.y + node.radius);
      maxZ = Math.max(maxZ, node.z + node.radius);
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2;
    return { centerX, centerY, centerZ, minY, radius };
  }

  function applyTheme(): void {
    palette = paletteOf(mode);
    scene.background = palette.background;
    scene.fog = new Fog(palette.background, orbit.distance * 1.2, orbit.distance * 4 + 4000);
    sphereMaterial.emissive = palette.emissive;
    hemisphere.intensity = mode === 'dark' ? 0.7 : 1.0;
    sun.intensity = mode === 'dark' ? 0.9 : 1.2;
  }

  function rebuild(): void {
    clearDynamic();
    if (model === null) return;
    buildSpheres(model);
    buildLinks(model);
    buildCones(model);
    buildLabels(model.labels, 26);
    buildLabels(model.layerLabels, 44);
    buildRings(model);
  }

  // ---- 要求時レンダリング（既存 renderScheduler と同じ原則。無操作で GPU を回さない） ----
  let renderRequested = false;
  function invalidate(): void {
    if (renderRequested || disposed) return;
    renderRequested = true;
    requestAnimationFrame(() => {
      renderRequested = false;
      if (disposed) return;
      syncSize();
      const pose = cameraPose(orbit);
      camera.position.set(pose.x, pose.y, pose.z);
      camera.lookAt(pose.targetX, pose.targetY, pose.targetZ);
      scene.fog = new Fog(palette.background, orbit.distance * 1.2, orbit.distance * 4 + 4000);
      renderer.render(scene, camera);
    });
  }

  function syncSize(): void {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const size = new Vector2();
    renderer.getSize(size);
    if (size.width !== width || size.height !== height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => invalidate());
  resizeObserver?.observe(container);

  // ---- ポインタ操作（回転・パン・ズーム・クリック選択・ホバー） ----
  const raycaster = new Raycaster();
  let pointerDown: { x: number; y: number; button: number; shift: boolean } | null = null;
  let dragging = false;

  function hitNodeIndex(event: PointerEvent): number | null {
    if (spheres === null) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(spheres, false);
    const instanceId = hits[0]?.instanceId;
    if (instanceId === undefined) return null;
    return sphereNodeIndexes[instanceId] ?? null;
  }

  /** 1 ピクセルのパンが動かす世界座標量（現在の距離での視野の実寸から換算）。 */
  function worldPerPixel(): number {
    const height = Math.max(container.clientHeight, 1);
    return (2 * orbit.distance * Math.tan((FOV_DEG * Math.PI) / 360)) / height;
  }

  function handlePointerDown(event: PointerEvent): void {
    pointerDown = { x: event.clientX, y: event.clientY, button: event.button, shift: event.shiftKey };
    dragging = false;
    renderer.domElement.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (pointerDown === null) {
      onHover(hitNodeIndex(event), { x: event.clientX, y: event.clientY });
      return;
    }
    const dx = event.clientX - pointerDown.x;
    const dy = event.clientY - pointerDown.y;
    if (!dragging && Math.hypot(dx, dy) <= CLICK_SLOP_PX) return;
    dragging = true;
    if (pointerDown.button === 2 || pointerDown.shift) {
      const scale = worldPerPixel();
      orbit = panOrbit(orbit, -dx * scale, dy * scale);
    } else {
      orbit = rotateOrbit(orbit, -dx * ROTATE_SPEED, -dy * ROTATE_SPEED);
    }
    pointerDown = { ...pointerDown, x: event.clientX, y: event.clientY };
    invalidate();
  }

  function handlePointerUp(event: PointerEvent): void {
    const wasDragging = dragging;
    pointerDown = null;
    dragging = false;
    if (!wasDragging && event.button === 0) onSelect(hitNodeIndex(event));
  }

  function handleWheel(event: WheelEvent): void {
    event.preventDefault();
    orbit = zoomOrbit(orbit, Math.exp(event.deltaY * ZOOM_WHEEL_SPEED));
    invalidate();
  }

  function handleContextMenu(event: Event): void {
    // 右ドラッグをパンに使うため、ブラウザのコンテキストメニューを抑止する。
    event.preventDefault();
  }

  renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerup', handlePointerUp);
  renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
  renderer.domElement.addEventListener('contextmenu', handleContextMenu);

  applyTheme();

  return {
    setModel(next: OzSceneModel): void {
      const first = model === null;
      model = next;
      rebuild();
      if (first) this.fitView();
      invalidate();
    },
    setThemeMode(nextMode: ThemeMode): void {
      mode = nextMode;
      applyTheme();
      // 球の淡色化・ラベル色・リング色はパレット依存のため作り直す。
      rebuild();
      invalidate();
    },
    fitView(): void {
      const bounds = model === null ? null : modelBounds(model);
      if (bounds === null) return;
      orbit = {
        ...orbit,
        targetX: bounds.centerX,
        targetY: bounds.centerY,
        targetZ: bounds.centerZ,
        distance: Math.min(Math.max(fitDistance(bounds.radius, FOV_DEG), orbit.minDistance), orbit.maxDistance),
      };
      invalidate();
    },
    exportPng(): Promise<Blob | null> {
      // WebGL の drawing buffer は合成後に破棄されるため、描画直後に取り出す（要件書 pre-mortem）。
      syncSize();
      const pose = cameraPose(orbit);
      camera.position.set(pose.x, pose.y, pose.z);
      camera.lookAt(pose.targetX, pose.targetY, pose.targetZ);
      renderer.render(scene, camera);
      return new Promise((resolve) => renderer.domElement.toBlob((blob: Blob | null) => resolve(blob), 'image/png'));
    },
    dispose(): void {
      disposed = true;
      resizeObserver?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu);
      clearDynamic();
      sphereGeometry.dispose();
      sphereMaterial.dispose();
      coneGeometry.dispose();
      coneMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
