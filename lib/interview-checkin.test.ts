import {
  canTransitionCheckin,
  checkinActionsFor,
  checkinBlockNote,
  checkinSkipNote,
  compareCheckinQueue,
  countCheckinQueue,
  formatQueueNo,
  interviewCheckinStatusMeta,
  interviewStationStatusLabel,
  isActiveCheckin,
  isAutoCallable,
  isStationActive,
  isTerminalCheckin,
  MAX_QUEUE_SKIPS,
  nextStationLabel,
  QUEUE_SKIP_BACKOFF,
  type InterviewCheckinStatusKey,
} from "./interview-checkin";

describe("formatQueueNo", () => {
  it("prefixes the department segment and pads to three digits", () => {
    expect(formatQueueNo("B", 1)).toBe("B001");
    expect(formatQueueNo("K", 42)).toBe("K042");
    expect(formatQueueNo("W", 7)).toBe("W007");
    expect(formatQueueNo("S", 12)).toBe("S012");
  });

  it("clamps non-positive sequences to 1", () => {
    expect(formatQueueNo("B", 0)).toBe("B001");
    expect(formatQueueNo("S", -5)).toBe("S001");
  });

  it("does not truncate sequences beyond three digits", () => {
    expect(formatQueueNo("B", 1234)).toBe("B1234");
  });
});

describe("skip handling", () => {
  it("auto-calls waiting candidates and once-skipped ones", () => {
    expect(isAutoCallable("waiting", 0)).toBe(true);
    expect(isAutoCallable("skipped", 1)).toBe(true);
  });

  it("stops auto-calling after the skip budget is used up", () => {
    expect(isAutoCallable("skipped", MAX_QUEUE_SKIPS + 1)).toBe(false);
    expect(isAutoCallable("interviewing", 0)).toBe(false);
    expect(isAutoCallable("done", 0)).toBe(false);
  });

  it("describes the requeue and the stop, and stays silent at zero", () => {
    expect(checkinSkipNote(0)).toBeNull();
    expect(checkinSkipNote(1)).toBe(`已过号 1 次，已往后顺延 ${QUEUE_SKIP_BACKOFF} 位`);
    expect(checkinSkipNote(2)).toBe("已过号 2 次，不再自动叫号");
  });
});

describe("canTransitionCheckin", () => {
  it("allows the on-site progression", () => {
    expect(canTransitionCheckin("waiting", "called")).toBe(true);
    expect(canTransitionCheckin("called", "interviewing")).toBe(true);
    expect(canTransitionCheckin("interviewing", "done")).toBe(true);
  });

  it("allows skip and recall", () => {
    expect(canTransitionCheckin("called", "skipped")).toBe(true);
    expect(canTransitionCheckin("skipped", "called")).toBe(true);
  });

  it("rejects skipping the queue or reviving a finished candidate", () => {
    expect(canTransitionCheckin("waiting", "interviewing")).toBe(false);
    expect(canTransitionCheckin("done", "called")).toBe(false);
    expect(canTransitionCheckin("cancelled", "waiting")).toBe(false);
    expect(canTransitionCheckin("interviewing", "skipped")).toBe(false);
  });
});

describe("checkinActionsFor", () => {
  it("offers no call action for a waiting candidate (calling needs a station)", () => {
    expect(checkinActionsFor("waiting").map((action) => action.label)).toEqual([
      "取消签到",
    ]);
  });

  it("offers no call action for a skipped candidate", () => {
    expect(checkinActionsFor("skipped").map((action) => action.label)).toEqual([
      "取消签到",
    ]);
  });

  it("offers nothing once the interview is done", () => {
    expect(checkinActionsFor("done")).toEqual([]);
    expect(checkinActionsFor("cancelled")).toEqual([]);
  });

  it("only exposes transitions the state machine allows", () => {
    const statuses: InterviewCheckinStatusKey[] = [
      "waiting",
      "called",
      "interviewing",
      "done",
      "skipped",
      "cancelled",
    ];
    for (const status of statuses) {
      for (const action of checkinActionsFor(status)) {
        expect(canTransitionCheckin(status, action.to)).toBe(true);
      }
    }
  });
});

