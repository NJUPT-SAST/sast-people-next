import { listLinkUsers } from "@/lib/link/admin";

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
});
