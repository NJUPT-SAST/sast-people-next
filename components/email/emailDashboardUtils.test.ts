import {
  getEducationEmailLabel,
  getEmailPreflight,
  getQueueableEmailRecipients,
  getRemainingEmailRecipients,
  getTemplateRowStatus,
  getTemplateRowStatusLabel,
  groupTemplateRowsByKey,
} from "./emailDashboardUtils";

const recipients = [
  { userFlowId: 1, userId: 101, name: "Alice", studentId: "B001" },
  { userFlowId: 2, userId: 102, name: "Bob", studentId: null },
  { userFlowId: 3, userId: 103, name: "Carol", studentId: "  " },
  { userFlowId: 4, userId: 104, name: "Dave", studentId: "B004" },
];

describe("emailDashboardUtils", () => {
  it("returns recipients without existing delivery records", () => {
    expect(
      getRemainingEmailRecipients({
        recipients,
        deliveries: [{ userFlowId: 1 }, { userFlowId: 4 }],
      }),
    ).toEqual([
      { userFlowId: 2, userId: 102, name: "Bob", studentId: null },
      { userFlowId: 3, userId: 103, name: "Carol", studentId: "  " },
    ]);
  });

  it("returns recipients with no delivery or retryable delivery records", () => {
    expect(
      getQueueableEmailRecipients({
        recipients,
        deliveries: [
          { userFlowId: 1, status: "sent" },
          { userFlowId: 2, status: "failed" },
          { userFlowId: 3, status: "pending" },
        ],
      }),
    ).toEqual([
      { userFlowId: 2, userId: 102, name: "Bob", studentId: null },
      { userFlowId: 3, userId: 103, name: "Carol", studentId: "  " },
      { userFlowId: 4, userId: 104, name: "Dave", studentId: "B004" },
    ]);
  });

  it("does not retry recipients that already have a sent or sending delivery", () => {
    expect(
      getQueueableEmailRecipients({
        recipients,
        deliveries: [
          { userFlowId: 1, status: "failed" },
          { userFlowId: 1, status: "sent" },
          { userFlowId: 2, status: "pending" },
          { userFlowId: 2, status: "sending" },
        ],
      }),
    ).toEqual([
      { userFlowId: 3, userId: 103, name: "Carol", studentId: "  " },
      { userFlowId: 4, userId: 104, name: "Dave", studentId: "B004" },
    ]);
  });

  it("keeps historical sent deliveries out of a later send batch", () => {
    expect(
      getQueueableEmailRecipients({
        recipients,
        deliveries: [
          { userFlowId: 1, status: "sent" },
          { userFlowId: 2, status: "pending" },
        ],
      }),
    ).toEqual([
      { userFlowId: 2, userId: 102, name: "Bob", studentId: null },
      { userFlowId: 3, userId: 103, name: "Carol", studentId: "  " },
      { userFlowId: 4, userId: 104, name: "Dave", studentId: "B004" },
    ]);
  });

  it("blocks sending when remaining recipients have no student id", () => {
    expect(
      getEmailPreflight({
        recipients,
        deliveries: [{ userFlowId: 1, status: "sent" }],
      }),
    ).toMatchObject({
      alreadyCreatedCount: 1,
      canSend: false,
      invalidRecipients: [
        { userFlowId: 2, userId: 102, name: "Bob", studentId: null },
        { userFlowId: 3, userId: 103, name: "Carol", studentId: "  " },
      ],
    });
  });

  it("allows sending when all remaining recipients have student ids", () => {
    expect(
      getEmailPreflight({
        recipients,
        deliveries: [
          { userFlowId: 2, status: "sent" },
          { userFlowId: 3, status: "sent" },
        ],
      }),
    ).toMatchObject({
      alreadyCreatedCount: 2,
      canSend: true,
      remainingRecipients: [
        { userFlowId: 1, userId: 101, name: "Alice", studentId: "B001" },
        { userFlowId: 4, userId: 104, name: "Dave", studentId: "B004" },
      ],
    });
  });

  it("formats education email labels without leaking null into addresses", () => {
    expect(getEducationEmailLabel(" B001 ")).toBe("B001@njupt.edu.cn");
    expect(getEducationEmailLabel(null)).toBe("-");
  });
});

