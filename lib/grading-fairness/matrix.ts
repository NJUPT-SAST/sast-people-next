/**
 * 阅卷公平性模型需要的线性代数：稠密对称正规方程的秩判定与求解。
 *
 * 参数规模 = 考生数 + 题目数 + 讲师数（典型 < 100，极端 < 1000），
 * 所以朴素高斯消元足够，不引入任何依赖。
 */

/** 相对容差：主元绝对值小于 maxAbs × 该值即视为 0 */
const PIVOT_TOLERANCE = 1e-9;

/** 矩阵最大对角元素的绝对值（用作相对容差与岭强度的基准） */
export function maxDiagonal(matrix: Float64Array, n: number): number {
  let max = 0;
  for (let i = 0; i < n; i += 1) {
    const value = Math.abs(matrix[i * n + i]);
    if (value > max) max = value;
  }
  return max;
}

function swapRows(matrix: Float64Array, n: number, a: number, b: number): void {
  if (a === b) return;
  for (let c = 0; c < n; c += 1) {
    const left = a * n + c;
    const right = b * n + c;
    const value = matrix[left];
    matrix[left] = matrix[right];
    matrix[right] = value;
  }
}

/**
 * 高斯消元（部分主元）求秩。`matrix` 为行主序 n×n，函数内部复制，不修改入参。
 */
export function matrixRank(matrix: Float64Array, n: number): number {
  if (n <= 0) return 0;
  const a = Float64Array.from(matrix);
  const tolerance = Math.max(maxDiagonal(a, n), 1) * PIVOT_TOLERANCE;
  let row = 0;
  for (let column = 0; column < n && row < n; column += 1) {
    let pivotRow = row;
    let pivotValue = Math.abs(a[row * n + column]);
    for (let candidate = row + 1; candidate < n; candidate += 1) {
      const value = Math.abs(a[candidate * n + column]);
      if (value > pivotValue) {
        pivotValue = value;
        pivotRow = candidate;
      }
    }
    if (pivotValue <= tolerance) continue;
    if (pivotRow !== row) swapRows(a, n, pivotRow, row);
    const pivot = a[row * n + column];
    for (let target = row + 1; target < n; target += 1) {
      const factor = a[target * n + column] / pivot;
      if (factor === 0) continue;
      for (let c = column; c < n; c += 1) {
        a[target * n + c] -= factor * a[row * n + c];
      }
    }
    row += 1;
  }
  return row;
}

export type LinearSolver = {
  /** 解 A x = b（同一分解可复用于多个右端项） */
  solve(rhs: Float64Array): Float64Array;
};

/**
 * LU 分解（Doolittle + 部分主元）。矩阵秩亏时返回 null —— 调用方据此判定「不可辨识」，
 * 而不是拿一个任意解去做校正。
 */
export function factorize(matrix: Float64Array, n: number): LinearSolver | null {
  if (n <= 0) return null;
  const lu = Float64Array.from(matrix);
  const permutations: number[] = [];
  const tolerance = Math.max(maxDiagonal(lu, n), 1) * PIVOT_TOLERANCE;

  for (let k = 0; k < n; k += 1) {
    let pivotRow = k;
    let pivotValue = Math.abs(lu[k * n + k]);
    for (let candidate = k + 1; candidate < n; candidate += 1) {
      const value = Math.abs(lu[candidate * n + k]);
      if (value > pivotValue) {
        pivotValue = value;
        pivotRow = candidate;
      }
    }
    if (pivotValue <= tolerance) return null;
    if (pivotRow !== k) swapRows(lu, n, pivotRow, k);
    permutations.push(pivotRow);

    const pivot = lu[k * n + k];
    for (let target = k + 1; target < n; target += 1) {
      const factor = lu[target * n + k] / pivot;
      lu[target * n + k] = factor;
      if (factor === 0) continue;
      for (let c = k + 1; c < n; c += 1) {
        lu[target * n + c] -= factor * lu[k * n + c];
      }
    }
  }

  return {
    solve(rhs: Float64Array): Float64Array {
      const x = Float64Array.from(rhs);
      for (let k = 0; k < n; k += 1) {
        const pivotRow = permutations[k];
        if (pivotRow !== k) {
          const value = x[k];
          x[k] = x[pivotRow];
          x[pivotRow] = value;
        }
      }
      /* 前代：L y = P b（L 的对角为 1） */
      for (let i = 1; i < n; i += 1) {
        let sum = x[i];
        for (let c = 0; c < i; c += 1) sum -= lu[i * n + c] * x[c];
        x[i] = sum;
      }
      /* 回代：U x = y */
      for (let i = n - 1; i >= 0; i -= 1) {
        let sum = x[i];
        for (let c = i + 1; c < n; c += 1) sum -= lu[i * n + c] * x[c];
        x[i] = sum / lu[i * n + i];
      }
      return x;
    },
  };
}
