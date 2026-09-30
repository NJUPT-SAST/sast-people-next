/**
 * 流程结果 → 部门归属解析。
 *
 * 招新规则：候选人通过某部门的流程后，自动把该成员归属到对应部门，
 * 不需要在 Link 手动改部门；如果先后通过多个部门，以「最后一次通过」的部门为准（可覆盖）。
 */

export type PassedFlowDepartmentRow = {
  uid: number;
  /** 流程归属部门（Link 部门标识）；共享办公类流程为 null */
  flowDepartment: string | null | undefined;
  /** 报名记录固化归属（第一志愿部门等），流程无归属时回落使用 */
  rowDepartment: string | null | undefined;
  /** 通过时间：优先结果发布时间，其次报名记录更新时间 */
  passedAt: Date | string | number | null | undefined;
};

const toMillis = (value: Date | string | number | null | undefined) => {
  if (value === null || value === undefined) return 0;
  const time =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const normalize = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 64) : null;
};

/** 每位用户取最后一次通过所对应的部门（时间相同则取较后的行） */
export const resolveLatestPassedDepartments = (
  rows: PassedFlowDepartmentRow[],
): Map<number, string> => {
  const latest = new Map<number, { department: string; passedAt: number }>();

  for (const row of rows) {
    const department = normalize(row.flowDepartment ?? row.rowDepartment);
    if (!department) continue;
    const passedAt = toMillis(row.passedAt);
    const current = latest.get(row.uid);
    if (!current || passedAt >= current.passedAt) {
      latest.set(row.uid, { department, passedAt });
    }
  }

  return new Map(
    [...latest.entries()].map(([uid, value]) => [uid, value.department]),
  );
};
