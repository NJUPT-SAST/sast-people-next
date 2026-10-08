import {
  buildOfficeRoundOneRoster,
  officeChoiceLabel,
  officeRoundOneAverageScore,
} from "./office-round-one-roster";

describe("buildOfficeRoundOneRoster", () => {
  it("keeps round-two candidates as passed and round-one failures as rejected", () => {
    const roster = buildOfficeRoundOneRoster([
      {
        userFlowId: 1,
        name: "张三",
        studentId: "B001",
        choice: 1,
        round: 2,
        status: "ongoing",
        evaluations: [{ round: 1, score: 88 }],
      },
      {
        userFlowId: 2,
        name: "李四",
        studentId: "B002",
        choice: 2,
        round: 1,
        status: "failed",
        evaluations: [{ round: 1, score: 61 }],
      },
    ]);

    expect(roster).toEqual([
      {
        userFlowId: 1,
        name: "张三",
        studentId: "B001",
        choice: 1,
        scores: [88],
        passed: true,
      },
      {
        userFlowId: 2,
        name: "李四",
        studentId: "B002",
        choice: 2,
        scores: [61],
        passed: false,
      },
    ]);
  });

  it("drops still-ongoing round-one candidates and whatever happens in round two", () => {
    const roster = buildOfficeRoundOneRoster([
      {
        /* 一面还没出结果：不进名单 */
        userFlowId: 1,
        name: "张三",
        studentId: null,
        choice: 1,
        round: 1,
        status: "ongoing",
        evaluations: [{ round: 1, score: 90 }],
      },
      {
        /* 二面结束后的结果不影响一面结论；一面分只取 round=1 的记录 */
        userFlowId: 2,
        name: "李四",
        studentId: null,
        choice: 1,
        round: 2,
        status: "failed",
        evaluations: [
          { round: 1, score: 70 },
          { round: 2, score: 40 },
        ],
      },
    ]);

    expect(roster).toEqual([
      {
        userFlowId: 2,
        name: "李四",
        studentId: null,
        choice: 1,
        scores: [70],
        passed: true,
      },
    ]);
  });

  it("ignores unscored round-one evaluations", () => {
    const roster = buildOfficeRoundOneRoster([
      {
        userFlowId: 3,
        name: "王五",
        studentId: null,
        choice: null,
        round: 2,
        status: "ongoing",
        evaluations: [
          { round: 1, score: null },
          { round: 1, score: 55 },
        ],
      },
    ]);

    expect(roster[0]?.scores).toEqual([55]);
    expect(officeRoundOneAverageScore(roster[0]?.scores ?? [])).toBe(55);
  });
});

describe("officeRoundOneAverageScore", () => {
  it("averages the recorded round-one scores and handles an empty list", () => {
    expect(officeRoundOneAverageScore([])).toBeNull();
    expect(officeRoundOneAverageScore([80])).toBe(80);
    /* 四舍五入到一位小数：多份记录（历史数据）也不出现长尾 */
    expect(officeRoundOneAverageScore([80, 91, 90])).toBe(87);
    expect(officeRoundOneAverageScore([80, 81])).toBe(80.5);
  });
});

describe("officeChoiceLabel", () => {
  it("labels the office volunteer types and keeps other values empty", () => {
    expect(officeChoiceLabel(1)).toBe("第一志愿");
    expect(officeChoiceLabel(2)).toBe("第二志愿");
    expect(officeChoiceLabel(null)).toBe("");
  });
});
