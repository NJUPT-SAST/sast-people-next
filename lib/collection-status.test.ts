/** @jest-environment node */

import {
  collectionFormPhase,
  isCollectionDeadlinePassed,
  isCollectionFormOpen,
} from "./collection-status";

const now = new Date("2026-10-22T10:00:00+08:00");

const timing = (overrides: Partial<Parameters<typeof collectionFormPhase>[0]> = {}) => ({
  status: "open",
  startsAt: null,
  deadline: null,
  ...overrides,
});

describe("collectionFormPhase", () => {
  it("is open without a schedule", () => {
    expect(collectionFormPhase(timing(), now)).toBe("open");
  });

  it("is upcoming before the start time", () => {
    expect(
      collectionFormPhase(
        timing({ startsAt: new Date("2026-10-23T09:00:00+08:00") }),
        now,
      ),
    ).toBe("upcoming");
  });

  it("is closed after the deadline", () => {
    expect(
      collectionFormPhase(
        timing({ deadline: new Date("2026-10-21T23:59:00+08:00") }),
        now,
      ),
    ).toBe("closed");
  });

  it("is closed when manually closed even within the schedule", () => {
    expect(
      collectionFormPhase(
        timing({
          status: "closed",
          startsAt: new Date("2026-10-21T09:00:00+08:00"),
          deadline: new Date("2026-10-30T23:59:00+08:00"),
        }),
        now,
      ),
    ).toBe("closed");
  });

  it("is open between the start and deadline", () => {
    expect(
      collectionFormPhase(
        timing({
          startsAt: new Date("2026-10-21T09:00:00+08:00"),
          deadline: new Date("2026-10-30T23:59:00+08:00"),
        }),
        now,
      ),
    ).toBe("open");
  });

  it("exposes the boolean open check", () => {
    expect(isCollectionFormOpen(timing(), now)).toBe(true);
    expect(
      isCollectionFormOpen(
        timing({ startsAt: new Date("2026-10-23T09:00:00+08:00") }),
        now,
      ),
    ).toBe(false);
  });

  it("treats only a passed deadline as deadline-ended", () => {
    expect(isCollectionDeadlinePassed(null, now)).toBe(false);
    expect(
      isCollectionDeadlinePassed(
        new Date("2026-10-30T23:59:00+08:00"),
        now,
      ),
    ).toBe(false);
    expect(
      isCollectionDeadlinePassed(
        new Date("2026-10-21T23:59:00+08:00"),
        now,
      ),
    ).toBe(true);
  });
});
