/**
 * 阅卷公平性模型需要的线性代数：稠密对称正规方程的秩判定、零空间与求解。
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

/** 正交归一化时丢弃的退化向量：模长小于该值视为零向量 */
const BASIS_DROP_TOLERANCE = 1e-9;

type Echelon = {
  /** 主元列号，按行序递增 */
  pivots: number[];
  /** 行阶梯形（入参的副本） */
  form: Float64Array;
};

/**
 * 带部分主元的行阶梯化。`matrix` 为行主序 n×n，函数内部复制，不修改入参。
 * 秩 = pivots.length，零空间维数 = n − pivots.length。
 */
function toEchelon(matrix: Float64Array, n: number): Echelon {
  const form = Float64Array.from(matrix);
  const tolerance = Math.max(maxDiagonal(form, n), 1) * PIVOT_TOLERANCE;
  const pivots: number[] = [];
  let row = 0;
  for (let column = 0; column < n && row < n; column += 1) {
    let pivotRow = row;
    let pivotValue = Math.abs(form[row * n + column]);
    for (let candidate = row + 1; candidate < n; candidate += 1) {
      const value = Math.abs(form[candidate * n + column]);
      if (value > pivotValue) {
        pivotValue = value;
        pivotRow = candidate;
      }
    }
    if (pivotValue <= tolerance) continue;
    if (pivotRow !== row) swapRows(form, n, pivotRow, row);
    const pivot = form[row * n + column];
    for (let target = row + 1; target < n; target += 1) {
      const factor = form[target * n + column] / pivot;
      if (factor === 0) continue;
      for (let c = column; c < n; c += 1) {
        form[target * n + c] -= factor * form[row * n + c];
      }
    }
    pivots.push(column);
    row += 1;
  }
  return { pivots, form };
}

/** 修正 Gram–Schmidt 正交归一化（零空间基需要正交，投影才不重复扣除） */
function orthonormalize(vectors: Float64Array[]): Float64Array[] {
  const basis: Float64Array[] = [];
  for (const vector of vectors) {
    const current = Float64Array.from(vector);
    for (const unit of basis) {
      let dot = 0;
      for (let index = 0; index < current.length; index += 1) dot += current[index] * unit[index];
      for (let index = 0; index < current.length; index += 1) current[index] -= dot * unit[index];
    }
    let norm = 0;
    for (let index = 0; index < current.length; index += 1) norm += current[index] * current[index];
    norm = Math.sqrt(norm);
    if (norm <= BASIS_DROP_TOLERANCE) continue;
    for (let index = 0; index < current.length; index += 1) current[index] /= norm;
    basis.push(current);
  }
  return basis;
}

/**
 * 零空间的一组**正交归一**基，长度 = n − rank（满秩时为空数组）。
 *
 * 用途：判定某个线性组合是否可估 —— 组合向量可估 ⟺ 它与每个基向量正交
 * （即落在设计矩阵的行空间里）。「讲师宽严是否可辨识」就靠它逐个讲师判定，
 * 而不是把整个分量一刀切成可辨识 / 不可辨识。
 */
export function nullSpaceBasis(matrix: Float64Array, n: number): Float64Array[] {
  if (n <= 0) return [];
  const { pivots, form } = toEchelon(matrix, n);
  if (pivots.length === n) return [];
  const isPivot = new Array<boolean>(n).fill(false);
  for (const column of pivots) isPivot[column] = true;

  const raw: Float64Array[] = [];
  for (let free = 0; free < n; free += 1) {
    if (isPivot[free]) continue;
    const vector = new Float64Array(n);
    vector[free] = 1;
    /* 自下而上回代：主元列在右侧的未知量此刻已确定 */
    for (let row = pivots.length - 1; row >= 0; row -= 1) {
      const pivotColumn = pivots[row];
      let sum = 0;
      for (let column = pivotColumn + 1; column < n; column += 1) {
        sum += form[row * n + column] * vector[column];
      }
      vector[pivotColumn] = -sum / form[row * n + pivotColumn];
    }
    raw.push(vector);
  }
  return orthonormalize(raw);
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