describe("compareCheckinQueue", () => {
  it("puts the candidate being served before the waiting queue", () => {
    const rows = [
      { status: "waiting" as const, queueSeq: 1 },
      { status: "interviewing" as const, queueSeq: 9 },
      { status: "called" as const, queueSeq: 5 },
    ];
    expect([...rows].sort(compareCheckinQueue).map((row) => row.queueSeq)).toEqual([
      9, 5, 1,
    ]);
  });

  it("orders the waiting queue by sign-in sequence", () => {
    const rows = [
      { status: "waiting" as const, queueSeq: 3 },
      { status: "waiting" as const, queueSeq: 1 },
      { status: "waiting" as const, queueSeq: 2 },
    ];
    expect([...rows].sort(compareCheckinQueue).map((row) => row.queueSeq)).toEqual([
      1, 2, 3,
    ]);
  });
});

describe("countCheckinQueue", () => {
  it("tallies each status and the total", () => {
    const counts = countCheckinQueue([
      { status: "waiting" },
      { status: "waiting" },
      { status: "called" },
      { status: "done" },
    ]);
    expect(counts).toMatchObject({
      waiting: 2,
      called: 1,
      done: 1,
      interviewing: 0,
      skipped: 0,
      cancelled: 0,
      total: 4,
    });
  });
});

describe("checkinBlockNote", () => {
  it("renders nothing when not blocked", () => {
    expect(checkinBlockNote(null)).toBeNull();
  });

  it("explains a cross-department interview", () => {
    expect(
      checkinBlockNote({ reason: "busy", departmentLabel: "办公室" }),
    ).toBe("正在办公室面试");
  });

  it("explains an unfinished first choice as a soft note", () => {
    expect(
      checkinBlockNote({ reason: "await_first_choice", departmentLabel: "办公室" }),
    ).toBe("第一志愿（办公室）未面完");
  });
});

describe("status classification", () => {
  it("treats on-site states as active and finished states as terminal", () => {
    expect(isActiveCheckin("waiting")).toBe(true);
    expect(isActiveCheckin("skipped")).toBe(true);
    expect(isTerminalCheckin("done")).toBe(true);
    expect(isTerminalCheckin("cancelled")).toBe(true);
    expect(isTerminalCheckin("waiting")).toBe(false);
  });

  it("has display metadata for every status", () => {
    const statuses: InterviewCheckinStatusKey[] = [
      "waiting",
      "called",
      "interviewing",
      "done",
      "skipped",
      "cancelled",
    ];
    for (const status of statuses) {
      expect(interviewCheckinStatusMeta[status].label).toBeTruthy();
      expect(interviewCheckinStatusMeta[status].badgeClassName).toBeTruthy();
    }
  });
});

describe("nextStationLabel", () => {
  it("starts at 1 号位", () => {
    expect(nextStationLabel([])).toBe("1 号位");
  });

  it("continues after the highest existing label", () => {
    expect(nextStationLabel(["1 号位", "2 号位"])).toBe("3 号位");
  });

  it("fills the first gap so a removed station can be re-added", () => {
    expect(nextStationLabel(["1 号位", "3 号位"])).toBe("2 号位");
  });

  it("ignores custom labels when numbering", () => {
    expect(nextStationLabel(["张三", "1 号位"])).toBe("2 号位");
  });
});

describe("station status", () => {
  it("labels the stored values", () => {
    expect(interviewStationStatusLabel("active")).toBe("启用");
    expect(interviewStationStatusLabel("paused")).toBe("暂停");
  });

  it("passes unknown values through instead of guessing", () => {
    expect(interviewStationStatusLabel("custom")).toBe("custom");
  });

  it("treats only active as usable", () => {
    expect(isStationActive("active")).toBe(true);
    expect(isStationActive("paused")).toBe(false);
  });
});
