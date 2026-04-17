// Claude Code 活動オーバーレイ用の色マップを生成する
// active（現在編集中）・touched（セッション累積）・planned（計画対象）で異なる色を使用する

const COLOR_ACTIVE_DARK    = 'rgba(255, 152, 0, 0.5)';    // オレンジ（ダーク）
const COLOR_ACTIVE_LIGHT   = 'rgba(230, 120, 0, 0.4)';    // オレンジ（ライト）
const COLOR_TOUCHED_DARK   = 'rgba(100, 181, 246, 0.35)'; // 水色（ダーク）
const COLOR_TOUCHED_LIGHT  = 'rgba(30, 120, 200, 0.25)';  // 水色（ライト）
const COLOR_PLANNED_DARK   = 'rgba(171, 71, 188, 0.35)';  // 紫（ダーク）
const COLOR_PLANNED_LIGHT  = 'rgba(140, 40, 160, 0.25)';  // 紫（ライト）

// エージェント別カラーパレット（最大8エージェント、ダーク/ライト各2色: active/touched）
const AGENT_COLORS: ReadonlyArray<{
  activeDark: string; activeLight: string;
  touchedDark: string; touchedLight: string;
}> = [
  { activeDark: 'rgba(255, 152, 0, 0.5)',   activeLight: 'rgba(230, 120, 0, 0.4)',   touchedDark: 'rgba(255, 152, 0, 0.25)',   touchedLight: 'rgba(230, 120, 0, 0.2)' },   // オレンジ
  { activeDark: 'rgba(76, 175, 80, 0.45)',   activeLight: 'rgba(46, 125, 50, 0.35)',   touchedDark: 'rgba(76, 175, 80, 0.22)',   touchedLight: 'rgba(46, 125, 50, 0.17)' },   // 緑
  { activeDark: 'rgba(171, 71, 188, 0.4)',   activeLight: 'rgba(140, 40, 160, 0.3)',   touchedDark: 'rgba(171, 71, 188, 0.2)',   touchedLight: 'rgba(140, 40, 160, 0.15)' },   // 紫
  { activeDark: 'rgba(244, 67, 54, 0.4)',    activeLight: 'rgba(200, 40, 30, 0.3)',    touchedDark: 'rgba(244, 67, 54, 0.2)',    touchedLight: 'rgba(200, 40, 30, 0.15)' },    // 赤
  { activeDark: 'rgba(0, 188, 212, 0.4)',    activeLight: 'rgba(0, 140, 160, 0.3)',    touchedDark: 'rgba(0, 188, 212, 0.2)',    touchedLight: 'rgba(0, 140, 160, 0.15)' },    // シアン
  { activeDark: 'rgba(233, 30, 99, 0.4)',    activeLight: 'rgba(180, 20, 70, 0.3)',    touchedDark: 'rgba(233, 30, 99, 0.2)',    touchedLight: 'rgba(180, 20, 70, 0.15)' },    // ピンク
  { activeDark: 'rgba(255, 235, 59, 0.4)',   activeLight: 'rgba(200, 180, 0, 0.3)',    touchedDark: 'rgba(255, 235, 59, 0.2)',   touchedLight: 'rgba(200, 180, 0, 0.15)' },    // 黄
  { activeDark: 'rgba(121, 85, 72, 0.4)',    activeLight: 'rgba(90, 60, 50, 0.3)',     touchedDark: 'rgba(121, 85, 72, 0.2)',    touchedLight: 'rgba(90, 60, 50, 0.15)' },     // 茶
];

export interface AgentColorInput {
  readonly sessionId: string;
  readonly activeElementIds: readonly string[];
  readonly touchedElementIds: readonly string[];
  readonly plannedElementIds: readonly string[];
}

export function computeMultiAgentColorMap(
  agents: readonly AgentColorInput[],
  isDark: boolean,
): Map<string, string> {
  const map = new Map<string, string>();

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const palette = AGENT_COLORS[i % AGENT_COLORS.length];

    const touchedColor = isDark ? palette.touchedDark : palette.touchedLight;
    for (const id of agent.touchedElementIds) {
      map.set(id, touchedColor);
    }

    const activeColor = isDark ? palette.activeDark : palette.activeLight;
    for (const id of agent.activeElementIds) {
      map.set(id, activeColor);
    }
  }

  return map;
}

/** エージェントカラーパレットを外部から参照するための関数 */
export function getAgentColor(index: number, isDark: boolean): { active: string; touched: string } {
  const palette = AGENT_COLORS[index % AGENT_COLORS.length];
  return {
    active: isDark ? palette.activeDark : palette.activeLight,
    touched: isDark ? palette.touchedDark : palette.touchedLight,
  };
}

export function computeClaudeActivityColorMap(
  activeElementIds: readonly string[],
  touchedElementIds: readonly string[],
  plannedElementIds: readonly string[],
  isDark: boolean,
): Map<string, string> {
  const map = new Map<string, string>();

  // planned を最初に設定（優先度最低）
  const plannedColor = isDark ? COLOR_PLANNED_DARK : COLOR_PLANNED_LIGHT;
  for (const id of plannedElementIds) {
    map.set(id, plannedColor);
  }

  // touched は planned より後に設定することで上書き（優先）される
  const touchedColor = isDark ? COLOR_TOUCHED_DARK : COLOR_TOUCHED_LIGHT;
  for (const id of touchedElementIds) {
    map.set(id, touchedColor);
  }

  // active は touched より後に設定することで上書き（優先）される
  const activeColor = isDark ? COLOR_ACTIVE_DARK : COLOR_ACTIVE_LIGHT;
  for (const id of activeElementIds) {
    map.set(id, activeColor);
  }

  return map;
}

// ---------------------------------------------------------------------------
//  Conflict border colors
// ---------------------------------------------------------------------------

const CONFLICT_ACTIVE_BORDER = 'rgba(244, 67, 54, 0.8)';   // 赤（editing 衝突）
const CONFLICT_TOUCHED_BORDER = 'rgba(244, 67, 54, 0.4)';  // 薄赤（touched 衝突）

export interface ConflictInput {
  readonly file: string;
  readonly elementIds: readonly string[];
  readonly agentSessionIds: readonly string[];
  readonly isActiveConflict: boolean;
}

/** 衝突ノードの枠色マップを生成する */
export function computeConflictBorderMap(
  conflicts: readonly ConflictInput[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const conflict of conflicts) {
    const color = conflict.isActiveConflict ? CONFLICT_ACTIVE_BORDER : CONFLICT_TOUCHED_BORDER;
    for (const id of conflict.elementIds) {
      if (!map.has(id) || conflict.isActiveConflict) {
        map.set(id, color);
      }
    }
  }
  return map;
}
