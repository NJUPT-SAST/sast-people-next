/**
 * 流程结果 → 部门归属解析。
 *
 * 招新规则：候选人通过某部门的流程后，自动把该成员归属到对应部门，
 * 不需要在 Link 手动改部门；如果先后通过多个部门，以「最后一次通过」的部门为准（可覆盖）。
 *
 * 办公类部门面试（每个办公部门一条流程，候选人在两个部门分别报名）：
 * 1) 部长团评议的「最终去向」优先（`user_flow.final_department`）；
 * 2) 没有评议结果时按「第一志愿优先」：同一人通过多个办公流程时归属第一志愿部门（choice=1）。
 */

export type PassedFlowDepartmentRow = {
  uid: number;
  /** 流程类型（识别办公类流程） */
  flowType?: string | null;
  /** 办公类志愿类型：1=第一志愿、2=第二志愿 */
  choice?: number | null;
  /** 部长团评议的最终去向部门（Link 部门标识） */
  finalDepartment?: string | null;
  /** 流程归属部门（Link 部门标识） */
  flowDepartment: string | null | undefined;
  /** 报名记录固化归属（流程无归属时回落使用） */
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

const isOfficeRow = (row: PassedFlowDepartmentRow) =>
  row.flowType === "office_interview";

/** 每位用户取最终归属部门：评议结果优先，其次「最后一次通过」（办公类内部第一志愿优先） */
export const resolveLatestPassedDepartments = (
  rows: PassedFlowDepartmentRow[],
): Map<number, string> => {
  const grouped = new Map<number, PassedFlowDepartmentRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.uid);
    if (group) group.push(row);
    else grouped.set(row.uid, [row]);
  }

  const resolved = new Map<number, string>();

  for (const [uid, userRows] of grouped) {
    /* 1) 部长团评议的最终去向：直接采用 */
    const decided = userRows
      .map((row) => normalize(row.finalDepartment))
      .find((department) => department !== null);
    if (decided) {
      resolved.set(uid, decided);
      continue;
    }

    /* 2) 办公类：同一人通过多个办公流程时第一志愿优先；与其他部门流程比较时用办公类最近通过时间 */
    const officeRows = userRows.filter(isOfficeRow);
    const otherRows = userRows.filter((row) => !isOfficeRow(row));
    const candidates: Array<{ department: string; passedAt: number }> = [];

    for (const row of otherRows) {
      const department = normalize(row.flowDepartment ?? row.rowDepartment);
      if (department) {
        candidates.push({ department, passedAt: toMillis(row.passedAt) });
      }
    }

    if (officeRows.length > 0) {
      const preferred =
        officeRows.find((row) => row.choice === 1) ?? officeRows[0];
      const department = normalize(
        preferred.flowDepartment ?? preferred.rowDepartment,
      );
      if (department) {
        candidates.push({
          department,
          passedAt: Math.max(...officeRows.map((row) => toMillis(row.passedAt))),
        });
      }
    }

    /* 3) 同一时间取较后的行，保持原有「最后一次通过覆盖」的口径 */
    let latest: { department: string; passedAt: number } | null = null;
    for (const candidate of candidates) {
      if (!latest || candidate.passedAt >= latest.passedAt) {
        latest = candidate;
      }
    }
    if (latest) resolved.set(uid, latest.department);
  }

  return resolved;
};
