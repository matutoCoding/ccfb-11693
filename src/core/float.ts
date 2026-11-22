// 浮长分析 —— 与组织图共享同一份 cells,所有结论均可逐格回溯
import type { WeavePattern, FloatRun, FloatSideStats, FloatStats, AuditResult, AuditIssue } from './types';
import { getCell, wrap } from './weave';

interface CyclicRun {
  start: number;
  length: number;
}

/**
 * 对一条循环排列的 0/1 序列求目标值的连续段(按循环首尾相接处理)
 * 全序列都是目标值时返回一整段(长度=n)
 */
function cyclicRuns(line: ArrayLike<number>, target: 0 | 1): CyclicRun[] {
  const n = line.length;
  let breakPos = -1;
  for (let i = 0; i < n; i++) {
    if (line[i] !== target) {
      breakPos = i;
      break;
    }
  }
  if (breakPos === -1) return [{ start: 0, length: n }];

  const runs: CyclicRun[] = [];
  let i = 0;
  while (i < n) {
    const pos = wrap(breakPos + 1 + i, n);
    if (line[pos] === target) {
      const start = pos;
      let len = 0;
      while (i < n && line[wrap(breakPos + 1 + i, n)] === target) {
        len++;
        i++;
      }
      runs.push({ start, length: len });
    } else {
      i++;
    }
  }
  return runs;
}

/** 分析某一侧(经/纬)的全部浮长段 */
export function analyzeSide(p: WeavePattern, kind: 'warp' | 'weft', longThreshold: number): FloatSideStats {
  const runs: FloatRun[] = [];
  const n = kind === 'warp' ? p.width : p.height;
  const lineLen = kind === 'warp' ? p.height : p.width;
  const line = new Uint8Array(lineLen);

  for (let yarn = 0; yarn < n; yarn++) {
    for (let t = 0; t < lineLen; t++) {
      if (kind === 'warp') {
        line[t] = getCell(p, yarn, t); // 列 yarn,沿行扫描,经浮=1
      } else {
        line[t] = getCell(p, t, yarn); // 行 yarn,沿列扫描,纬浮=0
      }
    }
    const target: 0 | 1 = kind === 'warp' ? 1 : 0;
    for (const run of cyclicRuns(line, target)) {
      runs.push({ kind, yarnIndex: yarn, start: run.start, length: run.length });
    }
  }

  const totalRuns = runs.length;
  let maxLength = 0;
  let sum = 0;
  let longFloats = 0;
  for (const r of runs) {
    maxLength = Math.max(maxLength, r.length);
    sum += r.length;
    if (r.length >= longThreshold) longFloats++;
  }
  return {
    runs,
    totalRuns,
    maxLength,
    meanLength: totalRuns ? sum / totalRuns : 0,
    longFloats,
  };
}

export function analyzeAll(p: WeavePattern, longThreshold: number): FloatStats {
  return {
    warp: analyzeSide(p, 'warp', longThreshold),
    weft: analyzeSide(p, 'weft', longThreshold),
  };
}

/** 某根指定纱线的浮长段(用户要的"任意经纱浮长统计") */
export function runsForYarn(p: WeavePattern, kind: 'warp' | 'weft', yarnIndex: number): FloatRun[] {
  const lineLen = kind === 'warp' ? p.height : p.width;
  const line = new Uint8Array(lineLen);
  for (let t = 0; t < lineLen; t++) {
    line[t] = kind === 'warp' ? getCell(p, yarnIndex, t) : getCell(p, t, yarnIndex);
  }
  const target: 0 | 1 = kind === 'warp' ? 1 : 0;
  return cyclicRuns(line, target).map((r) => ({
    kind,
    yarnIndex,
    start: r.start,
    length: r.length,
  }));
}

/** 浮长段覆盖的格子坐标列表 */
export function runCells(run: FloatRun, span: number): Array<{ c: number; r: number }> {
  const out: Array<{ c: number; r: number }> = [];
  for (let k = 0; k < run.length; k++) {
    const t = wrap(run.start + k, span);
    out.push(run.kind === 'warp' ? { c: run.yarnIndex, r: t } : { c: t, r: run.yarnIndex });
  }
  return out;
}

/** 找到覆盖某格的浮长段(编辑器高亮用) */
export function runAtCell(p: WeavePattern, c: number, r: number): FloatRun | undefined {
  const v = getCell(p, c, r);
  const runs = runsForYarn(p, v === 1 ? 'warp' : 'weft', v === 1 ? c : r);
  const span = v === 1 ? p.height : p.width;
  const t = v === 1 ? r : c;
  return runs.find((run) => {
    for (let k = 0; k < run.length; k++) if (wrap(run.start + k, span) === t) return true;
    return false;
  });
}

/**
 * 审计:用组织图重新推导每一段浮长,再逐格核对
 * 1) 段内每格的组织点必须与浮长种类一致
 * 2) 段两端(非整行整列时)必须是相反组织点
 * 3) 每个格子必须被恰好一段对应种类的浮长覆盖
 */
export function auditPattern(p: WeavePattern, longThreshold: number): AuditResult {
  const stats = analyzeAll(p, longThreshold);
  const issues: AuditIssue[] = [];
  let checkedRuns = 0;
  let checkedCells = 0;

  const coverageWarp = new Int8Array(p.width * p.height);
  const coverageWeft = new Int8Array(p.width * p.height);

  for (const side of [stats.warp, stats.weft]) {
    const span = side === stats.warp ? p.height : p.width;
    for (const run of side.runs) {
      checkedRuns++;
      const cells = runCells(run, span);
      for (const { c, r } of cells) {
        checkedCells++;
        const v = getCell(p, c, r);
        const expect = run.kind === 'warp' ? 1 : 0;
        if (v !== expect) {
          issues.push({
            message: `${run.kind === 'warp' ? '经' : '纬'}浮长段(纱线#${run.yarnIndex},起点${run.start},长度${run.length})内(${c},${r})组织点为${v},应为${expect}`,
            run,
          });
        }
        const cov = run.kind === 'warp' ? coverageWarp : coverageWeft;
        cov[r * p.width + c]++;
      }
      // 整行/整列浮长没有边界
      if (run.length !== span) {
        const before = wrap(run.start - 1, span);
        const after = wrap(run.start + run.length, span);
        const expectOpp = run.kind === 'warp' ? 0 : 1;
        for (const t of [before, after]) {
          const c = run.kind === 'warp' ? run.yarnIndex : t;
          const r = run.kind === 'warp' ? t : run.yarnIndex;
          if (getCell(p, c, r) !== expectOpp) {
            issues.push({
              message: `浮长段(纱线#${run.yarnIndex})边界(${c},${r})组织点错误,分段失败`,
              run,
            });
          }
        }
      }
    }
  }

  for (let r = 0; r < p.height; r++) {
    for (let c = 0; c < p.width; c++) {
      const v = p.cells[r * p.width + c];
      const cov = (v === 1 ? coverageWarp : coverageWeft)[r * p.width + c];
      if (cov !== 1) {
        issues.push({
          message: `格子(${c},${r})组织点=${v},被浮长段覆盖 ${cov} 次(应为 1 次)`,
        });
      }
    }
  }

  return { ok: issues.length === 0, checkedRuns, checkedCells, issues };
}
