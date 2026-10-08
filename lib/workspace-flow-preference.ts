/**
 * 工作台「上次使用的流程」偏好：面试 / 笔试管理再次打开时，默认回到该浏览器上次点选的流程。
 *
 * 存 Cookie 而不是 localStorage：服务端首屏就要用它挑流程，避免先渲染最新流程、
 * 再切换到记忆流程的闪动与重复请求。值只是流程 id，服务端还会用当前会话的可见流程
 * 列表再校验一次，越权 / 已删除的 id 一律回落最新流程。
 */

export type WorkspaceFlowPreferenceMode = "written" | "interview";

/** Cookie 名按工作台分开：面试与笔试的流程集合不同，记忆互不干扰 */
const WORKSPACE_FLOW_PREFERENCE_COOKIE_PREFIX = "people_workspace_flow";

/** 180 天：一个招新周期内不需要重选 */
const WORKSPACE_FLOW_PREFERENCE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export function workspaceFlowPreferenceCookieName(
  mode: WorkspaceFlowPreferenceMode,
): string {
  return `${WORKSPACE_FLOW_PREFERENCE_COOKIE_PREFIX}_${mode}`;
}

/** Cookie 里只认正整数流程 id；空值与脏数据都视为「没有记忆」 */
export function parseWorkspaceFlowPreference(
  rawValue: string | null | undefined,
): number | null {
  if (!rawValue) return null;
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * 首次打开的流程：显式 flowId 链接 → 上次使用的流程 → 最新流程。
 * `selectableFlowIds` 已按当前会话的可见范围过滤、按创建时间倒序（首条即最新）。
 */
export function resolveWorkspaceFlowId({
  requestedFlowId,
  rememberedFlowId,
  selectableFlowIds,
}: {
  requestedFlowId?: number;
  rememberedFlowId?: number | null;
  selectableFlowIds: number[];
}): number | undefined {
  if (requestedFlowId && selectableFlowIds.includes(requestedFlowId)) {
    return requestedFlowId;
  }
  if (rememberedFlowId && selectableFlowIds.includes(rememberedFlowId)) {
    return rememberedFlowId;
  }
  return selectableFlowIds[0];
}

/** 在工作台里切换流程时记一笔（客户端调用，服务端读） */
export function writeWorkspaceFlowPreference(
  mode: WorkspaceFlowPreferenceMode,
  flowId: number,
): void {
  if (typeof document === "undefined") return;
  const validFlowId = parseWorkspaceFlowPreference(String(flowId));
  if (!validFlowId) return;
  document.cookie = `${workspaceFlowPreferenceCookieName(mode)}=${validFlowId}; path=/; max-age=${WORKSPACE_FLOW_PREFERENCE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
