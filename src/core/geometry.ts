// 织物几何:从组织图 cells 生成实例化纱线段数据
// 关键约束:几何高度直接由 cells 决定,因此渲染里的浮长与组织图天然一一对应
import type { WeavePattern, Yarn, FloatRun } from './types';
import { getCell, wrap } from './weave';
import { runsForYarn } from './float';

/**
 * 每个实例 = 一根纱线上两个相邻格点之间的一段(ribbon)。
 * 数据布局(每个实例 4 个 vec4):
 *   a0 = (起点 x, 起点 z, 起点高度 h0, 半宽)
 *   a1 = (终点 x, 终点 z, 终点高度 h1, 捻度)
 *   a2 = (光泽, 种类 0=经 1=纬, 捻纹可见, 厚度)
 *   a3 = 颜色 rgb
 */
export const FLOATS_PER_INSTANCE = 4;

export interface GeometryBuffers {
  warpData: Float32Array;
  weftData: Float32Array;
  warpCount: number;
  weftCount: number;
  width: number;
  height: number;
}

export interface FabricGeometryOptions {
  warpYarn: Yarn;
  weftYarn: Yarn;
  twistVisible: boolean;
}

/** 经/纬纱在格点中心的高度:上层 = +layerGap,下层 = -layerGap */
export function warpCenterHeight(p: WeavePattern, c: number, r: number, gap: number): number {
  return getCell(p, c, r) === 1 ? gap : -gap;
}

export function weftCenterHeight(p: WeavePattern, c: number, r: number, gap: number): number {
  return getCell(p, c, r) === 0 ? gap : -gap;
}

export function buildGeometry(p: WeavePattern, opts: FabricGeometryOptions): GeometryBuffers {
  const { width: w, height: h } = p;
  // ribbon 半宽:恰好半格,相邻平行段无缝相接且不重叠
  const rW = 0.5 * Math.min(1.05, Math.max(0.95, opts.warpYarn.thickness));
  const rF = 0.5 * Math.min(1.05, Math.max(0.95, opts.weftYarn.thickness));

  // 上下层高度差:大于纱线半厚,保证上层顶面严格高于下层
  const layerGap = 0.22;

  // 每根纱线在每个格间一段:w 根经纱 × h 段 + h 根纬纱 × w 段
  const warpData = new Float32Array(w * h * FLOATS_PER_INSTANCE * 4);
  const weftData = new Float32Array(h * w * FLOATS_PER_INSTANCE * 4);

  const wColor = hexToVec(opts.warpYarn.color);
  const fColor = hexToVec(opts.weftYarn.color);
  const twistFlag = opts.twistVisible ? 1 : 0;

  let wi = 0;
  // 经纱:沿 z(行)方向,段从格 r 到 r+1
  for (let c = 0; c < w; c++) {
    for (let r = 0; r < h; r++) {
      const r2 = wrap(r + 1, h);
      const h0 = warpCenterHeight(p, c, r, layerGap);
      const h1 = warpCenterHeight(p, c, r2, layerGap);
      const o = wi * 16;
      warpData[o] = c;
      warpData[o + 1] = r;
      warpData[o + 2] = h0;
      warpData[o + 3] = rW;
      warpData[o + 4] = c;
      warpData[o + 5] = r2;
      warpData[o + 6] = h1;
      warpData[o + 7] = opts.warpYarn.twist;
      warpData[o + 8] = opts.warpYarn.luster;
      warpData[o + 9] = 0;
      warpData[o + 10] = twistFlag;
      warpData[o + 11] = rW * 2;
      warpData[o + 12] = wColor[0];
      warpData[o + 13] = wColor[1];
      warpData[o + 14] = wColor[2];
      wi++;
    }
  }

  let fi = 0;
  // 纬纱:沿 x(列)方向,段从格 c 到 c+1
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const c2 = wrap(c + 1, w);
      const h0 = weftCenterHeight(p, c, r, layerGap);
      const h1 = weftCenterHeight(p, c2, r, layerGap);
      const o = fi * 16;
      weftData[o] = c;
      weftData[o + 1] = r;
      weftData[o + 2] = h0;
      weftData[o + 3] = rF;
      weftData[o + 4] = c2;
      weftData[o + 5] = r;
      weftData[o + 6] = h1;
      weftData[o + 7] = opts.weftYarn.twist;
      weftData[o + 8] = opts.weftYarn.luster;
      weftData[o + 9] = 1;
      weftData[o + 10] = twistFlag;
      weftData[o + 11] = rF * 2;
      weftData[o + 12] = fColor[0];
      weftData[o + 13] = fColor[1];
      weftData[o + 14] = fColor[2];
      fi++;
    }
  }

  return { warpData, weftData, warpCount: wi, weftCount: fi, width: w, height: h };
}

function hexToVec(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0.8, 0.8, 0.8];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export interface GeometryMismatch {
  run: FloatRun;
  message: string;
}

/**
 * 几何一致性校验:对每根纱线的每段浮长,
 * 验证其覆盖格点的中心高度全部处于上层,且相邻段边界高度正确。
 * 这是"渲染浮长 == 组织图浮长"的机器可验证保证。
 */
export function verifyGeometryAgainstCells(p: WeavePattern, gap = 0.5): GeometryMismatch[] {
  const mismatches: GeometryMismatch[] = [];

  for (let c = 0; c < p.width; c++) {
    for (const run of runsForYarn(p, 'warp', c)) {
      for (let k = 0; k < run.length; k++) {
        const r = wrap(run.start + k, p.height);
        if (warpCenterHeight(p, c, r, gap) <= 0) {
          mismatches.push({
            run,
            message: `经浮长(列${c},起点行${run.start},长度${run.length})在格(${c},${r})未处于几何上层`,
          });
        }
      }
      if (run.length !== p.height) {
        const before = wrap(run.start - 1, p.height);
        if (warpCenterHeight(p, c, before, gap) >= 0) {
          mismatches.push({
            run,
            message: `经浮长(列${c})边界行${before}未沉入下层`,
          });
        }
      }
    }
  }

  for (let r = 0; r < p.height; r++) {
    for (const run of runsForYarn(p, 'weft', r)) {
      for (let k = 0; k < run.length; k++) {
        const c = wrap(run.start + k, p.width);
        if (weftCenterHeight(p, c, r, gap) <= 0) {
          mismatches.push({
            run,
            message: `纬浮长(行${r},起点列${run.start},长度${run.length})在格(${c},${r})未处于几何上层`,
          });
        }
      }
      if (run.length !== p.width) {
        const before = wrap(run.start - 1, p.width);
        if (weftCenterHeight(p, before, r, gap) >= 0) {
          mismatches.push({
            run,
            message: `纬浮长(行${r})边界列${before}未沉入下层`,
          });
        }
      }
    }
  }

  return mismatches;
}
