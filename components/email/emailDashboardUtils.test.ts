import {
  getEducationEmailLabel,
  getEmailPreflight,
  getQueueableEmailRecipients,
  getRemainingEmailRecipients,
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
