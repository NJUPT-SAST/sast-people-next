/**
 * 线性代数底座：秩判定、零空间与求解（阅卷公平性模型的唯一数值依赖）。
 */

import { factorize, nullSpaceBasis, maxDiagonal } from "@/lib/grading-fairness/matrix";

const multiply = (matrix: Float64Array, n: number, vector: Float64Array): Float64Array => {
  const result = new Float64Array(n);
  for (let row = 0; row < n; row += 1) {
    let sum = 0;
    for (let column = 0; column < n; column += 1) sum += matrix[row * n + column] * vector[column];
    result[row] = sum;
  }
  return result;
};

describe("nullSpaceBasis", () => {
  it("满秩方阵的零空间为空", () => {
    expect(nullSpaceBasis(Float64Array.from([2, 1, 1, 3]), 2)).toEqual([]);
    expect(nullSpaceBasis(Float64Array.from([1, 0, 0, 1]), 2)).toEqual([]);
  });

  it("奇异矩阵的零空间维数 = 阶数 − 秩，且基向量确实落在零空间里", () => {
    /* 第 2 行 = 第 1 行 × 2 */
    const singular = Float64Array.from([1, 2, 2, 4]);
    const basis = nullSpaceBasis(singular, 2);
    expect(basis).toHaveLength(1);
    const image = multiply(singular, 2, basis[0]);
    expect(Math.abs(image[0])).toBeLessThan(1e-9);
    expect(Math.abs(image[1])).toBeLessThan(1e-9);
  });

  it("秩 1 的 3×3 全 1 矩阵零空间维数为 2，基向量正交归一", () => {
    const allOnes = Float64Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const basis = nullSpaceBasis(allOnes, 3);
    expect(basis).toHaveLength(2);
    for (const vector of basis) {
      const image = multiply(allOnes, 3, vector);
      for (const value of image) expect(Math.abs(value)).toBeLessThan(1e-9);
      const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
      expect(norm).toBeCloseTo(1, 9);
    }
    const dot = basis[0].reduce((total, value, index) => total + value * basis[1][index], 0);
    expect(Math.abs(dot)).toBeLessThan(1e-9);
  });

  it("零矩阵的零空间是整空间（n 个基向量）", () => {
    expect(nullSpaceBasis(new Float64Array(9), 3)).toHaveLength(3);
    expect(nullSpaceBasis(new Float64Array(0), 0)).toEqual([]);
  });

  it("不修改入参", () => {
    const matrix = Float64Array.from([1, 2, 2, 4]);
    nullSpaceBasis(matrix, 2);
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
