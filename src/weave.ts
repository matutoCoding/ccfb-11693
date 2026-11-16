// ---------- 组织生成 + 浮长分析 ----------
// 约定: grid[y*w+x]  1=经浮(经纱在上) 0=纬浮(纬纱在上)

export function emptyGrid(w: number, h: number, fill: 0 | 1 = 0): Uint8Array {
  return new Uint8Array(w * h).fill(fill);
}

/** 平纹 */
export function genPlain(w: number, h: number): Uint8Array {
  const g = emptyGrid(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) g[y * w + x] = (x + y) % 2 === 0 ? 1 : 0;
  return g;
}

/** 斜纹: warpUp/warpDown 如 2/1、3/1,step 为每纬移位数(默认1) */
export function genTwill(w: number, h: number, warpUp = 2, warpDown = 1, step = 1): Uint8Array {
  const g = emptyGrid(w, h);
  const period = warpUp + warpDown;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = (((x - y * step) % period) + period) % period;
      g[y * w + x] = t < warpUp ? 1 : 0;
    }
  return g;
}

/** 缎纹: ends 枚数(>=5),step 飞数(需与 ends 互质) */
export function genSatin(w: number, h: number, ends = 5, step = 2): Uint8Array {
  const g = emptyGrid(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      g[y * w + x] = ((x - y * step) % ends + ends) % ends === 0 ? 1 : 0;
    }
  return g;
}

/** 阴影缎纹: 按 level∈[0,1] 生成经面比例渐变的缎纹(用于图片转组织的明暗层次) */
export function genShadeSatin(w: number, h: number, ends: number, step: number, level: number): Uint8Array {
  const g = emptyGrid(w, h);
  const threshold = Math.round(level * ends);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = ((x - y * step) % ends + ends) % ends;
      g[y * w + x] = t < threshold ? 1 : 0;
    }
  return g;
}

// ---------- 浮长分析 ----------

export interface FloatRun {
  /** 起始行(组织图行号,从0开始) */
  start: number;
  /** 浮长(连续同状态格数) */
  length: number;
  /** warp=经浮(经纱在上) weft=纬浮(纬纱在该经纱之上) */
  type: 'warp' | 'weft';
}

/** 某一根经纱(列 x)沿纬向的浮长序列 —— 与组织图逐格对应 */
export function columnFloatRuns(grid: Uint8Array, w: number, h: number, x: number): FloatRun[] {
  const runs: FloatRun[] = [];
  let y = 0;
  while (y < h) {
    const v = grid[y * w + x];
    let len = 1;
    while (y + len < h && grid[(y + len) * w + x] === v) len++;
    runs.push({ start: y, length: len, type: v === 1 ? 'warp' : 'weft' });
    y += len;
  }
  return runs;
}

/** 某一根纬纱(行 y)沿经向的浮长序列 */
export function rowFloatRuns(grid: Uint8Array, w: number, _h: number, y: number): FloatRun[] {
  const runs: FloatRun[] = [];
  let x = 0;
  while (x < w) {
    const v = grid[y * w + x];
    let len = 1;
    while (x + len < w && grid[y * w + x + len] === v) len++;
    runs.push({ start: x, length: len, type: v === 1 ? 'warp' : 'weft' });
    x += len;
  }
  return runs;
}

export interface FloatSummary {
  maxWarpFloat: number;
  maxWeftFloat: number;
  avgWarpFloat: number;
  avgWeftFloat: number;
}

export function floatSummary(grid: Uint8Array, w: number, h: number): FloatSummary {
  let maxW = 0, maxF = 0, sumW = 0, sumF = 0, nW = 0, nF = 0;
  for (let x = 0; x < w; x++) {
    for (const r of columnFloatRuns(grid, w, h, x)) {
      if (r.type === 'warp') { maxW = Math.max(maxW, r.length); sumW += r.length; nW++; }
      else { maxF = Math.max(maxF, r.length); sumF += r.length; nF++; }
    }
  }
  return {
    maxWarpFloat: maxW, maxWeftFloat: maxF,
    avgWarpFloat: nW ? sumW / nW : 0, avgWeftFloat: nF ? sumF / nF : 0,
  };
}

/**
 * 一致性校验: 渲染几何使用的实例数据必须与组织图逐格一致。
 * 输入 instances 的布局见 geometry.ts(STRIDE=8):
 *   [cx, cy, isWarp, elev, floatLen, runPos, thickness, gloss]
 * 返回第一个不一致的格子描述,全部一致返回 null。
 */
export function verifyInstancesAgainstGrid(
  grid: Uint8Array, w: number, h: number, inst: Float32Array, stride: number
): string | null {
  if (inst.length !== w * h * stride) return `实例数 ${inst.length / stride} ≠ 组织点数 ${w * h}`;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * stride;
      const isWarp = inst[i + 2] > 0.5 ? 1 : 0;
      if (isWarp !== grid[y * w + x])
        return `(${x},${y}) 组织图=${grid[y * w + x] ? '经浮' : '纬浮'} 但几何=${isWarp ? '经浮' : '纬浮'}`;
      // 浮长核对: 该格所属浮长段长度
      const v = grid[y * w + x];
      let len = 1;
      if (isWarp === 1) {
        // 经浮沿纬向(列方向)延伸
        let y0 = y; while (y0 > 0 && grid[(y0 - 1) * w + x] === v) y0--;
        let y1 = y; while (y1 < h - 1 && grid[(y1 + 1) * w + x] === v) y1++;
        len = y1 - y0 + 1;
      } else {
        let x0 = x; while (x0 > 0 && grid[y * w + x0 - 1] === v) x0--;
        let x1 = x; while (x1 < w - 1 && grid[y * w + x1 + 1] === v) x1++;
        len = x1 - x0 + 1;
      }
      if (Math.abs(inst[i + 4] - len) > 0.001)
        return `(${x},${y}) 组织图浮长=${len} 但几何浮长=${inst[i + 4]}`;
    }
  }
  return null;
}