describe("groupTemplateRowsByKey", () => {
  /* 管理员视角：每行都带上自己的归属、可写性与是否有真实覆盖行 */
  const adminRows = [
    { templateKey: "soc.result.accepted", department: null, editable: true, hasOverride: false, bodyTemplate: "全局文案" },
    { templateKey: "soc.result.accepted", department: "software", editable: true, hasOverride: true, bodyTemplate: "软件文案" },
    { templateKey: "soc.result.accepted", department: "media", editable: true, hasOverride: true, bodyTemplate: "多媒体文案" },
    { templateKey: "recruitment.result.rejected", department: null, editable: true, hasOverride: false, bodyTemplate: "全局拒绝文案" },
    { templateKey: "recruitment.result.rejected", department: "software", editable: true, hasOverride: false, bodyTemplate: "全局拒绝文案" },
  ];

  it("prefers the department override over the global default", () => {
    const [group] = groupTemplateRowsByKey(adminRows, {
      department: "software",
      scope: { kind: "all", department: null },
    });

    expect(group).toMatchObject({
      templateKey: "soc.result.accepted",
      targetDepartment: "software",
      hasOverride: true,
      readOnly: false,
      writable: true,
      status: "department-override",
    });
    expect(group.row?.bodyTemplate).toBe("软件文案");
    /* 其他部门的覆盖只有管理员拿得到 */
    expect(group.otherDepartments).toEqual(["media"]);
    expect(getTemplateRowStatusLabel(group.status)).toBe("本部门覆盖");
  });

  it("falls back to the global default and stays read-only when the department has no override", () => {
    /* 部门账号读到的是「全局默认（不可写）+ 本部门（可写）」两行 */
    const departmentRows = [
      { templateKey: "soc.result.accepted", department: null, editable: false, hasOverride: false, bodyTemplate: "全局文案" },
      { templateKey: "soc.result.accepted", department: "software", editable: true, hasOverride: false, bodyTemplate: "全局文案" },
    ];
    const [group] = groupTemplateRowsByKey(departmentRows, {
      department: "software",
      scope: { kind: "department", department: "software" },
    });

    expect(group).toMatchObject({
      hasOverride: false,
      readOnly: true,
      writable: true,
      status: "global-fallback",
      otherDepartments: [],
    });
    expect(group.row?.bodyTemplate).toBe("全局文案");
    expect(getTemplateRowStatusLabel(group.status, { readOnly: group.readOnly })).toBe(
      "全局默认（只读）",
    );
  });

  it("keeps department admins able to write when the server only returns the effective row", () => {
    /* 面试模板只返回生效行：无覆盖时 department 为 null、editable 为 false */
    const [group] = groupTemplateRowsByKey(
      [
        { templateKey: "interview.schedule.created", department: null, editable: false, hasOverride: false, bodyTemplate: "全局文案" },
      ],
      {
        department: "software",
        scope: { kind: "department", department: "software" },
      },
    );

    expect(group).toMatchObject({
      targetDepartment: "software",
      hasOverride: false,
      readOnly: true,
      writable: true,
      status: "global-default",
    });
    expect(getTemplateRowStatusLabel(group.status, { readOnly: group.readOnly })).toBe(
      "全局默认（只读）",
    );
  });

  it("never lets a department admin write another department", () => {
    const [group] = groupTemplateRowsByKey(
      [
        { templateKey: "interview.schedule.created", department: null, editable: false, hasOverride: false },
      ],
      {
        department: "media",
        scope: { kind: "department", department: "software" },
      },
    );

    expect(group.writable).toBe(false);
  });

  it("marks the global target as writable for admins", () => {
    const groups = groupTemplateRowsByKey(adminRows, {
      department: null,
      scope: { kind: "all", department: null },
    });
    const rejected = groups.find(
      (group) => group.templateKey === "recruitment.result.rejected",
    );

    expect(rejected).toMatchObject({
      targetDepartment: null,
      hasOverride: false,
      readOnly: false,
      writable: true,
      status: "global-default",
      otherDepartments: ["software"],
    });
    expect(getTemplateRowStatusLabel(rejected!.status)).toBe("全局默认");
  });

  it("flags rows of other departments so admins can tell them apart", () => {
    const [group] = groupTemplateRowsByKey(
      [
        { templateKey: "soc.result.accepted", department: null, editable: true, hasOverride: false },
        { templateKey: "soc.result.accepted", department: "media", editable: true, hasOverride: true },
      ],
      { department: "software", scope: { kind: "all", department: null } },
    );

    expect(group.status).toBe("global-default");
    expect(group.otherDepartments).toEqual(["media"]);
    expect(getTemplateRowStatusLabel("other-department")).toBe("其他部门覆盖");
  });

  it("treats a department row without an explicit hasOverride flag as an override", () => {
    const [group] = groupTemplateRowsByKey(
      [
        { templateKey: "interview.schedule.created", department: null, editable: true },
        { templateKey: "interview.schedule.created", department: "software", editable: true },
      ],
      { department: "software", scope: { kind: "department", department: "software" } },
    );

    expect(group).toMatchObject({ hasOverride: true, status: "department-override" });
  });

  it("flags an existing global row as resettable while the target is the global default", () => {
    const [group] = groupTemplateRowsByKey(
      [
        {
          templateKey: "recruitment.result.accepted",
          department: null,
          editable: true,
          hasOverride: true,
          bodyTemplate: "全局文案",
        },
      ],
      { department: null, scope: { kind: "all", department: null } },
    );

    expect(group).toMatchObject({
      targetDepartment: null,
      hasOverride: true,
      readOnly: false,
      writable: true,
      status: "global-default",
    });
  });

  it("reports keys the server did not return rows for", () => {
    expect(
      groupTemplateRowsByKey([], { department: "software" }),
    ).toEqual([]);
    expect(
      getTemplateRowStatus({ row: null, department: "software", hasOverride: false }),
    ).toBe("missing");
    expect(getTemplateRowStatusLabel("missing")).toBe("尚未配置");
  });
});
