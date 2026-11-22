// 组织图领域逻辑:创建、坐标访问、基本组织生成、变换
import type { WeavePattern, CellValue } from './types';
import { uid } from './util';

export function idx(w: number, c: number, r: number): number {
  return r * w + c;
}

/** 循环坐标取模(支持负数) */
export function wrap(v: number, n: number): number {
  return ((v % n) + n) % n;
}

export function getCell(p: Pick<WeavePattern, 'cells' | 'width' | 'height'>, c: number, r: number): CellValue {
  return p.cells[idx(p.width, wrap(c, p.width), wrap(r, p.height))] as CellValue;
}

export function setCellRaw(p: WeavePattern, c: number, r: number, v: CellValue): void {
  p.cells[idx(p.width, c, r)] = v;
}

export function createPattern(
  width: number,
  height: number,
  name: string,
  warpYarnId: string,
  weftYarnId: string,
  fill: CellValue | ((c: number, r: number) => CellValue) = 0,
): WeavePattern {
  const cells = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      cells[r * width + c] = typeof fill === 'function' ? fill(c, r) : fill;
    }
  }
  const now = Date.now();
  return {
    id: uid(),
    name,
    width,
    height,
    cells,
    warpYarnId,
    weftYarnId,
    createdAt: now,
    updatedAt: now,
  };
}

export function clonePattern(p: WeavePattern, newName?: string): WeavePattern {
  const now = Date.now();
  return {
    ...p,
    id: uid(),
    name: newName ?? p.name + ' 副本',
    cells: p.cells.slice(),
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- 基本组织生成 ----------

/** 平纹:棋盘格 */
export function generatePlain(width: number, height: number): Uint8Array {
  const cells = new Uint8Array(width * height);
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) cells[r * width + c] = (r + c) % 2;
  return cells;
}

/**
 * 斜纹(经面斜纹,经浮点组成的斜飞线)
 * @param repeat 组织循环大小 n
 * @param up 每个循环内连续经浮点根数 k (n 枚 k 飞)
 * @param step 飞数 S,与 n 互质时形成完整循环,默认 1
 */
export function generateTwill(width: number, height: number, repeat: number, up: number, step = 1): Uint8Array {
  const cells = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      // 循环内:列 c,行 r;斜纹线满足 (c - step*r) mod repeat < up
      const d = wrap(c - step * r, repeat);
      cells[r * width + c] = d < up ? 1 : 0;
    }
  }
  return cells;
}

/** 最大公约数 */
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * 缎纹:n 枚 S 飞(要求 n>=5 且 gcd(n,S)=1,1<S<n-1)
 * 经浮点按行以飞数 S 错开排列
 */
export function satinStepOptions(n: number): number[] {
  const out: number[] = [];
  for (let s = 2; s < n - 1; s++) if (gcd(n, s) === 1) out.push(s);
  return out;
}

export function generateSatin(width: number, height: number, repeat: number, step: number): Uint8Array {
  if (gcd(repeat, step) !== 1) throw new Error(`缎纹要求 ${repeat} 与飞数 ${step} 互质`);
  const cells = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) {
    // 第 r 行的经浮点列(循环坐标):(起点 + r*S) mod n
    const warpCol = wrap(r * step, repeat);
    for (let c = 0; c < width; c++) {
      if (wrap(c, repeat) === warpCol) cells[r * width + c] = 1;
    }
  }
  return cells;
}

// ---------- 变换 ----------

export function invertCells(p: WeavePattern): void {
  for (let i = 0; i < p.cells.length; i++) p.cells[i] = p.cells[i] ? 0 : 1;
  p.updatedAt = Date.now();
}

export function rotateCW(p: WeavePattern): void {
  const { width: w, height: h, cells } = p;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) out[c * h + (h - 1 - r)] = cells[r * w + c];
  p.cells = out;
  p.width = h;
  p.height = w;
  p.updatedAt = Date.now();
}

export function mirrorHorizontal(p: WeavePattern): void {
  const { width: w, height: h, cells } = p;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) out[r * w + (w - 1 - c)] = cells[r * w + c];
  p.cells = out;
  p.updatedAt = Date.now();
}

/** 调整尺寸:保留左上角,新区域按循环规则平铺(保证无缝) */
export function resizePattern(p: WeavePattern, newW: number, newH: number): void {
  const out = new Uint8Array(newW * newH);
  for (let r = 0; r < newH; r++)
    for (let c = 0; c < newW; c++) out[r * newW + c] = getCell(p, c, r);
  p.cells = out;
  p.width = newW;
  p.height = newH;
  p.updatedAt = Date.now();
}

/** 用新数组整体替换(生成器/导入用) */
export function replaceCells(p: WeavePattern, cells: Uint8Array, w: number, h: number): void {
  if (cells.length !== w * h) throw new Error('cells 长度与尺寸不符');
  p.cells = cells;
  p.width = w;
  p.height = h;
  p.updatedAt = Date.now();
}
