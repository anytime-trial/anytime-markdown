/**
 * オービットカメラの状態と純粋な操作関数。
 *
 * Why not `three/examples/jsm` の OrbitControls か: examples は ESM 単独配布で
 * jest（CJS）とバンドラ間の互換に揺れがあり、必要な操作（回転・ズーム・パン・fit）は
 * 球面座標の数学だけで足りる。純関数にすることで jsdom で全て検査できる（要件書 §5）。
 *
 * 座標系は three.js と同じ y 上向きの右手系。
 * position = target + distance * (sinφ sinθ, cosφ, sinφ cosθ)
 */

export interface OrbitState {
  targetX: number;
  targetY: number;
  targetZ: number;
  /** 方位角（y 軸まわり）。 */
  theta: number;
  /** 極角。0 が真上、π が真下。 */
  phi: number;
  distance: number;
  minDistance: number;
  maxDistance: number;
}

/** 極でカメラの上方向が反転して見えるのを避けるためのクランプ。 */
export const PHI_MIN = 0.05;
export const PHI_MAX = Math.PI - 0.05;

export function createOrbitState(init: Partial<OrbitState> & { distance: number }): OrbitState {
  return {
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    theta: 0,
    phi: Math.PI / 2,
    minDistance: 1,
    maxDistance: 100000,
    ...init,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function rotateOrbit(state: OrbitState, deltaTheta: number, deltaPhi: number): OrbitState {
  return {
    ...state,
    theta: state.theta + deltaTheta,
    phi: clamp(state.phi + deltaPhi, PHI_MIN, PHI_MAX),
  };
}

export function zoomOrbit(state: OrbitState, factor: number): OrbitState {
  return {
    ...state,
    distance: clamp(state.distance * factor, state.minDistance, state.maxDistance),
  };
}

/**
 * 視線と直交する平面内で target を平行移動する。
 * dx は画面右方向、dy は画面上方向の移動量（世界座標スケール）。
 */
export function panOrbit(state: OrbitState, dx: number, dy: number): OrbitState {
  const sinPhi = Math.sin(state.phi);
  const cosPhi = Math.cos(state.phi);
  const sinTheta = Math.sin(state.theta);
  const cosTheta = Math.cos(state.theta);
  // 画面右 = 視線 × 上（y 軸）方向。theta のみに依存する。
  const rightX = cosTheta;
  const rightZ = -sinTheta;
  // 画面上 = 右 × 視線。球面座標の phi 微分（真上へ向かう向き）。
  const upX = -cosPhi * sinTheta;
  const upY = sinPhi;
  const upZ = -cosPhi * cosTheta;
  return {
    ...state,
    targetX: state.targetX + rightX * dx + upX * dy,
    targetY: state.targetY + upY * dy,
    targetZ: state.targetZ + rightZ * dx + upZ * dy,
  };
}

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

export function cameraPose(state: OrbitState): CameraPose {
  const sinPhi = Math.sin(state.phi);
  return {
    x: state.targetX + state.distance * sinPhi * Math.sin(state.theta),
    y: state.targetY + state.distance * Math.cos(state.phi),
    z: state.targetZ + state.distance * sinPhi * Math.cos(state.theta),
    targetX: state.targetX,
    targetY: state.targetY,
    targetZ: state.targetZ,
  };
}

/**
 * 外接半径 radius の球が視野へ収まる距離。半径 0（語 1 つ等）でも 0 を返さず
 * 最低距離を確保する。
 */
export function fitDistance(radius: number, fovDeg: number): number {
  const safeRadius = Math.max(radius, 40);
  return safeRadius / Math.sin((fovDeg * Math.PI) / 360) * 1.15;
}
