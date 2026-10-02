/** @jest-environment node */

jest.mock("server-only", () => ({}));

const mockGetSession: jest.Mock = jest.fn();
const mockWriteViewAsCookie: jest.Mock = jest.fn(async () => undefined);
const mockWriteOperationAudit: jest.Mock = jest.fn(async () => undefined);
const mockRevalidatePath: jest.Mock = jest.fn();

jest.mock("@/lib/session", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  writeViewAsCookie: (...args: unknown[]) => mockWriteViewAsCookie(...args),
}));

jest.mock("@/lib/operation-audit", () => ({
  writeOperationAudit: (...args: unknown[]) => mockWriteOperationAudit(...args),
}));

jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

import { startViewAs, stopViewAs } from "./view-as";

const adminSession = { uid: 42, name: "Admin", realRole: 4, role: 4 };

const resetMocks = () => {
  mockGetSession.mockReset();
  mockWriteViewAsCookie.mockClear();
  mockWriteOperationAudit.mockClear();
  mockRevalidatePath.mockClear();
  mockGetSession.mockResolvedValue(adminSession);
};

describe("startViewAs", () => {
  beforeEach(resetMocks);

  it("非管理员不可切换身份", async () => {
    mockGetSession.mockResolvedValue({ uid: 7, name: "Manager", realRole: 3, role: 3 });

    await expect(
      startViewAs({ role: 1, department: "software" }),
    ).rejects.toThrow("只有管理员可以切换身份查看");
    expect(mockWriteViewAsCookie).not.toHaveBeenCalled();
  });

  it("会话已失效时拒绝", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(
      startViewAs({ role: 1, department: "software" }),
    ).rejects.toThrow("会话已失效，请重新登录");
  });

  it("拒绝越界角色", async () => {
    await expect(
      startViewAs({ role: 5, department: "software" }),
    ).rejects.toThrow("身份不合法");
    expect(mockWriteViewAsCookie).not.toHaveBeenCalled();
  });

  it("需要部门的角色必须选部门", async () => {
    await expect(startViewAs({ role: 3, department: null })).rejects.toThrow(
      "请选择要查看的部门",
    );
    expect(mockWriteViewAsCookie).not.toHaveBeenCalled();
  });

  it("办公部门没有讲师这一级", async () => {
    await expect(startViewAs({ role: 2, department: "office" })).rejects.toThrow(
      "办公部门没有讲师身份，请选择部员或部长",
    );
    expect(mockWriteViewAsCookie).not.toHaveBeenCalled();
  });

  it("切回管理员时清掉临时视角 cookie，部门视角被忽略", async () => {
    await startViewAs({ role: 4, department: "software" });

    expect(mockWriteViewAsCookie).toHaveBeenCalledWith(null);
    expect(mockWriteOperationAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 42,
        actorRole: 4,
        action: "session.view-as.start",
        department: null,
        metadata: { role: 4, department: null },
      }),
    );
  });

  it("以技术部门部长身份写入视角 cookie 与审计行", async () => {
    await startViewAs({ role: 3, department: "software" });

    expect(mockWriteViewAsCookie).toHaveBeenCalledWith({
      role: 3,
      department: "software",
    });
    expect(mockWriteOperationAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 42,
        actorRole: 4,
        action: "session.view-as.start",
        resourceType: "session",
        resourceId: 42,
        department: "software",
        metadata: { role: 3, department: "software" },
      }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });
});

describe("stopViewAs", () => {
  beforeEach(resetMocks);

  it("非管理员不可退出切换", async () => {
    mockGetSession.mockResolvedValue({ uid: 7, name: "Member", realRole: 2, role: 2 });

    await expect(stopViewAs()).rejects.toThrow("只有管理员可以退出切换身份");
    expect(mockWriteViewAsCookie).not.toHaveBeenCalled();
  });

  it("管理员退出切换：清 cookie 并记录审计", async () => {
    await stopViewAs();

    expect(mockWriteViewAsCookie).toHaveBeenCalledWith(null);
    expect(mockWriteOperationAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 42,
        actorRole: 4,
        action: "session.view-as.stop",
      }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("没有会话时是空操作", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(stopViewAs()).resolves.toBeUndefined();
    expect(mockWriteViewAsCookie).not.toHaveBeenCalled();
  });
});
