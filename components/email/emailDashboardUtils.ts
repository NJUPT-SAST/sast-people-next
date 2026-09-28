export type EmailRecipient = {
  userFlowId: number;
  userId: number;
  name: string;
  studentId: string | null;
};

export type EmailDeliveryLike = {
  userFlowId: number | null;
  status?: string;
};

export function getRemainingEmailRecipients<TRecipient extends EmailRecipient>({
  recipients,
  deliveries,
}: {
  recipients: TRecipient[];
  deliveries: EmailDeliveryLike[];
}) {
  const deliveryUserFlowIds = new Set(
    deliveries.map((delivery) => delivery.userFlowId),
  );

  return recipients.filter(
    (recipient) => !deliveryUserFlowIds.has(recipient.userFlowId),
  );
}

export function getQueueableEmailRecipients<TRecipient extends EmailRecipient>({
  recipients,
  deliveries,
}: {
  recipients: TRecipient[];
  deliveries: EmailDeliveryLike[];
}) {
  const deliveryStatuses = new Map<number, string[]>();

  for (const delivery of deliveries) {
    if (delivery.userFlowId === null) continue;
    const statuses = deliveryStatuses.get(delivery.userFlowId) ?? [];
    statuses.push(delivery.status ?? "sent");
    deliveryStatuses.set(delivery.userFlowId, statuses);
  }

  return recipients.filter((recipient) => {
    const statuses = deliveryStatuses.get(recipient.userFlowId);
    if (!statuses) return true;
    if (statuses.some((status) => status === "sent" || status === "sending")) {
      return false;
    }
    return statuses.some(
      (status) => status === "pending" || status === "failed" || status === "dead",
    );
  });
}

export function getEmailPreflight<TRecipient extends EmailRecipient>({
  recipients,
  deliveries,
}: {
  recipients: TRecipient[];
  deliveries: EmailDeliveryLike[];
}) {
  const remainingRecipients = getQueueableEmailRecipients({
    recipients,
    deliveries,
  });
  const invalidRecipients = remainingRecipients.filter(
    (recipient) => !recipient.studentId?.trim(),
  );

  return {
    remainingRecipients,
    invalidRecipients,
    alreadyCreatedCount: recipients.length - remainingRecipients.length,
    canSend: remainingRecipients.length > 0 && invalidRecipients.length === 0,
  };
}

export function getEducationEmailLabel(studentId: string | null | undefined) {
  const normalized = studentId?.trim();
  return normalized ? `${normalized}@njupt.edu.cn` : "-";
}

/** 邮件模板行的部门维度（与 lib/email-center/template-access 的服务端语义一致） */
export type TemplateScopeRow = {
  templateKey: string;
  /** null = 全局默认（仅管理员可写） */
  department: string | null;
  /** 服务端 canEditTemplateRow 的结果：当前账号能否写这一行 */
  editable: boolean;
  /** 该 (templateKey, department) 是否存在真实覆盖行；服务端未提供时按部门行存在推断 */
  hasOverride?: boolean;
};

export type TemplateRowStatus =
  /** 当前归属已有覆盖行 */
  | "department-override"
  /** 当前归属没有覆盖，内容来自全局默认 */
  | "global-fallback"
  /** 当前归属就是全局默认 */
  | "global-default"
  /** 生效内容来自其他部门的覆盖 */
  | "other-department"
  /** 服务端没有返回该模板键的任何行 */
  | "missing";

/** 服务端返回的当前账号可写范围（与 DepartmentScope 对齐，只取 UI 需要的部分） */
export type TemplateScopeSummary = {
  kind: "all" | "department" | "none";
  department?: string | null;
};

export type TemplateScopeGroup<TRow extends TemplateScopeRow> = {
  templateKey: string;
  /** 当前归属实际生效、用于回填编辑框的行（部门覆盖优先，其次全局默认） */
  row: TRow | null;
  /** 当前模板归属：null = 全局默认 */
  targetDepartment: string | null;
  /** 当前归属是否已有自己的覆盖行 */
  hasOverride: boolean;
  /** 生效内容是否只读（服务端 editable 为准） */
  readOnly: boolean;
  /** 当前归属是否可写（写入 targetDepartment） */
  writable: boolean;
  status: TemplateRowStatus;
  /** 其他部门已配置覆盖的标识（管理员才拿得到这些行） */
  otherDepartments: string[];
};

