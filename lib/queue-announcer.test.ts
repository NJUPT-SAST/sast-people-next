import {
  ANNOUNCE_BATCH_LIMIT,
  ANNOUNCE_MAX_REPEATS,
  ANNOUNCE_REPEAT_INTERVAL_MS,
  ANNOUNCE_STALE_MS,
  announcementText,
  batchAnnouncementText,
  selectAnnouncements,
  type AnnounceState,
  type AnnounceTarget,
} from "./queue-announcer";

const NOW = Date.parse("2026-10-09T15:00:00+08:00");

const target = (overrides: Partial<AnnounceTarget> = {}): AnnounceTarget => ({
  key: "1:x",
  departmentLabel: "办公室",
  queueNo: "A003",
  name: "许清和",
  stationLabel: "1 号位",
  calledAt: new Date(NOW).toISOString(),
  ...overrides,
});

describe("selectAnnouncements", () => {
  it("speaks a fresh call and records it", () => {
    const { batch, state } = selectAnnouncements([target()], {}, NOW);
    expect(batch).toHaveLength(1);
    expect(state["1:x"]).toEqual({ spokenCount: 1, lastSpokenAt: NOW });
  });

  it("waits for the repeat interval before speaking again", () => {
    const state: AnnounceState = { "1:x": { spokenCount: 1, lastSpokenAt: NOW } };
    expect(selectAnnouncements([target()], state, NOW + 1000).batch).toEqual([]);
    expect(
      selectAnnouncements([target()], state, NOW + ANNOUNCE_REPEAT_INTERVAL_MS).batch,
    ).toHaveLength(1);
  });

  it("stops repeating after the maximum", () => {
    const state: AnnounceState = {
      "1:x": { spokenCount: ANNOUNCE_MAX_REPEATS, lastSpokenAt: NOW - 60_000 },
    };
    expect(selectAnnouncements([target()], state, NOW).batch).toEqual([]);
  });

  it("skips calls that are already stale (opening the board must not replay history)", () => {
    const stale = target({ calledAt: new Date(NOW - ANNOUNCE_STALE_MS - 1).toISOString() });
    const { batch, state } = selectAnnouncements([stale], {}, NOW);
    expect(batch).toEqual([]);
    expect(state).toEqual({});
  });

  it("forgets candidates who left the queue so a later call speaks fresh", () => {
    const state: AnnounceState = { "1:x": { spokenCount: 3, lastSpokenAt: NOW } };
    const { state: next } = selectAnnouncements([], state, NOW);
    expect(next).toEqual({});
  });

  it("caps one tick and keeps the oldest calls first", () => {
    const targets = Array.from({ length: ANNOUNCE_BATCH_LIMIT + 2 }, (_, index) =>
      target({
        key: `k${index}`,
        queueNo: `A00${index}`,
        calledAt: new Date(NOW - (10 - index) * 1000).toISOString(),
      }),
    );
    const { batch } = selectAnnouncements(targets, {}, NOW);
    expect(batch.map((item) => item.key)).toEqual(["k0", "k1", "k2"]);
  });
});

describe("announcement text", () => {
  it("names department, number, person and station", () => {
    expect(announcementText(target())).toBe("请 办公室 A003 号，许清和 同学，到 1 号位");
  });

  it("merges a burst into one sentence", () => {
    expect(
      batchAnnouncementText([
        target(),
        target({ key: "2:y", departmentLabel: "科宣部", queueNo: "A005", name: "郑一凡" }),
      ]),
    ).toBe("请 办公室 A003 号 许清和、科宣部 A005 号 郑一凡 同学，到各自的面试位");
  });

  it("returns nothing for an empty batch", () => {
    expect(batchAnnouncementText([])).toBeNull();
  });
});
