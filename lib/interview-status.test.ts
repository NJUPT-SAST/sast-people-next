import {
  countInterviewStatuses,
  deriveInterviewActions,
  getInterviewStatus,
  INTERVIEW_STATUS_ORDER,
  interviewStatusMeta,
  type InterviewCandidateLike,
} from "./interview-status";

const NOW = Date.parse("2026-09-26T10:00:00+08:00");
const PAST = "2026-09-26T09:00:00+08:00";
const FUTURE = "2026-09-26T12:00:00+08:00";

function candidate(
  overrides: Partial<InterviewCandidateLike> = {},
): InterviewCandidateLike {
  return {
    status: "ongoing",
    evalStatus: null,
    scheduleMeetingLink: null,
    scheduleMeetingStatus: null,
    scheduleStartsAt: null,
    scheduleOrganizerName: null,
    canManageSchedule: true,
    canEditEvaluation: true,
    ...overrides,
  };
}

/** A candidate whose interview is booked but not finished yet. */
function scheduled(overrides: Partial<InterviewCandidateLike> = {}) {
  return candidate({
    scheduleMeetingLink: "https://example.com/meeting",
    scheduleMeetingStatus: "scheduled",
    scheduleStartsAt: FUTURE,
    scheduleOrganizerName: "钱老师",
    ...overrides,
  });
}

/** A candidate whose interview has finished and has no evaluation yet. */
function ended(overrides: Partial<InterviewCandidateLike> = {}) {
  return candidate({
    scheduleMeetingLink: "https://example.com/meeting",
    scheduleMeetingStatus: "ended",
    scheduleStartsAt: PAST,
    scheduleOrganizerName: "钱老师",
    ...overrides,
  });
}

describe("getInterviewStatus", () => {
  it("treats a withdrawn candidate as withdrawn even when also approved", () => {
    expect(
      getInterviewStatus(
        candidate({ status: "withdrawn", evalStatus: "approved" }),
      ),
    ).toBe("withdrawn");
  });

  it("lets an explicit evaluation status outrank the flow status", () => {
    expect(
      getInterviewStatus(candidate({ status: "ongoing", evalStatus: "approved" })),
    ).toBe("accepted");
    expect(
      getInterviewStatus(candidate({ status: "ongoing", evalStatus: "rejected" })),
    ).toBe("rejected");
    expect(
      getInterviewStatus(candidate({ status: "ongoing", evalStatus: "submitted" })),
    ).toBe("pending");
    expect(
      getInterviewStatus(candidate({ status: "ongoing", evalStatus: "returned" })),
    ).toBe("returned");
  });

  it("maps a passed or failed flow status when there is no evaluation", () => {
    expect(getInterviewStatus(candidate({ status: "passed" }))).toBe("accepted");
    expect(getInterviewStatus(candidate({ status: "failed" }))).toBe("rejected");
  });

  it("walks unscheduled to scheduled to ready using the booking", () => {
    expect(getInterviewStatus(candidate())).toBe("unscheduled");
    expect(getInterviewStatus(scheduled())).toBe("scheduled");
    expect(getInterviewStatus(ended())).toBe("ready");
  });
});

describe("interviewStatusMeta tones", () => {
  it("keeps in-progress states neutral and fills only outcomes and exceptions", () => {
    // A column of these fills turns into a rainbow with no entry point, so the
    // states a candidate merely passes through must stay quiet.
    expect(interviewStatusMeta.unscheduled.tone).toBe("neutral");
    expect(interviewStatusMeta.scheduled.tone).toBe("neutral");
    expect(interviewStatusMeta.ready.tone).toBe("neutral");
    expect(interviewStatusMeta.withdrawn.tone).toBe("muted");

    expect(interviewStatusMeta.returned.tone).toBe("attention");
    expect(interviewStatusMeta.pending.tone).toBe("attention");
    expect(interviewStatusMeta.accepted.tone).toBe("success");
    expect(interviewStatusMeta.rejected.tone).toBe("danger");
  });

  it("builds every active badge from the same tint recipe", () => {
    // One fill alpha, one border alpha, one text step per theme, across all
    // seven coloured statuses.
    const coloured = INTERVIEW_STATUS_ORDER.filter((key) => key !== "withdrawn");
    for (const key of coloured) {
      const className = interviewStatusMeta[key].badgeClassName;
      expect(className).toMatch(/\bbg-[a-z]+-500\/1[05]\b/);
      expect(className).toMatch(/\bborder-[a-z]+-500\/[34]0\b/);
      expect(className).toMatch(/\btext-[a-z]+-800\b/);
      expect(className).toMatch(/\bdark:text-[a-z]+-300\b/);
      // No hand-matched light-mode solid left behind.
      expect(className).not.toMatch(/\bbg-[a-z]+-50\b/);
      expect(className).not.toMatch(/\bdark:bg-/);
    }
  });

  it("gives each coloured status its own hue", () => {
    const hues = INTERVIEW_STATUS_ORDER.filter((key) => key !== "withdrawn").map(
      (key) => interviewStatusMeta[key].badgeClassName.match(/\bbg-([a-z]+)-500/)?.[1],
    );
    expect(new Set(hues).size).toBe(hues.length);
  });
});

