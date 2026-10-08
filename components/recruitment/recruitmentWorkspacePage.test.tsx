jest.mock("server-only", () => ({}));

import { render, screen } from "@testing-library/react";

import { RecruitmentWorkspacePage } from "./recruitmentWorkspacePage";

const mockCookiesGet = jest.fn();
jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: mockCookiesGet })),
}));

const mockFlowRows: Array<Record<string, unknown>> = [];
jest.mock("@/db/drizzle", () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => Promise.resolve(mockFlowRows)),
        })),
      })),
    })),
  },
}));

jest.mock("@/lib/dal", () => ({
  verifySession: jest.fn(async () => ({ role: 3, uid: 7, name: "部长甲" })),
}));

jest.mock("@/lib/authz", () => ({
  getDepartmentScope: jest.fn(async () => ({ kind: "all" })),
}));

jest.mock("@/action/user-flow/evaluation", () => ({
  getEvaluationCandidates: jest.fn(async () => []),
}));

jest.mock("@/action/user-flow/user-point/calScore", () => ({
  calScore: jest.fn(async () => []),
}));

jest.mock("@/components/route", () => ({
  PageTitle: () => <h1>面试管理</h1>,
}));

jest.mock("@/components/recruitment/recruitmentContent", () => ({
  RecruitmentContent: ({ defaultFlowId }: { defaultFlowId?: string }) => (
    <output data-testid="default-flow">{defaultFlowId ?? ""}</output>
  ),
}));

const flowRow = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  title: `流程 ${id}`,
  type: "recruitment_exemption",
  groupOptions: null,
  department: "software",
  slotOptions: null,
  ...overrides,
});

const renderWorkspace = async (searchParams: Record<string, string> = {}) =>
  render(
    await RecruitmentWorkspacePage({
      mode: "interview",
      searchParams: Promise.resolve(searchParams),
    }),
  );

describe("RecruitmentWorkspacePage default flow", () => {
  beforeEach(() => {
    mockFlowRows.length = 0;
    /* 服务端排序是 createdAt 倒序：首条即最新流程 */
    mockFlowRows.push(flowRow(21), flowRow(22));
    mockCookiesGet.mockReturnValue(undefined);
  });

  it("falls back to the newest flow when nothing is remembered", async () => {
    await renderWorkspace();

    expect(screen.getByTestId("default-flow")).toHaveTextContent("21");
  });

  it("opens the flow the user last used instead of the newest", async () => {
    mockCookiesGet.mockReturnValue({ value: "22" });

    await renderWorkspace();

    expect(screen.getByTestId("default-flow")).toHaveTextContent("22");
    /* 记忆按工作台分开：面试管理只读面试的 Cookie */
    expect(mockCookiesGet).toHaveBeenCalledWith("people_workspace_flow_interview");
  });

  it("keeps an explicit flowId link ahead of the remembered flow", async () => {
    mockCookiesGet.mockReturnValue({ value: "22" });

    await renderWorkspace({ flowId: "21" });

    expect(screen.getByTestId("default-flow")).toHaveTextContent("21");
  });

  it("ignores a remembered flow that the session cannot see", async () => {
    mockCookiesGet.mockReturnValue({ value: "999" });

    await renderWorkspace();

    expect(screen.getByTestId("default-flow")).toHaveTextContent("21");
  });
});
