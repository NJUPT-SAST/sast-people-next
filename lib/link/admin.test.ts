import {
  getLinkUsersByIds,
  listLinkUsers,
  updateLinkUserRoles,
} from "@/lib/link/admin";

describe("Link admin client", () => {
  it("uses the backend's student_id filter and omits unsupported filters", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
        {
          ok: true,
          json: async () => ({
            code: 0,
            message: "ok",
            data: { users: [], total: 0, page: 1, page_size: 20 },
          }),
        },
      );

    global.fetch = fetchMock as typeof fetch;
    process.env.LINK_API_BASE_URL = "https://link.example/v2";
    process.env.LINK_USE_MOCK = "false";
    await listLinkUsers("access-token", {
      page: 2,
      pageSize: 20,
      department: "software",
      studentId: "B24040001",
      keyword: "张三",
    });

    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      "https://link.example/v2/admin/users?page=2&page_size=20&department=software&student_id=B24040001&keyword=%E5%BC%A0%E4%B8%89",
    );
  });

  it("uses the batch detail endpoint with the requested IDs", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, message: "ok", data: { users: [] } }),
    });
    global.fetch = fetchMock as typeof fetch;
    process.env.LINK_API_BASE_URL = "https://link.example/v2";
    process.env.LINK_USE_MOCK = "false";

    await getLinkUsersByIds("access-token", [8, 4, 8]);

    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      "https://link.example/v2/admin/users/batch?ids=8%2C4%2C8",
    );
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("uses the batch role endpoint and returns per-user results", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        message: "ok",
        data: {
          results: [
            { id: 8, success: true, role: "member" },
            { id: 4, success: false, reason: "用户已注销，请先恢复后再编辑" },
          ],
        },
      }),
    });
    global.fetch = fetchMock as typeof fetch;
    process.env.LINK_API_BASE_URL = "https://link.example/v2";
    process.env.LINK_USE_MOCK = "false";

    await expect(updateLinkUserRoles("access-token", [8, 4], "member")).resolves.toEqual({
      results: [
        { id: 8, success: true, role: "member" },
        { id: 4, success: false, reason: "用户已注销，请先恢复后再编辑" },
      ],
    });
    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      "https://link.example/v2/admin/users",
    );
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ ids: [8, 4], role: "member" }),
      }),
    );
  });
});
