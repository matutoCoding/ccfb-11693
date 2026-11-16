// ---------- 由组织图生成纱线交织几何的实例数据 ----------
// 每个组织点一个实例(该点浮在最上面的那段纱线)。
// STRIDE=8: [cx, cy, isWarp, elev, floatLen, runPos, thickness, gloss]
//   cx, cy    组织点中心坐标(格子单位)
//   isWarp    1=该点经纱在上(经浮) 0=纬纱在上(纬浮) —— 与 grid 逐格一致
//   elev      纱线高度(含浮长端部下压的屈曲)
//   floatLen  该点所属浮长段的长度 —— 与组织图逐格一致(见 weave.verifyInstancesAgainstGrid)
//   runPos    该点在浮长段中的位置 0..1
//   thickness 纱线粗细(半径,格子单位的倍数)
//   gloss     光泽度 0..1

import { YarnSpec } from './types';

export const STRIDE = 8;

export function buildInstances(
  grid: Uint8Array, w: number, h: number,
  warpYarn: YarnSpec, weftYarn: YarnSpec
): Float32Array {
  const out = new Float32Array(w * h * STRIDE);
  const lift = (warpYarn.thickness + weftYarn.thickness) * 0.45; // 层间高度差

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = grid[y * w + x];
      const i = (y * w + x) * STRIDE;
      const yarn = v === 1 ? warpYarn : weftYarn;

      // 浮长段: 经浮沿列(y方向)延伸,纬浮沿行(x方向)延伸
      let len = 1, pos = 0;
      if (v === 1) {
        let y0 = y; while (y0 > 0 && grid[(y0 - 1) * w + x] === 1) y0--;
        let y1 = y; while (y1 < h - 1 && grid[(y1 + 1) * w + x] === 1) y1++;
        len = y1 - y0 + 1; pos = y - y0;
      } else {
        let x0 = x; while (x0 > 0 && grid[y * w + x0 - 1] === 0) x0--;
        let x1 = x; while (x1 < w - 1 && grid[y * w + x1 + 1] === 0) x1++;
        len = x1 - x0 + 1; pos = x - x0;
      }
      const p = len === 1 ? 0.5 : pos / (len - 1);
      // 浮长中段隆起、端部下压(屈曲),单格交织点保持全高
      const profile = len === 1 ? 1 : 0.62 + 0.38 * Math.sin(Math.PI * p);
      const elev = (v === 1 ? lift : 0) * profile;

      out[i] = x + 0.5;
      out[i + 1] = y + 0.5;
      out[i + 2] = v;
      out[i + 3] = elev;
      out[i + 4] = len;
      out[i + 5] = p;
      out[i + 6] = yarn.thickness * 0.5;
      out[i + 7] = yarn.gloss;
    }
  }
  return out;
}
