import {
  buildCustomEmailRecipients,
  hasMeaningfulEmailBody,
  normalizeCustomEmailSubject,
  normalizeManualAddresses,
  normalizeRecipientUserIds,
  parseCustomEmailSchedule,
} from "./custom-message-helpers";

describe("custom email helpers", () => {
  describe("normalizeCustomEmailSubject", () => {
    it("strips CR/LF so a subject cannot inject headers", () => {
      expect(normalizeCustomEmailSubject("  hello\r\nBcc: x@example.com  ")).toBe(
        "hello Bcc: x@example.com",
      );
    });
  });

  describe("normalizeManualAddresses", () => {
    it("trims, rejects invalid addresses and dedupes case-insensitively", () => {
      expect(
        normalizeManualAddresses([
          "  A@example.com ",
          "a@example.com",
          "not-an-email",
          "b@example.com",
        ]),
      ).toEqual(["A@example.com", "b@example.com"]);
    });

    it("caps the number of manual addresses", () => {
      const addresses = Array.from(
        { length: 150 },
        (_, index) => `user${index}@example.com`,
      );
      expect(normalizeManualAddresses(addresses)).toHaveLength(100);
    });
  });

  describe("normalizeRecipientUserIds", () => {
    it("keeps positive integer ids once and drops invalid values", () => {
      expect(
        normalizeRecipientUserIds([3, 3, 0, -1, 2.5, Number.NaN, 7]),
      ).toEqual([3, 7]);
    });
  });

  describe("hasMeaningfulEmailBody", () => {
    it("rejects empty rich text documents", () => {
      expect(hasMeaningfulEmailBody("<p></p>")).toBe(false);
      expect(hasMeaningfulEmailBody("<p>&nbsp;</p>")).toBe(false);
    });

    it("accepts text and image-only bodies", () => {
      expect(hasMeaningfulEmailBody("<p>你好</p>")).toBe(true);
      expect(hasMeaningfulEmailBody('<p><img src="https://example.com/a.png"></p>')).toBe(
        true,
      );
    });
  });

  describe("buildCustomEmailRecipients", () => {
    it("skips users without email and dedupes Link users against manual addresses", () => {
      const result = buildCustomEmailRecipients({
        users: [
          {
            id: 1,
            name: "张三",
            studentId: "B001",
            email: "zhangsan@example.com",
            department: "software",
          },
          {
            id: 2,
            name: "李四",
            studentId: null,
            email: null,
            department: "media",
          },
          {
            id: 3,
            name: "王五",
            studentId: "B003",
            email: "ZHANGSAN@example.com",
            department: null,
          },
        ],
        manualAddresses: ["zhangsan@example.com", "external@example.com"],
      });

      expect(result.missingEmailUserIds).toEqual([2]);
      expect(result.recipients).toEqual([
        {
          userId: 1,
          address: "zhangsan@example.com",
          name: "张三",
          studentId: "B001",
          department: "software",
        },
        {
          userId: null,
          address: "external@example.com",
          name: null,
          studentId: null,
          department: null,
        },
      ]);
    });
  });

  describe("parseCustomEmailSchedule", () => {
    it("parses Beijing wall-clock time into an absolute instant", () => {
      expect(
        parseCustomEmailSchedule(
          "2026-11-01T08:30",
          new Date("2026-10-31T00:00:00.000Z"),
        ).toISOString(),
      ).toBe("2026-11-01T00:30:00.000Z");
    });

    it("rejects invalid and past times", () => {
      expect(() =>
        parseCustomEmailSchedule("2026-02-30T08:30", new Date()),
      ).toThrow("定时发送时间格式不正确");
      expect(() =>
        parseCustomEmailSchedule(
          "2026-10-31T07:59",
          new Date("2026-10-31T00:00:00.000Z"),
        ),
      ).toThrow("定时发送时间必须晚于当前时间");
      expect(() => parseCustomEmailSchedule("", new Date())).toThrow(
        "请选择定时发送时间",
      );
    });
  });
});