/**
 * 线性代数底座：秩判定与求解（阅卷公平性模型的唯一数值依赖）。
 */

import { factorize, matrixRank, maxDiagonal } from "@/lib/grading-fairness/matrix";

describe("matrixRank", () => {
  it("满秩方阵的秩等于阶数", () => {
    const matrix = Float64Array.from([2, 1, 1, 3]);
    expect(matrixRank(matrix, 2)).toBe(2);
  });

  it("奇异矩阵按实际秩返回", () => {
    /* 第 2 行 = 第 1 行 × 2 */
    const singular = Float64Array.from([1, 2, 2, 4]);
    expect(matrixRank(singular, 2)).toBe(1);

    const allOnes = Float64Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(matrixRank(allOnes, 3)).toBe(1);
  });

  it("零矩阵秩为 0", () => {
    expect(matrixRank(new Float64Array(9), 3)).toBe(0);
    expect(matrixRank(new Float64Array(0), 0)).toBe(0);
  });

  it("不修改入参", () => {
    const matrix = Float64Array.from([1, 2, 2, 4]);
    matrixRank(matrix, 2);
    expect(Array.from(matrix)).toEqual([1, 2, 2, 4]);
  });
});

describe("factorize / solve", () => {
  it("解出已知线性方程组的解", () => {
    /* 2x + y = 3; x + 3y = 5  →  x = 0.8, y = 1.4 */
    const solver = factorize(Float64Array.from([2, 1, 1, 3]), 2);
    expect(solver).not.toBeNull();
    const solution = solver!.solve(Float64Array.from([3, 5]));
    expect(solution[0]).toBeCloseTo(0.8, 9);
    expect(solution[1]).toBeCloseTo(1.4, 9);
  });

  it("同一分解可复用于多个右端项", () => {
    const solver = factorize(Float64Array.from([2, 1, 1, 3]), 2)!;
    const first = solver.solve(Float64Array.from([3, 5]));
    const second = solver.solve(Float64Array.from([0, 0]));
    expect(first[0]).toBeCloseTo(0.8, 9);
    expect(second[0]).toBeCloseTo(0, 9);
    expect(second[1]).toBeCloseTo(0, 9);
  });

  it("秩亏矩阵返回 null（调用方据此判定不可辨识）", () => {
    expect(factorize(Float64Array.from([1, 2, 2, 4]), 2)).toBeNull();
    expect(factorize(new Float64Array(4), 2)).toBeNull();
  });

  it("需要换行时才可解（部分主元）", () => {
    /* 首元为 0：[[0,1],[1,0]] x = [2,3] → x = [3,2] */
    const solver = factorize(Float64Array.from([0, 1, 1, 0]), 2);
    expect(solver).not.toBeNull();
    const solution = solver!.solve(Float64Array.from([2, 3]));
    expect(solution[0]).toBeCloseTo(3, 9);
    expect(solution[1]).toBeCloseTo(2, 9);
  });
});

describe("maxDiagonal", () => {
  it("返回对角元素绝对值的最大值", () => {
    expect(maxDiagonal(Float64Array.from([1, 9, 9, -5]), 2)).toBe(5);
    expect(maxDiagonal(Float64Array.from([3, 0, 0, 4]), 2)).toBe(4);
  });
});
