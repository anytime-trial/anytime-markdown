import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
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
import type { OzSceneHeading, OzSceneLabel, OzSceneLink, OzSceneModel, OzSceneNode } from './sceneModel';
import {
  cameraPose,
  createOrbitState,
  fitDistance,
  panOrbit,
  rotateOrbit,
  zoomOrbit,
  type OrbitState,
} from './orbitState';
import { linkColorOf, makeStreamMaterial, type LinkColorPalette } from './streamShader';

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
  /** 流れアニメーションの有効/無効。無効・タブ非表示中は rAF を止める（要件書 §5 v2）。 */
  setAnimating(on: boolean): void;
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
/** 曲線 1 本の折れ線分割数。 */
const CURVE_SEGMENTS = 12;
/** ピルテクスチャの解像度倍率（等倍だとズーム時に文字が粗れる）。 */
const PILL_TEXTURE_SCALE = 2;
/** 淡色化したピルの不透明度はモデルの alpha をそのまま使う。ドットは色 lerp（v1 と同じ）。 */

export interface OzThemePalette {
  background: Color;
  /** 淡色化（alpha < 1）の lerp 先。フォグと同じ色にして空間へ溶かす。 */
  fade: Color;
  /** 背景平面の同心円模様の色。 */
  ringColor: Color;
  labelColor: string;
  /** 強度が最小の線の色。背景に対する下限コントラストを決める（{@link linkColorOf}）。 */
  linkFloor: Color;
  /** 強度が最大の線の色。 */
  linkBase: Color;
  pillBg: string;
  pillText: string;
  /** 巨大なパステル塗り円（参考画像の円形空間。要件書 §2.2 v2）。 */
  circles: Array<{ color: Color; opacity: number }>;
  /** 細い輪郭リング。 */
  outlines: Array<{ color: Color; opacity: number }>;
}

export function paletteOf(mode: ThemeMode): OzThemePalette {
  if (mode === 'dark') {
    return {
      background: new Color('#0A0F2E'),
      fade: new Color('#0A0F2E'),
      ringColor: new Color('#2A3568'),
      labelColor: 'rgba(255,255,255,0.92)',
      // Why not ライトのように背景と別の下限色を置くか: 夜の OZ は linkBase が背景から十分
      // 遠く、背景を起点にしても最弱リンクが 3.91:1 に届く。別の下限色を置くと最弱が 5.89:1
      // まで持ち上がり、線の強度差が読み取りにくくなる。
      linkFloor: new Color('#0A0F2E'),
      linkBase: new Color('#A0BEFF'),
      pillBg: '#12183F',
      pillText: 'rgba(255,255,255,0.92)',
      circles: [
        { color: new Color('#31408F'), opacity: 0.16 },
        { color: new Color('#1E5F58'), opacity: 0.12 },
        { color: new Color('#7A2B52'), opacity: 0.1 },
      ],
      outlines: [
        { color: new Color('#FF6B9C'), opacity: 0.3 },
        { color: new Color('#4FC3F7'), opacity: 0.24 },
      ],
    };
  }
  return {
    background: new Color('#F4F5FB'),
    fade: new Color('#F4F5FB'),
    ringColor: new Color('#DDE3F2'),
    labelColor: '#1B2A4A',
    // 下限色は背景 #F4F5FB に対し 3.53:1。白へ溶かす旧方式では最大でも 2.84:1 までしか
    // 届かず、白の OZ では弱い共起がほぼ消えていた。
    linkFloor: new Color('#7A8296'),
    linkBase: new Color('#4A5468'),
    pillBg: '#FFFFFF',
    pillText: '#1B2A4A',
    circles: [
      { color: new Color('#F8BBD0'), opacity: 0.12 },
      { color: new Color('#B2DFDB'), opacity: 0.1 },
      { color: new Color('#B3E5FC'), opacity: 0.08 },
    ],
    outlines: [
      { color: new Color('#EF9A9A'), opacity: 0.35 },
      { color: new Color('#F48FB1'), opacity: 0.28 },
    ],
  };
}

