jest.mock("./message", () => ({
  sendFeishuCardMessage: jest.fn(),
}));

import {
  buildFeishuApprovalCard,
  sendFeishuApprovalCard,
} from "./approval-notification";

const { sendFeishuCardMessage } = jest.requireMock("./message") as {
  sendFeishuCardMessage: jest.Mock;
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

    const rendered = JSON.stringify(card);
    expect(rendered.match(/2026-08-25 08:30/g) ?? []).toHaveLength(1);
    expect(rendered).not.toContain("2026-08-25 16:30");
  });

  it("sends a new card for every evaluation revision", async () => {
    sendFeishuCardMessage
      .mockResolvedValueOnce({ messageId: "om_original" })
      .mockResolvedValueOnce({ messageId: "om_revision" });

    await expect(sendFeishuApprovalCard({
      chatId: "oc_test",
      context,
    })).resolves.toEqual({ messageId: "om_original" });

    await expect(sendFeishuApprovalCard({
      chatId: "oc_test",
      context: {
        ...context,
        messageId: "om_original",
        updatedAt: new Date("2026-08-24T17:00:00.000Z"),
      },
    })).resolves.toEqual({ messageId: "om_revision" });

    expect(sendFeishuCardMessage).toHaveBeenCalledTimes(2);
    expect(sendFeishuCardMessage.mock.calls[0][0].uuid).not.toBe(
      sendFeishuCardMessage.mock.calls[1][0].uuid,
    );
  });
});