describe("countInterviewStatuses", () => {
  it("counts every candidate into exactly one bucket", () => {
    const rows = [
      candidate(),
      scheduled(),
      ended(),
      candidate({ evalStatus: "submitted" }),
      candidate({ evalStatus: "returned" }),
      candidate({ evalStatus: "approved" }),
      candidate({ status: "withdrawn" }),
    ];

    const counts = countInterviewStatuses(rows);
    const sum = INTERVIEW_STATUS_ORDER.reduce(
      (total, key) => total + counts[key],
      0,
    );

    expect(counts.total).toBe(rows.length);
    expect(sum).toBe(rows.length);
  });

  it("buckets a failed flow status as rejected instead of dropping it", () => {
    // Regression: the old toolbar summary had no `rejected` entry, so these
    // candidates were counted but never displayed, making the numbers not add up.
    const counts = countInterviewStatuses([
      candidate({ status: "failed" }),
      candidate({ status: "failed" }),
      candidate({ evalStatus: "rejected" }),
    ]);

    expect(counts.rejected).toBe(3);
    expect(counts.total).toBe(3);
  });
});

describe("deriveInterviewActions", () => {
  it("offers booking as the primary action before a slot exists", () => {
    const plan = deriveInterviewActions(candidate(), 2, NOW);

    expect(plan.status).toBe("unscheduled");
    expect(plan.primary).toEqual({ id: "schedule", label: "预约" });
    expect(plan.overflow).toEqual([
      { id: "return", label: "退回", destructive: true },
    ]);
    expect(plan.lockedReason).toBeNull();
  });

  it("offers rescheduling as the primary action before the interview starts", () => {
    const plan = deriveInterviewActions(scheduled(), 2, NOW);

    expect(plan.primary).toEqual({ id: "schedule", label: "改约" });
    expect(plan.overflow).toEqual([
      { id: "cancel-schedule", label: "取消预约", destructive: true },
      { id: "return", label: "退回", destructive: true },
    ]);
  });

  it("promotes confirming the end once the start time has passed", () => {
    const plan = deriveInterviewActions(
      scheduled({ scheduleStartsAt: PAST }),
      2,
      NOW,
    );

    expect(plan.primary).toEqual({ id: "confirm-ended", label: "确认结束" });
    expect(plan.overflow).toEqual([
      { id: "schedule", label: "改约" },
      { id: "cancel-schedule", label: "取消预约", destructive: true },
      { id: "return", label: "退回", destructive: true },
    ]);
  });

  it("never offers confirming the end before the clock has been measured", () => {
    const plan = deriveInterviewActions(
      scheduled({ scheduleStartsAt: PAST }),
      2,
      null,
    );

    expect(plan.primary).toEqual({ id: "schedule", label: "改约" });
    expect(plan.overflow).not.toContainEqual(
      expect.objectContaining({ id: "confirm-ended" }),
    );
  });

  it("keeps rescheduling reachable while an evaluation is outstanding", () => {
    const plan = deriveInterviewActions(ended(), 2, NOW);

    expect(plan.status).toBe("ready");
    expect(plan.primary).toEqual({ id: "evaluation", label: "填写面评" });
    expect(plan.overflow).toEqual([{ id: "schedule", label: "改约" }]);
    expect(plan.lockedReason).toBeNull();
  });

  it("names the organiser when the evaluation is not this user's to write", () => {
    const plan = deriveInterviewActions(
      ended({ canManageSchedule: false, canEditEvaluation: false }),
      2,
      NOW,
    );

    expect(plan.primary).toBeNull();
    expect(plan.overflow).toEqual([]);
    expect(plan.lockedReason).toBe("由 钱老师 预约，待其提交面评");
  });

  it("names the organiser when a lecturer may not touch another's booking", () => {
    const plan = deriveInterviewActions(
      scheduled({ canManageSchedule: false, canEditEvaluation: false }),
      2,
      NOW,
    );

    expect(plan.primary).toBeNull();
    expect(plan.overflow).toEqual([]);
    expect(plan.lockedReason).toBe("由 钱老师 预约，仅其本人可操作");
  });

  it("keeps a destructive-only row unannounced", () => {
    const plan = deriveInterviewActions(
      scheduled({ canManageSchedule: false, canEditEvaluation: false }),
      3,
      NOW,
    );

    // 退回 is the only thing an admin can do here, but it is an escape hatch
    // rather than the next step, so it stays in the menu and the row shows the
    // generic label instead of advertising itself in red.
    expect(plan.primary).toBeNull();
    expect(plan.overflow).toEqual([
      { id: "return", label: "退回", destructive: true },
    ]);
    expect(plan.lockedReason).toBeNull();
  });

  it("keeps two or more secondary actions behind the menu", () => {
    const plan = deriveInterviewActions(
      scheduled({ scheduleStartsAt: PAST }),
      2,
      NOW,
    );

    expect(plan.primary).toEqual({ id: "confirm-ended", label: "确认结束" });
    expect(plan.overflow).toHaveLength(3);
  });

  it("says nothing when a note would only restate the badge", () => {
    // 待终审 and 退回重写 already say this in the status column, so the action
    // column stays empty rather than repeating it in words.
    for (const evalStatus of ["submitted", "returned"] as const) {
      for (const role of [2, 3]) {
        const plan = deriveInterviewActions(
          ended({
            evalStatus,
            canManageSchedule: false,
            canEditEvaluation: false,
          }),
          role,
          NOW,
        );
        expect(plan.primary).toBeNull();
        expect(plan.overflow).toEqual([]);
        expect(plan.lockedReason).toBeNull();
      }
    }
  });

  it("lets the author rewrite a returned evaluation", () => {
    const plan = deriveInterviewActions(
      ended({ evalStatus: "returned", canEditEvaluation: true }),
      2,
      NOW,
    );

    expect(plan.primary).toEqual({ id: "evaluation", label: "重写面评" });
    expect(plan.overflow).toEqual([]);
    expect(plan.lockedReason).toBeNull();
  });

  it("leaves decided and failed candidates with no action and no note", () => {
    // A note here only restated the status badge in the next column.
    for (const evalStatus of ["approved", "rejected"] as const) {
      const plan = deriveInterviewActions(ended({ evalStatus }), 3, NOW);
      expect(plan.primary).toBeNull();
      expect(plan.overflow).toEqual([]);
      expect(plan.lockedReason).toBeNull();
    }

    const failed = deriveInterviewActions(candidate({ status: "failed" }), 3, NOW);
    expect(failed.primary).toBeNull();
    expect(failed.lockedReason).toBeNull();
  });

  it("leaves a withdrawn row with no actions and no permission excuse", () => {
    const plan = deriveInterviewActions(
      candidate({
        status: "withdrawn",
        canManageSchedule: false,
        canEditEvaluation: false,
      }),
      2,
      NOW,
    );

    expect(plan.primary).toBeNull();
    expect(plan.overflow).toEqual([]);
    expect(plan.lockedReason).toBeNull();
  });

  it("falls back to an anonymous excuse when the organiser is unknown", () => {
    const plan = deriveInterviewActions(
      scheduled({
        scheduleOrganizerName: null,
        canManageSchedule: false,
        canEditEvaluation: false,
      }),
      2,
      NOW,
    );

    expect(plan.lockedReason).toBe("仅预约讲师可操作");
  });
});
