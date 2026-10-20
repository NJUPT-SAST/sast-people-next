import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { ResultEmailTemplateSettingRow } from "@/action/email/template";
import { updateEmailTemplateSetting } from "@/action/email/template";
import { updateInterviewScheduleEmailTemplate } from "@/action/email/interview-template";
import type { InterviewScheduleTemplateSettingsPayload } from "@/lib/email/interview-template-settings";

import { EmailTemplateManagementSection } from "./EmailTemplateManagementSection";
import type {
  EmailTemplateDefinition,
  InterviewSchedulePreviews,
  TemplateSettingsResult,
} from "./emailDashboardTypes";

jest.mock("@/action/email/template", () => ({
  updateEmailTemplateSetting: jest.fn().mockResolvedValue({ ok: true }),
  resetEmailTemplateSetting: jest.fn().mockResolvedValue({ ok: true }),
  previewResultEmailTemplateDraft: jest
    .fn()
    .mockResolvedValue({ ok: true, html: "<html><body>预览</body></html>" }),
}));

jest.mock("@/action/email/style-preset", () => ({
  listEmailTemplateStylePresets: jest.fn(),
  saveEmailTemplateStylePreset: jest.fn().mockResolvedValue({ ok: true }),
  deleteEmailTemplateStylePreset: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock("@/action/email/interview-template", () => ({
  updateInterviewScheduleEmailTemplate: jest.fn().mockResolvedValue({ ok: true }),
  resetInterviewScheduleEmailTemplate: jest.fn().mockResolvedValue({ ok: true }),
  previewInterviewScheduleEmailTemplateDraft: jest
    .fn()
    .mockResolvedValue({ ok: true, html: "<html><body>面试预览</body></html>" }),
}));

/* 全局 mock 没提供 refresh，这里补齐，避免保存/恢复成功后抛错 */
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/dashboard/emails",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/action/email/test-send", () => ({ sendEmailTest: jest.fn() }));

jest.mock("sonner", () => ({ toast: { promise: jest.fn(), error: jest.fn() } }));

function createResultRow(
  templateKey: string,
  department: string | null,
  editable: boolean,
  hasOverride: boolean,
): ResultEmailTemplateSettingRow {
  return {
    id: hasOverride ? 1 : null,
    templateKey,
    department,
    editable,
    hasOverride,
    subjectTemplate: `${templateKey} 标题`,
    titleTemplate: "主标题",
    subtitleTemplate: "副标题",
    resultBadgeTemplate: "结果标签",
    resultTitleTemplate: "结果标题",
    resultSummaryTemplate: "结果摘要",
    bodyTemplate: "正文",
    memberInfoFormUrl: "",
    feishuGroupUrl: "",
    calendarUrl: "https://example.com/calendar",
    feishuRegisterHelpUrl: "",
    contactEmail: "sast@njupt.edu.cn",
    memberFormLabel: "填写表单",
    feishuGroupName: "SAST 群",
    groupNumber: "",
    bodyBlocks: null,
    bodyFrame: null,
    themeColor: "",
  };
}

const emptyInterviewSettings: InterviewScheduleTemplateSettingsPayload = {
  rows: [],
  departments: [],
  scope: { kind: "department", department: "software" },
};

function createInterviewRow(
  templateKey: string,
  department: string | null,
): InterviewScheduleTemplateSettingsPayload["rows"][number] {
  return {
    templateKey,
    department,
    editable: true,
    hasOverride: department !== null,
    subjectTemplate: "{flowName} 面试预约通知",
    titleTemplate: "面试预约已确认",
    bodyTemplate:
      "{candidateName} 同学，你好。{flowName} 的线下面试安排已确认，请查看下方的面试时间安排并按时到达。",
    footerText: "南京邮电大学大学生科学技术协会",
    bodyBlocks: null,
    bodyFrame: null,
    themeColor: "",
  };
}

const templateDefinitions = [
  {
    key: "recruitment.result.accepted",
    category: "result",
    name: "招新结果·通过",
    variables: [],
  },
  {
    key: "recruitment.result.rejected",
    category: "result",
    name: "招新结果·未通过",
    variables: [],
  },
  {
    key: "office_round1.result.accepted",
    category: "result",
    name: "部门面试一面通过通知",
    variables: [],
  },
  {
    key: "interview.schedule.created",
    category: "interview",
    name: "面试通知·创建",
    variables: [],
  },
] as unknown as EmailTemplateDefinition[];

type SectionProps = {
  templateSettings: TemplateSettingsResult;
  department: string | null;
  selectedFlowTitle?: string;
  selectedFlowType?: string | null;
  interviewScheduleTemplates?: InterviewScheduleTemplateSettingsPayload;
  onDepartmentChange?: (department: string | null) => void;
};

function sectionElement({
  templateSettings,
  department,
  selectedFlowTitle,
  selectedFlowType,
  interviewScheduleTemplates = emptyInterviewSettings,
  onDepartmentChange = jest.fn(),
}: SectionProps) {
  return (
    <EmailTemplateManagementSection
      templateSettings={templateSettings}
      resultEmailPreviews={{}}
      interviewScheduleTemplates={interviewScheduleTemplates}
      interviewSchedulePreviews={{} as InterviewSchedulePreviews}
      templateDefinitions={templateDefinitions}
      selectedFlowTitle={selectedFlowTitle}
      selectedFlowType={selectedFlowType}
      department={department}
      onDepartmentChange={onDepartmentChange}
    />
  );
}

function renderSection(props: SectionProps) {
  return render(sectionElement(props));
}

/**
 * 卡片标题按「部门 × 阶段」生成（多媒体部WOD / 部门面试一面），进入编辑的按钮统一是「编辑模板」，
 * 所以先按标题定位卡片，再在卡片里点按钮。
 */
async function openTemplateDialog(user: UserEvent, cardTitle: string) {
  const card = screen.getByText(cardTitle).closest(".group") as HTMLElement;
  await user.click(within(card).getByRole("button", { name: "编辑模板" }));
  return card;
}

describe("EmailTemplateManagementSection", () => {
  it("部门账号看到模板归属选择器与本部门归属，跨部门仍是只读", () => {
    renderSection({
      templateSettings: {
        rows: [
          createResultRow("recruitment.result.accepted", null, false, false),
          createResultRow("recruitment.result.rejected", "software", true, true),
        ],
        departments: ["software", "media"],
        scope: { kind: "department", department: "software" },
      },
      department: "software",
    });

    /* 部长也能切换部门（只读浏览），因此选择器与管理员同样是下拉 */
    expect(screen.getByLabelText("模板归属")).toHaveTextContent(
      "软件研发部（software）",
    );
    expect(
      screen.getByText(/本部门覆盖可编辑，其他部门只读浏览/),
    ).toBeInTheDocument();
    /* 没有本部门覆盖的模板回落全局默认，并按服务端 editable 标成只读 */
    expect(screen.getByText("全局默认（只读）")).toBeInTheDocument();
    expect(screen.getByText("本部门覆盖")).toBeInTheDocument();
    expect(screen.queryByText(/其他部门覆盖/)).toBeNull();
  });

  it("部长浏览其他部门时该部门覆盖标为其他部门覆盖且不给保存按钮", async () => {
    const user = userEvent.setup();
    renderSection({
      templateSettings: {
        rows: [createResultRow("recruitment.result.accepted", "media", false, true)],
        departments: ["software", "media"],
        scope: { kind: "department", department: "software" },
      },
      department: "media",
    });

    expect(screen.getByText("其他部门覆盖")).toBeInTheDocument();
    expect(screen.queryByText("本部门覆盖")).toBeNull();
    /* 卡片提示明确这是只读浏览，不是可保存的本部门覆盖 */
    expect(screen.getByText(/只读浏览「多媒体部」的覆盖/)).toBeInTheDocument();
    /* 只读浏览时连测试发送也隐藏：测试发送要按该部门写入投递记录 */
    expect(screen.queryByRole("button", { name: "测试发送" })).toBeNull();

    await openTemplateDialog(user, "多媒体部笔试通过结果通知");

    expect(
      await screen.findByText(/只读浏览其他部门的覆盖，保存与恢复按钮已隐藏/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /保存到/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /恢复为全局默认/ })).toBeNull();
  });

  it("管理员可以切换归属，并看到部门目录选项", () => {
    renderSection({
      templateSettings: {
        rows: [createResultRow("recruitment.result.accepted", null, true, false)],
        departments: ["software", "media"],
        scope: { kind: "all" },
      },
      department: null,
    });

    expect(screen.getByLabelText("模板归属")).toBeInTheDocument();
    expect(screen.getByText("全局默认")).toBeInTheDocument();
    expect(screen.getByText(/下拉来自 Link 部门目录与已有覆盖行/)).toBeInTheDocument();
    expect(
      screen.getByText(/当前编辑全局默认，未配置覆盖的部门都会用它。/),
    ).toBeInTheDocument();
  });

  it("部门账号的保存按钮写明写入本部门覆盖", async () => {
    const user = userEvent.setup();
    renderSection({
      templateSettings: {
        rows: [createResultRow("recruitment.result.accepted", null, false, false)],
        departments: ["software"],
        scope: { kind: "department", department: "software" },
      },
      department: "software",
    });

    await openTemplateDialog(user, "软件研发部笔试通过结果通知");

    expect(
      await screen.findByRole("button", { name: /保存到「软件研发部」/ }),
    ).toBeInTheDocument();
    /* 还没有本部门覆盖行，因此没有可恢复的覆盖 */
    expect(
      screen.queryByRole("button", { name: /恢复为全局默认/ }),
    ).toBeNull();
  });

  it("已有覆盖时提供恢复为全局默认并写回原归属", async () => {
    const user = userEvent.setup();
    const { resetEmailTemplateSetting } = jest.requireMock(
      "@/action/email/template",
    ) as { resetEmailTemplateSetting: jest.Mock };
    renderSection({
      templateSettings: {
        rows: [createResultRow("recruitment.result.rejected", "software", true, true)],
        departments: ["software"],
        scope: { kind: "department", department: "software" },
      },
      department: "software",
    });

    await openTemplateDialog(user, "软件研发部笔试不通过结果通知");
    await user.click(
      await screen.findByRole("button", { name: /恢复为全局默认/ }),
    );

    expect(resetEmailTemplateSetting).toHaveBeenCalledWith(
      "recruitment.result.rejected",
      "software",
    );
  });

  it("管理员在全局默认归属下可以恢复内置默认文案", async () => {
    const user = userEvent.setup();
    const { resetEmailTemplateSetting } = jest.requireMock(
      "@/action/email/template",
    ) as { resetEmailTemplateSetting: jest.Mock };
    renderSection({
      templateSettings: {
        rows: [createResultRow("recruitment.result.accepted", null, true, true)],
        departments: ["software"],
        scope: { kind: "all" },
      },
      department: null,
    });

    await openTemplateDialog(user, "笔试招新通过结果通知");
    await user.click(
      await screen.findByRole("button", { name: /恢复内置默认文案/ }),
    );

    expect(resetEmailTemplateSetting).toHaveBeenCalledWith(
      "recruitment.result.accepted",
      null,
    );
  });

  it("全局默认行不存在时不显示恢复按钮", async () => {
    const user = userEvent.setup();
    renderSection({
      templateSettings: {
        rows: [createResultRow("recruitment.result.accepted", null, true, false)],
        departments: [],
        scope: { kind: "all" },
      },
      department: null,
    });

    await openTemplateDialog(user, "笔试招新通过结果通知");

    expect(
      await screen.findByRole("button", { name: /保存到全局默认/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /恢复内置默认文案/ }),
    ).toBeNull();
  });

  it("部门面试模板可以查看并提交 QQ 群号", async () => {
    const user = userEvent.setup();
    const { updateEmailTemplateSetting } = jest.requireMock(
      "@/action/email/template",
    ) as { updateEmailTemplateSetting: jest.Mock };
    renderSection({
      templateSettings: {
        rows: [
          {
            ...createResultRow("office_round1.result.accepted", null, true, false),
            groupNumber: "123456789",
          },
        ],
        departments: [],
        scope: { kind: "all" },
      },
      department: null,
    });

    await openTemplateDialog(user, "部门面试一面通过通知");

    /* QQ 群号这类非视觉字段收在工具栏的「字段」里 */
    await user.click(screen.getByRole("button", { name: /^字段$/ }));
    const groupNumberInput = await screen.findByLabelText("QQ 群号");
    expect(groupNumberInput).toHaveValue("123456789");

    await user.clear(groupNumberInput);
    await user.type(groupNumberInput, "987654321");
    await user.click(screen.getByRole("button", { name: /保存到全局默认/ }));

    expect(updateEmailTemplateSetting).toHaveBeenCalledWith(
      "office_round1.result.accepted",
      expect.objectContaining({ groupNumber: "987654321" }),
      null,
    );
  });

  it("测试发送默认跟随当前流程类型：部门面试默认一面通过模板", async () => {
    const user = userEvent.setup();
    renderSection({
      templateSettings: {
        rows: [
          createResultRow("office_round1.result.accepted", null, true, false),
        ],
        departments: [],
        scope: { kind: "all" },
      },
      department: null,
      selectedFlowTitle: "2026 办公室面试 Demo",
      selectedFlowType: "office_interview",
    });

    /* 头部按钮（第一个）的默认模板跟随当前流程类型；卡片上的按钮仍默认各自的模板 */
    const [headerButton] = screen.getAllByRole("button", { name: "测试发送" });
    await user.click(headerButton);

    /* 之前默认永远是技术招新通过模板，办公部门测试出来的邮件样式不对 */
    expect(await screen.findByLabelText("模板")).toHaveValue(
      "office_round1.result.accepted",
    );
    expect(
      screen.getByText("当前流程：2026 办公室面试 Demo"),
    ).toBeInTheDocument();
    /* 选项按「结果通知 / 面试通知」分组，15 个模板里找起来不用翻列表 */
    expect(screen.getByRole("group", { name: "结果通知" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "面试通知" })).toBeInTheDocument();
  });

  it("办公部门的测试发送只列本部门用得到的模板", async () => {
    const user = userEvent.setup();
    renderSection({
      templateSettings: {
        rows: [
          createResultRow("office_round1.result.accepted", "office", true, true),
        ],
        departments: ["office", "software"],
        scope: { kind: "department", department: "office" },
      },
      department: "office",
    });

    const [headerButton] = screen.getAllByRole("button", { name: "测试发送" });
    await user.click(headerButton);

    const select = await screen.findByLabelText<HTMLSelectElement>("模板");
    /* 办公部门不该看到技术阶段（笔试/免试/WOC/SOC）和飞书日程类模板 */
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "office_round1.result.accepted",
    ]);
    /* 跟随流程类型的默认键被过滤掉时回落到第一个可选项，而不是留在列表之外 */
    expect(select).toHaveValue("office_round1.result.accepted");
  });

  it("技术部门的测试发送不列办公阶段模板", async () => {
    const user = userEvent.setup();
    renderSection({
      templateSettings: {
        rows: [
          createResultRow("recruitment.result.accepted", "software", true, true),
        ],
        departments: ["office", "software"],
        scope: { kind: "department", department: "software" },
      },
      department: "software",
      selectedFlowType: "recruitment",
    });

    const [headerButton] = screen.getAllByRole("button", { name: "测试发送" });
    await user.click(headerButton);

    const select = await screen.findByLabelText<HTMLSelectElement>("模板");
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "recruitment.result.accepted",
      "recruitment.result.rejected",
      "interview.schedule.created",
    ]);
    expect(select).toHaveValue("recruitment.result.accepted");
  });

  it("切换部门后已选模板被过滤掉时回落到默认键", async () => {
    const user = userEvent.setup();
    const props: SectionProps = {
      templateSettings: {
        rows: [
          createResultRow("office_round1.result.accepted", null, true, false),
        ],
        departments: ["office", "software"],
        scope: { kind: "all" },
      },
      department: null,
      selectedFlowType: "recruitment",
    };
    const { rerender } = renderSection(props);

    const [headerButton] = screen.getAllByRole("button", { name: "测试发送" });
    await user.click(headerButton);
    /* 全局范围（不过滤）下先选中一个办公模板 */
    await user.selectOptions(
      await screen.findByLabelText("模板"),
      "office_round1.result.accepted",
    );

    /* 切到技术部门：默认键没变，但选中的办公模板已被过滤出下拉，发送不能继续带它 */
    rerender(sectionElement({ ...props, department: "software" }));

    const rescopedSelect = await screen.findByLabelText<HTMLSelectElement>("模板");
    expect(
      Array.from(rescopedSelect.options).map((option) => option.value),
    ).not.toContain("office_round1.result.accepted");
    expect(rescopedSelect).toHaveValue("recruitment.result.accepted");
  });

  it("面试模板也在同一个画布上编辑：正文区块、外观与主题色一起保存", async () => {
    const user = userEvent.setup();
    renderSection({
      templateSettings: {
        rows: [],
        departments: [],
        scope: { kind: "all" },
      },
      interviewScheduleTemplates: {
        rows: [createInterviewRow("interview.schedule.created", null)],
        departments: [],
        scope: { kind: "all" },
      },
      department: null,
    });

    await user.click(screen.getByRole("button", { name: "编辑" }));

    /* 画布就是这封面试通知：状态徽章、日程卡、元信息都在上面 */
    expect(await screen.findByRole("textbox", { name: "邮件主标题" })).toBeInTheDocument();
    expect(screen.getByText("已预约")).toBeInTheDocument();
    expect(screen.getByText("{startsAt}")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-email-block]").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /外观与主题色/ }));
    await user.click(await screen.findByLabelText("主题色 科技蓝"));
    await user.click(screen.getByRole("button", { name: /保存到全局默认/ }));

    const call = (updateInterviewScheduleEmailTemplate as jest.Mock).mock.calls.at(-1);
    expect(call?.[0]).toBe("interview.schedule.created");
    expect(call?.[2]).toBe(null);
    expect(call?.[1].themeColor).toBe("#1d4ed8");
    expect(
      call?.[1].bodyBlocks.some((block: { type: string }) => block.type === "badge"),
    ).toBe(true);
    /* 页脚文案跟着外观字段一起提交 */
    expect(call?.[1].footerText).toBe("南京邮电大学大学生科学技术协会");
    expect(call?.[1].bodyFrame.footerText).toBe("南京邮电大学大学生科学技术协会");
  });

  it("不通过模板卡片用红色顶条，和通过模板一眼区分", () => {
    renderSection({
      templateSettings: {
        rows: [
          createResultRow("recruitment.result.accepted", null, true, false),
          createResultRow("recruitment.result.rejected", null, true, false),
        ],
        departments: [],
        scope: { kind: "all" },
      },
      department: null,
    });

    /* 通过 = 主色条，不通过 = 失败色条（同页还有其它模板卡片，逐卡断言） */
    const rejectedCard = screen.getByText("笔试招新不通过结果通知").closest(".group") as HTMLElement;
    expect(rejectedCard.querySelector(".bg-destructive\\/70")).not.toBeNull();
    expect(rejectedCard.querySelector(".bg-primary\\/60")).toBeNull();

    const acceptedCard = screen.getByText("笔试招新通过结果通知").closest(".group") as HTMLElement;
    expect(acceptedCard.querySelector(".bg-primary\\/60")).not.toBeNull();
    expect(acceptedCard.querySelector(".bg-destructive\\/70")).toBeNull();
  });

  it("正文在画布上就地编辑：内置版式直接长在邮件里，改完连着主题色一起保存", async () => {
    const user = userEvent.setup();
    renderSection({
      templateSettings: {
        rows: [createResultRow("recruitment.result.accepted", "software", true, true)],
        departments: ["software"],
        scope: { kind: "department", department: "software" },
      },
      department: "software",
    });

    await openTemplateDialog(user, "软件研发部笔试通过结果通知");

    /* 画布就是邮件本身：页眉标题、称呼、结果面板、结构卡片都在上面直接可编辑 */
    expect(
      await screen.findByRole("textbox", { name: "邮件主标题" }),
    ).toBeInTheDocument();
    expect(screen.getByText("亲爱的{name}同学，")).toBeInTheDocument();
    expect(screen.getByText("结果标签")).toBeInTheDocument();
    expect(screen.getByText(/【重要步骤】/)).toBeInTheDocument();
    /* 每个区块都是文档里的一个节点（拖拽与区块菜单由 TipTap 官方把手提供） */
    expect(document.querySelectorAll("[data-email-block]").length).toBeGreaterThan(0);

    /* 主题色在「外观与主题色」里 */
    await user.click(screen.getByRole("button", { name: /外观与主题色/ }));
    await user.click(await screen.findByLabelText("主题色 科技蓝"));

    await user.click(screen.getByRole("button", { name: /保存到「软件研发部」/ }));

    const call = (updateEmailTemplateSetting as jest.Mock).mock.calls.at(-1);
    expect(call?.[0]).toBe("recruitment.result.accepted");
    expect(call?.[2]).toBe("software");
    expect(call?.[1].themeColor).toBe("#1d4ed8");
    /* 保存的是画布上的区块：结果面板与结构卡片都在 */
    expect(
      call?.[1].bodyBlocks.some((block: { type: string }) => block.type === "resultPanel"),
    ).toBe(true);
    expect(
      call?.[1].bodyBlocks.some((block: { type: string }) => block.type === "card"),
    ).toBe(true);
  });

  it("关窗时若有未保存改动会先确认：继续编辑保留草稿，放弃修改丢掉草稿", async () => {
    const user = userEvent.setup();
    renderSection({
      templateSettings: {
        rows: [createResultRow("recruitment.result.accepted", "software", true, true)],
        departments: ["software"],
        scope: { kind: "department", department: "software" },
      },
      department: "software",
    });

    await openTemplateDialog(user, "软件研发部笔试通过结果通知");
    await screen.findByRole("textbox", { name: "邮件主标题" });

    /* 没有改动时关窗直接关，不打扰 */
    await user.keyboard("{Escape}");
    expect(screen.queryByText("还有未保存的改动")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "邮件主标题" })).toBeNull();

    /* 改了正文再关窗，先问一句 */
    await openTemplateDialog(user, "软件研发部笔试通过结果通知");
    await screen.findByRole("textbox", { name: "邮件主标题" });
    await user.click(screen.getByRole("button", { name: /^插入区块$/ }));
    await user.click(await screen.findByRole("menuitem", { name: /自定义 HTML/ }));
    await user.keyboard("{Escape}");

    expect(await screen.findByText("还有未保存的改动")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(screen.getByPlaceholderText(/<div style/)).toBeInTheDocument();

    /* 放弃修改并关闭：草稿回到保存时的样子，重新打开也看不到刚才那一块 */
    await user.keyboard("{Escape}");
    await user.click(await screen.findByRole("button", { name: "放弃修改并关闭" }));
    expect(screen.queryByPlaceholderText(/<div style/)).toBeNull();

    await openTemplateDialog(user, "软件研发部笔试通过结果通知");
    await screen.findByRole("textbox", { name: "邮件主标题" });
    expect(screen.queryByPlaceholderText(/<div style/)).toBeNull();
  });

  it("⌘/Ctrl+S 直接保存当前草稿，并清掉「未保存」提示", async () => {
    const user = userEvent.setup();
    renderSection({
      templateSettings: {
        rows: [createResultRow("recruitment.result.accepted", "software", true, true)],
        departments: ["software"],
        scope: { kind: "department", department: "software" },
      },
      department: "software",
    });

    await openTemplateDialog(user, "软件研发部笔试通过结果通知");
    await screen.findByRole("textbox", { name: "邮件主标题" });
    expect(screen.queryByText("有未保存的改动")).toBeNull();

    await user.click(screen.getByRole("button", { name: /^插入区块$/ }));
    await user.click(await screen.findByRole("menuitem", { name: /自定义 HTML/ }));
    expect(screen.getAllByText(/有未保存的改动/).length).toBeGreaterThan(0);

    (updateEmailTemplateSetting as jest.Mock).mockClear();
    await user.keyboard("{Control>}s{/Control}");

    const call = (updateEmailTemplateSetting as jest.Mock).mock.calls.at(-1);
    expect(call?.[0]).toBe("recruitment.result.accepted");
    expect(
      call?.[1].bodyBlocks.some((block: { type: string }) => block.type === "code"),
    ).toBe(true);
  });

  it("只读浏览其他部门时画布工具不可用", async () => {
    const user = userEvent.setup();
    renderSection({
      templateSettings: {
        rows: [createResultRow("recruitment.result.accepted", "media", false, true)],
        departments: ["software", "media"],
        scope: { kind: "department", department: "software" },
      },
      department: "media",
    });

    await openTemplateDialog(user, "多媒体部笔试通过结果通知");
    await screen.findByText(/只读浏览其他部门的覆盖，保存与恢复按钮已隐藏/);

    /* 正文照常渲染出来，但「插入区块 / 插入样式 / 存为版式 / 恢复内置版式」全部禁用 */
    expect(document.querySelectorAll("[data-email-block]").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^插入区块$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^插入样式$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^存为版式$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /恢复内置版式/ })).toBeDisabled();
  });

  it("可以从工具栏往画布里加一个自定义 HTML 区块", async () => {
    const user = userEvent.setup();
    renderSection({
      templateSettings: {
        rows: [createResultRow("recruitment.result.accepted", "software", true, true)],
        departments: ["software"],
        scope: { kind: "department", department: "software" },
      },
      department: "software",
    });

    await openTemplateDialog(user, "软件研发部笔试通过结果通知");
    await screen.findByRole("textbox", { name: "邮件主标题" });

    await user.click(screen.getByRole("button", { name: /^插入区块$/ }));
    await user.click(await screen.findByRole("menuitem", { name: /自定义 HTML/ }));

    expect(screen.getByPlaceholderText(/<div style/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /保存到「软件研发部」/ }));
    const call = (updateEmailTemplateSetting as jest.Mock).mock.calls.at(-1);
    expect(
      call?.[1].bodyBlocks.some((block: { type: string }) => block.type === "code"),
    ).toBe(true);
  });
});