function lineGeometry(links: readonly OzSceneLink[], palette: LinkColorPalette): BufferGeometry {
  const positions = new Float32Array(links.length * 6);
  const colors = new Float32Array(links.length * 6);
  const color = new Color();
  links.forEach((link, i) => {
    positions.set([link.x1, link.y1, link.z1, link.x2, link.y2, link.z2], i * 6);
    linkColorOf(color, palette, link);
    colors.set([color.r, color.g, color.b, color.r, color.g, color.b], i * 6);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

/** 二次ベジェ上の点（t は 0..1）。 */
function bezierPoint(link: OzSceneLink, t: number): [number, number, number] {
  const u = 1 - t;
  return [
    u * u * link.x1 + 2 * u * t * link.cpX + t * t * link.x2,
    u * u * link.y1 + 2 * u * t * link.cpY + t * t * link.y2,
    u * u * link.z1 + 2 * u * t * link.cpZ + t * t * link.z2,
  ];
}

/**
 * 曲線を折れ線へ展開し、流れシェーダ用の属性（色・線上距離・流す向き）を付ける。
 * 属性名は three が vertexColors で予約する `color` と衝突しないよう streamColor にする。
 */
function streamGeometry(links: readonly OzSceneLink[], palette: LinkColorPalette): BufferGeometry {
  const vertsPerLink = CURVE_SEGMENTS * 2;
  const positions = new Float32Array(links.length * vertsPerLink * 3);
  const colors = new Float32Array(links.length * vertsPerLink * 3);
  const dists = new Float32Array(links.length * vertsPerLink);
  const flows = new Float32Array(links.length * vertsPerLink);
  const color = new Color();
  links.forEach((link, i) => {
    linkColorOf(color, palette, link);
    let dist = 0;
    let prev = bezierPoint(link, 0);
    for (let s = 0; s < CURVE_SEGMENTS; s += 1) {
      const next = bezierPoint(link, (s + 1) / CURVE_SEGMENTS);
      const v = i * vertsPerLink + s * 2;
      positions.set([...prev, ...next], v * 3);
      colors.set([color.r, color.g, color.b, color.r, color.g, color.b], v * 3);
      const segment = Math.hypot(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]);
      dists[v] = dist;
      dists[v + 1] = dist + segment;
      flows[v] = link.flow;
      flows[v + 1] = link.flow;
      dist += segment;
      prev = next;
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('streamColor', new BufferAttribute(colors, 3));
  geometry.setAttribute('lineDist', new BufferAttribute(dists, 1));
  geometry.setAttribute('flowDir', new BufferAttribute(flows, 1));
  return geometry;
}

/** roundRect 相当（arcTo 実装。実行環境差で Path2D.roundRect に依存しない）。 */
function tracePill(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  const r = height / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * ピル型ラベルのテクスチャ（参考画像のノード表現。要件書 §2.2 v2）。
 * 白地の角丸 + クラスタ色の縁・左ドット + 語テキスト + 淡い影。
 */
function makePillTexture(
  text: string,
  accent: string,
  palette: OzThemePalette,
): { texture: CanvasTexture; aspect: number } | null {
  const canvas = document.createElement('canvas');
  const probe = canvas.getContext('2d');
  if (!probe) return null;
  const scale = PILL_TEXTURE_SCALE;
  const font = `600 ${13 * scale}px system-ui, sans-serif`;
  probe.font = font;
  const textWidth = Math.ceil(probe.measureText(text).width);
  const height = 26 * scale;
  const dotRadius = 3.5 * scale;
  const padX = 10 * scale;
  const gap = 6 * scale;
  const margin = 4 * scale;
  const width = padX + dotRadius * 2 + gap + textWidth + padX;
  canvas.width = width + margin * 2;
  canvas.height = height + margin * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.save();
  ctx.shadowColor = 'rgba(27,42,74,0.2)';
  ctx.shadowBlur = 3 * scale;
  ctx.shadowOffsetY = scale;
  tracePill(ctx, margin, margin, width, height);
  ctx.fillStyle = palette.pillBg;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.5 * scale;
  ctx.strokeStyle = accent;
  tracePill(ctx, margin + ctx.lineWidth / 2, margin + ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(margin + padX + dotRadius, margin + height / 2, dotRadius, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.pillText;
  ctx.fillText(text, margin + padX + dotRadius * 2 + gap, margin + height / 2);
  const texture = new CanvasTexture(canvas);
  return { texture, aspect: canvas.width / canvas.height };
}

/** ピルの世界座標での高さ。頻度（radius）に追従しつつ読める下限を持つ。 */
function pillWorldHeight(radius: number): number {
  return Math.max(18, radius * 2.2);
}

/** クラスタ見出しのテクスチャ。大きく描いてスプライト拡大時のぼやけを避ける（字間は空間の記号）。 */
function makeHeadingTexture(text: string, colorCss: string): { texture: CanvasTexture; aspect: number } | null {
  const canvas = document.createElement('canvas');
  const probe = canvas.getContext('2d');
  if (!probe) return null;
  const font = '700 72px system-ui, sans-serif';
  probe.font = font;
  const width = Math.ceil(probe.measureText(text).width) + 32;
  canvas.width = width;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = colorCss;
  ctx.fillText(text, width / 2, 48);
  const texture = new CanvasTexture(canvas);
  return { texture, aspect: width / 96 };
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
  // canvas の表示サイズは注入 CSS（.cooc-viewer__oz canvas）が 100% に固定する。
  // setSize(…, updateStyle: false) は CSS サイズを書かず、無指定だと表示サイズが
  // 属性サイズ（クライアント幅 × devicePixelRatio）になり、dpr > 1 で canvas が
  // コンテナからはみ出して右パネルを覆う（ポインタ→NDC 変換も同じ rect を使うためずれる）。
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV_DEG, 1, 1, 50000);
  let orbit: OrbitState = createOrbitState({ distance: 1200, minDistance: 40, maxDistance: 20000 });

  const hemisphere = new HemisphereLight(0xffffff, 0xd8e6f0, 1.0);
  const sun = new DirectionalLight(0xffffff, 1.2);
  sun.position.set(0.6, 1, 0.8);
  scene.add(hemisphere, sun);

  // ドット（ピル上限から漏れた語）はフラットな色点として描く（参考画像の点表現）。
  const dotGeometry = new SphereGeometry(1, SPHERE_SEGMENTS, SPHERE_SEGMENTS / 2 | 0);
  const dotMaterial = new MeshBasicMaterial();
  const coneGeometry = new ConeGeometry(0.5, 1, 12);
  const coneMaterial = new MeshPhongMaterial({ shininess: 30 });
  const streamMaterial = makeStreamMaterial(palette.fade);

  /**
   * ピルテクスチャのキャッシュ。key = テーマ|クラスタ色|語。setModel のたびに全生成すると
   * 選択変更のような部分更新でも数百枚の canvas を焼き直すことになる（要件書 pre-mortem）。
   */
  const pillTextures = new Map<string, { texture: CanvasTexture; aspect: number }>();
  let usedPillKeys = new Set<string>();

  function pillTextureOf(label: string, accent: string): { texture: CanvasTexture; aspect: number } | null {
    const key = `${mode}|${accent}|${label}`;
    let entry = pillTextures.get(key);
    if (entry === undefined) {
      const made = makePillTexture(label, accent, palette);
      if (made === null) return null;
      pillTextures.set(key, made);
      entry = made;
    }
    usedPillKeys.add(key);
    return entry;
  }

  function prunePillTextures(): void {
    for (const [key, entry] of pillTextures) {
      if (usedPillKeys.has(key)) continue;
      entry.texture.dispose();
      pillTextures.delete(key);
    }
  }

  /** setModel のたびに作り直すオブジェクト群。dispose 漏れを防ぐためひとまとめに追跡する。 */
  let dynamicObjects: Object3D[] = [];
  let dynamicDisposables: Array<{ dispose(): void }> = [];
  let dots: InstancedMesh | null = null;
  /** InstancedMesh の instanceId → 語 index（レイキャストの復元用）。 */
  let dotNodeIndexes: number[] = [];
  /** ピルスプライト（userData.nodeIndex を持つ。レイキャスト対象）。 */
  let pillSprites: Sprite[] = [];
  let model: OzSceneModel | null = null;
  let disposed = false;

  function clearDynamic(): void {
    for (const object of dynamicObjects) scene.remove(object);
    for (const disposable of dynamicDisposables) disposable.dispose();
    dynamicObjects = [];
    dynamicDisposables = [];
    dots = null;
    dotNodeIndexes = [];
    pillSprites = [];
  }

  function track<T extends Object3D>(object: T, ...disposables: Array<{ dispose(): void }>): T {
    scene.add(object);
    dynamicObjects.push(object);
    dynamicDisposables.push(...disposables);
    return object;
  }

  function buildNodes(current: OzSceneModel): void {
    const pills: OzSceneNode[] = [];
    const dotNodes: OzSceneNode[] = [];
    for (const node of current.nodes) (node.pill ? pills : dotNodes).push(node);

    for (const node of pills) {
      const made = pillTextureOf(node.label, node.color);
      if (made === null) continue;
      // テクスチャはキャッシュ共有のため dispose しない。マテリアルはスプライト個別（不透明度が異なる）。
      const material = new SpriteMaterial({ map: made.texture, transparent: true, opacity: node.alpha });
      const sprite = new Sprite(material);
      const height = pillWorldHeight(node.radius);
      sprite.position.set(node.x, node.y, node.z);
      sprite.scale.set(height * made.aspect, height, 1);
      sprite.userData.nodeIndex = node.index;
      pillSprites.push(track(sprite, material));
    }

    if (dotNodes.length > 0) {
      const mesh = new InstancedMesh(dotGeometry, dotMaterial, dotNodes.length);
      const matrix = new Matrix4();
      const color = new Color();
      dotNodes.forEach((node, i) => {
        const radius = Math.max(2.5, node.radius * 0.5);
        matrix.makeScale(radius, radius, radius);
        matrix.setPosition(node.x, node.y, node.z);
        mesh.setMatrixAt(i, matrix);
        color.set(node.color);
        if (node.alpha < 1) color.lerp(palette.fade, 1 - node.alpha);
        mesh.setColorAt(i, color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      dotNodeIndexes = dotNodes.map((node) => node.index);
      dots = track(mesh, mesh);
    }
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

  function buildStreams(current: OzSceneModel): void {
    if (current.links.length > 0) {
      const geometry = streamGeometry(current.links, palette);
      // streamMaterial は使い回す（uniform の uTime を共有するため）。dispose はしない。
      track(new LineSegments(geometry, streamMaterial), geometry);
    }
    if (current.timeLinks.length > 0) {
      const geometry = lineGeometry(current.timeLinks, palette);
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

  /** クラスタ見出し（参考画像の「TOOLS / OUTPUT」。要件書 §2.2 v2）。 */
  function buildHeadings(headings: readonly OzSceneHeading[]): void {
    for (const heading of headings) {
      const made = makeHeadingTexture(heading.text, heading.color);
      if (made === null) continue;
      const material = new SpriteMaterial({ map: made.texture, transparent: true, opacity: 0.85, depthWrite: false });
      const sprite = new Sprite(material);
      sprite.position.set(heading.x, heading.y, heading.z);
      sprite.scale.set(84 * made.aspect, 84, 1);
      sprite.renderOrder = -1;
      track(sprite, made.texture, material);
    }
  }

  /** 円周の折れ線ジオメトリ（LineLoop 用）。 */
  function circleOutlineGeometry(radius: number): BufferGeometry {
    const points = new Float32Array(129 * 3);
    for (let i = 0; i <= 128; i += 1) {
      const angle = (i / 128) * Math.PI * 2;
      points.set([Math.cos(angle) * radius, Math.sin(angle) * radius, 0], i * 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(points, 3));
    return geometry;
  }

  /**
   * 無限に広がる巨大な円形の仮想空間（要件書 §2.2 v2）。
   * 巨大なパステル塗り円・輪郭リング・同心円模様をシーン境界から決定的に配置する
   * （乱数を使うと setModel のたびに空間が変わる）。
   */
  function buildBackdrop(current: OzSceneModel): void {
    const bounds = modelBounds(current);
    if (bounds === null) return;
    const radius = Math.max(bounds.radius, 300);

    // 巨大なパステル塗り円。角度・距離・傾きは見え方を散らすための固定テーブル。
    const placements = [
      { angle: 0.4, distance: 1.6, zFactor: -1.2, scale: 2.4, tiltX: 0.35, tiltY: 0.1 },
      { angle: 2.4, distance: 1.9, zFactor: -1.5, scale: 1.8, tiltX: -0.2, tiltY: 0.25 },
      { angle: 4.4, distance: 2.2, zFactor: -1.8, scale: 2.9, tiltX: 0.15, tiltY: -0.3 },
    ];
    placements.forEach((placement, i) => {
      const style = palette.circles[i % palette.circles.length];
      const material = new MeshBasicMaterial({
        color: style.color,
        transparent: true,
        opacity: style.opacity,
        side: DoubleSide,
        depthWrite: false,
      });
      const mesh = new Mesh(new CircleGeometry(1, 72), material);
      mesh.position.set(
        bounds.centerX + Math.cos(placement.angle) * radius * placement.distance,
        bounds.centerY + Math.sin(placement.angle) * radius * placement.distance,
        bounds.centerZ + radius * placement.zFactor,
      );
      mesh.scale.setScalar(radius * placement.scale);
      mesh.rotation.set(placement.tiltX, placement.tiltY, 0);
      mesh.renderOrder = -3;
      track(mesh, mesh.geometry, material);
    });

    // 細い輪郭リング。
    const outlinePlacements = [
      { angle: 1.4, distance: 1.2, zFactor: -0.9, scale: 2.0, tiltX: 0.3, tiltY: -0.15 },
      { angle: 5.2, distance: 1.5, zFactor: -1.1, scale: 2.6, tiltX: -0.25, tiltY: 0.2 },
    ];
    outlinePlacements.forEach((placement, i) => {
      const style = palette.outlines[i % palette.outlines.length];
      const geometry = circleOutlineGeometry(1);
      const material = new LineBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity });
      const loop = new LineLoop(geometry, material);
      loop.position.set(
        bounds.centerX + Math.cos(placement.angle) * radius * placement.distance,
        bounds.centerY + Math.sin(placement.angle) * radius * placement.distance,
        bounds.centerZ + radius * placement.zFactor,
      );
      loop.scale.setScalar(radius * placement.scale);
      loop.rotation.set(placement.tiltX, placement.tiltY, 0);
      loop.renderOrder = -2;
      track(loop, geometry, material);
    });

    // 背景平面の淡い同心円模様（幾何学模様）。
    for (const ratio of [0.5, 0.9, 1.4, 2.0]) {
      const geometry = circleOutlineGeometry(radius * ratio);
      const material = new LineBasicMaterial({ color: palette.ringColor, transparent: true, opacity: 0.5 });
      const loop = new LineLoop(geometry, material);
      loop.position.set(bounds.centerX, bounds.centerY, bounds.centerZ - radius * 2.2);
      loop.renderOrder = -2;
      track(loop, geometry, material);
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
    (streamMaterial.uniforms.uFade.value as Color).copy(palette.fade);
    hemisphere.intensity = mode === 'dark' ? 0.7 : 1.0;
    sun.intensity = mode === 'dark' ? 0.9 : 1.2;
  }

  function rebuild(): void {
    clearDynamic();
    if (model === null) return;
    usedPillKeys = new Set();
    buildNodes(model);
    buildStreams(model);
    buildCones(model);
    buildHeadings(model.headings);
    buildLabels(model.layerLabels, 44);
    buildBackdrop(model);
    prunePillTextures();
  }

  function renderScene(): void {
    syncSize();
    const pose = cameraPose(orbit);
    camera.position.set(pose.x, pose.y, pose.z);
    camera.lookAt(pose.targetX, pose.targetY, pose.targetZ);
    scene.fog = new Fog(palette.background, orbit.distance * 1.2, orbit.distance * 4 + 4000);
    renderer.render(scene, camera);
  }

  // ---- 描画駆動: 要求時レンダリング + 流れアニメーション（要件書 §5 v2） ----
  // 静止時は invalidate（要求時 1 フレーム）。アニメ有効かつタブ可視の間だけ rAF を連続で回し、
  // uTime の更新のみでジオメトリは再構築しない。
  let renderRequested = false;
  let animating = false;
  let flowRaf = 0;

  function invalidate(): void {
    if (renderRequested || disposed) return;
    renderRequested = true;
    requestAnimationFrame(() => {
      renderRequested = false;
      if (disposed) return;
      renderScene();
    });
  }

  function flowLoop(nowMs: number): void {
    flowRaf = 0;
    if (disposed || !animating || document.hidden) return;
    streamMaterial.uniforms.uTime.value = nowMs / 1000;
    renderScene();
    flowRaf = requestAnimationFrame(flowLoop);
  }

  function syncFlowLoop(): void {
    const shouldRun = animating && !disposed && !document.hidden;
    if (shouldRun && flowRaf === 0) flowRaf = requestAnimationFrame(flowLoop);
    if (!shouldRun && flowRaf !== 0) {
      cancelAnimationFrame(flowRaf);
      flowRaf = 0;
    }
  }

  function handleVisibilityChange(): void {
    syncFlowLoop();
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);

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
    const targets: Object3D[] = [];
    if (dots !== null) targets.push(dots);
    for (const sprite of pillSprites) targets.push(sprite);
    if (targets.length === 0) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (hit === undefined) return null;
    if (dots !== null && hit.object === dots) {
      return hit.instanceId === undefined ? null : dotNodeIndexes[hit.instanceId] ?? null;
    }
    const nodeIndex = (hit.object.userData as { nodeIndex?: unknown }).nodeIndex;
    return typeof nodeIndex === 'number' ? nodeIndex : null;
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
      // ピル・ドットの淡色化・見出し・背景円はパレット依存のため作り直す。
      rebuild();
      invalidate();
    },
    setAnimating(on: boolean): void {
      animating = on;
      syncFlowLoop();
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
      renderScene();
      return new Promise((resolve) => renderer.domElement.toBlob((blob: Blob | null) => resolve(blob), 'image/png'));
    },
    dispose(): void {
      disposed = true;
      animating = false;
      syncFlowLoop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeObserver?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu);
      clearDynamic();
      for (const entry of pillTextures.values()) entry.texture.dispose();
      pillTextures.clear();
      dotGeometry.dispose();
      dotMaterial.dispose();
      coneGeometry.dispose();
      coneMaterial.dispose();
      streamMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
