import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ResultEmailTemplateSettingRow } from "@/action/email/template";
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
}));

jest.mock("@/action/email/interview-template", () => ({
  updateInterviewScheduleEmailTemplate: jest.fn().mockResolvedValue({ ok: true }),
  resetInterviewScheduleEmailTemplate: jest.fn().mockResolvedValue({ ok: true }),
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
  };
}

const emptyInterviewSettings: InterviewScheduleTemplateSettingsPayload = {
  rows: [],
  departments: [],
  scope: { kind: "department", department: "software" },
};

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
] as unknown as EmailTemplateDefinition[];

function renderSection({
  templateSettings,
  department,
  onDepartmentChange = jest.fn(),
}: {
  templateSettings: TemplateSettingsResult;
  department: string | null;
  onDepartmentChange?: (department: string | null) => void;
}) {
  return render(
    <EmailTemplateManagementSection
      templateSettings={templateSettings}
      resultEmailPreviews={{}}
      interviewScheduleTemplates={emptyInterviewSettings}
      interviewSchedulePreviews={{} as InterviewSchedulePreviews}
      templateDefinitions={templateDefinitions}
      department={department}
      onDepartmentChange={onDepartmentChange}
    />,
  );
}

describe("EmailTemplateManagementSection", () => {
  it("部门账号看到本部门归属与只读的全局默认回落", () => {
    renderSection({
      templateSettings: {
        rows: [
          createResultRow("recruitment.result.accepted", null, false, false),
          createResultRow("recruitment.result.rejected", "software", true, true),
        ],
        departments: ["software"],
        scope: { kind: "department", department: "software" },
      },
      department: "software",
    });

    expect(
      screen.getByText("本部门覆盖：软件研发部（software）"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/未配置时回落全局默认/),
    ).toBeInTheDocument();
    /* 没有本部门覆盖的模板回落全局默认，并按服务端 editable 标成只读 */
    expect(screen.getByText("全局默认（只读）")).toBeInTheDocument();
    expect(screen.getByText("本部门覆盖")).toBeInTheDocument();
    expect(screen.queryByText(/其他部门覆盖/)).toBeNull();
    expect(screen.queryByLabelText("模板归属")).toBeNull();
  });

  it("管理员可以切换归属，并看到已配置过覆盖的部门", () => {
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
    expect(screen.getByText(/已配置过覆盖的部门：/)).toHaveTextContent(
      "已配置过覆盖的部门：软件研发部（software）、多媒体部（media）。",
    );
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

    await user.click(screen.getByRole("button", { name: "招新通过模板" }));

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

    await user.click(screen.getByRole("button", { name: "招新不通过模板" }));
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

    await user.click(screen.getByRole("button", { name: "招新通过模板" }));
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

    await user.click(screen.getByRole("button", { name: "招新通过模板" }));

    expect(
      await screen.findByRole("button", { name: /保存到全局默认/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /恢复内置默认文案/ }),
    ).toBeNull();
  });

  it("办公类模板可以查看并提交 QQ 群号", async () => {
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

    await user.click(screen.getByRole("button", { name: "办公类一面通过模板" }));

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
});