export const normalizeTemplateDepartment = (
  value: string | null | undefined,
): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export function getTemplateRowStatus({
  row,
  department,
  hasOverride,
}: {
  row: { department: string | null } | null;
  department: string | null | undefined;
  hasOverride: boolean;
}): TemplateRowStatus {
  if (!row) return "missing";

  const target = normalizeTemplateDepartment(department);
  const rowDepartment = normalizeTemplateDepartment(row.department);

  if (!rowDepartment) return "global-default";
  if (target && rowDepartment === target) {
    return hasOverride ? "department-override" : "global-fallback";
  }
  return "other-department";
}

export function getTemplateRowStatusLabel(
  status: TemplateRowStatus,
  options: { readOnly?: boolean } = {},
) {
  switch (status) {
    case "department-override":
      return "本部门覆盖";
    case "global-fallback":
      return options.readOnly ? "全局默认（只读）" : "全局默认（回落）";
    case "global-default":
      return options.readOnly ? "全局默认（只读）" : "全局默认";
    case "other-department":
      return "其他部门覆盖";
    case "missing":
      return "尚未配置";
  }
}

/**
 * 把服务端返回的「模板键 × 归属」行折叠成每个模板键一组：
 * 部门覆盖优先，其次全局默认；同一模板键若返回了其他部门的行，
 * 会作为「其他部门覆盖」提示（当前服务端按归属只返回命中行，因此通常为空）。
 */
export function groupTemplateRowsByKey<TRow extends TemplateScopeRow>(
  rows: TRow[] | null | undefined,
  options: {
    /** 当前模板归属部门标识；null = 全局默认 */
    department: string | null | undefined;
    /** 当前账号可写范围（服务端返回），用于判断无覆盖行时能否写入目标部门 */
    scope?: TemplateScopeSummary;
  },
): Array<TemplateScopeGroup<TRow>> {
  const target = normalizeTemplateDepartment(options.department);
  const rowsByKey = new Map<string, TRow[]>();

  for (const row of rows ?? []) {
    const templateKey = row?.templateKey;
    if (!templateKey) continue;
    const bucket = rowsByKey.get(templateKey);
    if (bucket) {
      bucket.push(row);
    } else {
      rowsByKey.set(templateKey, [row]);
    }
  }

  return Array.from(rowsByKey.entries()).map(([templateKey, keyRows]) => {
    const globalRow =
      keyRows.find(
        (row) => normalizeTemplateDepartment(row.department) === null,
      ) ?? null;
    const departmentRow = target
      ? keyRows.find(
          (row) => normalizeTemplateDepartment(row.department) === target,
        ) ?? null
      : null;
    const hasOverride =
      target === null
        ? globalRow !== null && (globalRow.hasOverride ?? true)
        : departmentRow !== null && (departmentRow.hasOverride ?? true);
    const row = departmentRow ?? globalRow ?? keyRows[0] ?? null;
    const status = getTemplateRowStatus({
      row,
      department: target,
      hasOverride,
    });
    /** 生效内容来源：有真实覆盖时是覆盖行，否则是全局默认行 */
    const contentFromOverride = target !== null && hasOverride;
    const sourceRow = contentFromOverride
      ? departmentRow
      : globalRow ?? row;
    /* 服务端只返回生效行时（面试模板）没有部门行，可写性由 scope 推断 */
    const scopeWritable =
      target === null
        ? Boolean(globalRow?.editable)
        : options.scope?.kind === "all" ||
          (options.scope?.kind === "department" &&
            normalizeTemplateDepartment(options.scope.department) === target);
    const otherDepartments = Array.from(
      new Set(
        keyRows
          .map((item) => normalizeTemplateDepartment(item.department))
          .filter((key): key is string => Boolean(key) && key !== target),
      ),
    ).sort();

    return {
      templateKey,
      row,
      targetDepartment: target,
      hasOverride,
      readOnly: !sourceRow?.editable,
      writable: departmentRow ? departmentRow.editable : scopeWritable,
      status,
      otherDepartments,
    };
  });
}
