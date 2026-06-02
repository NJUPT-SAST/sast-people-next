import {
  buildRecruitmentScoreCsv,
  escapeCsvCell,
} from "./exportCsv";

describe("recruitment exportCsv", () => {
  it("escapes csv cells with commas, quotes, and line breaks", () => {
    expect(escapeCsvCell('A,"B"\nC')).toBe('"A,""B""\nC"');
  });

  it("builds a lecturer-safe score csv without sensitive details", () => {
    expect(
      buildRecruitmentScoreCsv({
        includeSensitiveInfo: false,
        rows: [
          {
            studentId: "B001",
            name: "张三",
            phoneNumber: "13800000000",
            status: "passed",
            totalScore: "90",
            problemScores: [
              {
                title: "算法题",
                score: 100,
                points: 90,
                judgerName: "讲师",
              },
            ],
          },
        ],
      }),
    ).toBe("学号,姓名,状态,总分\r\nB001,张三,通过,90\r\n");
  });

  it("builds an admin score csv with phone and score details", () => {
    expect(
      buildRecruitmentScoreCsv({
        includeSensitiveInfo: true,
        rows: [
          {
            studentId: "B001",
            name: "张三",
            phoneNumber: "13800000000",
            status: "failed",
            totalScore: "70",
            problemScores: [
              {
                title: "算法,题",
                score: 100,
                points: 70,
                judgerName: null,
              },
            ],
          },
        ],
      }),
    ).toBe(
      '学号,姓名,手机号,状态,总分,得分组成\r\nB001,张三,13800000000,不通过,70,"算法,题: 70/100 (未记录)"\r\n',
    );
  });
});
