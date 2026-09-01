jest.mock("./message", () => ({
  sendFeishuCardMessage: jest.fn(),
  updateFeishuCardMessage: jest.fn(),
}));

import {
  buildFeishuApprovalCard,
  sendOrUpdateFeishuApprovalCard,
} from "./approval-notification";

const { sendFeishuCardMessage, updateFeishuCardMessage } = jest.requireMock("./message") as {
  sendFeishuCardMessage: jest.Mock;
  updateFeishuCardMessage: jest.Mock;
};

describe("buildFeishuApprovalCard", () => {
  const context = {
    evaluationId: 1,
    candidateName: "测试同学",
    candidateStudentId: "B260001",
    authorName: "测试讲师",
    flowTitle: "2026 免试招新",
    recommendation: "passed" as const,
    content: "面评全文",
    portfolioDescription: "作品简介",
    portfolioLink: "https://portfolio.example.com",
    meetingLink: "https://meeting.example.com",
    minuteLink: "https://minute.example.com",
    submittedAt: new Date("2026-08-24T16:30:00.000Z"),
    updatedAt: new Date("2026-08-24T16:30:00.000Z"),
  };

  it("renders the same review references as the approval page", () => {
    const card = buildFeishuApprovalCard(context);
    const elements = card.body.elements as Array<Record<string, unknown>>;
    const referenceBlock = elements.find((element) => (
      element.tag === "markdown"
      && typeof element.content === "string"
      && element.content.includes("相关资料")
    ));

    expect(referenceBlock).toMatchObject({
      content: "**相关资料**\n[作品](https://portfolio.example.com) · [会议](https://meeting.example.com) · [妙记](https://minute.example.com)",
    });
  });

  it("shows Beijing submission and update times after an evaluation changes", () => {
    const card = buildFeishuApprovalCard({
      ...context,
      updatedAt: new Date("2026-08-24T17:00:00.000Z"),
    });

    expect(card.header.title.content).toBe("面评已更新，待终审");
    expect(JSON.stringify(card)).toContain("2026-08-25 00:30");
    expect(JSON.stringify(card)).toContain("2026-08-25 01:00");
  });

  it("renders an absolute submission instant exactly once in Beijing time", () => {
    const card = buildFeishuApprovalCard({
      ...context,
      submittedAt: new Date("2026-08-25T00:30:00.000Z"),
      updatedAt: new Date("2026-08-25T00:30:00.000Z"),
    });

    expect(JSON.stringify(card)).toContain("2026-08-25 08:30");
    expect(JSON.stringify(card)).not.toContain("2026-08-25 16:30");
  });

  it("creates once and then updates the original card", async () => {
    sendFeishuCardMessage.mockResolvedValue({ messageId: "om_original" });

    await expect(sendOrUpdateFeishuApprovalCard({
      chatId: "oc_test",
      context,
    })).resolves.toEqual({ messageId: "om_original", updated: false });

    await expect(sendOrUpdateFeishuApprovalCard({
      chatId: "oc_test",
      context: { ...context, messageId: "om_original" },
    })).resolves.toEqual({ messageId: "om_original", updated: true });

    expect(sendFeishuCardMessage).toHaveBeenCalledTimes(1);
    expect(updateFeishuCardMessage).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "om_original",
    }));
  });
});
