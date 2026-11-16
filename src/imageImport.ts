// ---------- 图片 → 提花组织 ----------
// 流程: 缩放 → 中位切分法量化到 N 色 → 各色按明度映射到不同经面比例的阴影缎纹
import { genShadeSatin } from './weave';

export interface ImportOptions {
  width: number;      // 目标组织宽度(经向循环)
  height: number;     // 目标组织高度
  maxColors: number;  // 颜色数量上限 2~8
  satinEnds: number;  // 基础缎纹枚数(5 或 8)
}

/** 中位切分法颜色量化 */
export function quantize(pixels: Uint8ClampedArray, count: number, maxColors: number): { palette: number[][]; indices: Uint8Array } {
  type Box = { idx: number[]; };
  const boxes: Box[] = [{ idx: Array.from({ length: count }, (_, i) => i) }];

  const channelRange = (box: Box, ch: number) => {
    let min = 255, max = 0;
    for (const i of box.idx) {
      const v = pixels[i * 4 + ch];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return max - min;
  };

  while (boxes.length < maxColors) {
    // 找最大色差的盒子
    let best = -1, bestRange = -1, bestCh = 0;
    for (let b = 0; b < boxes.length; b++) {
      if (boxes[b].idx.length < 2) continue;
      for (let ch = 0; ch < 3; ch++) {
        const r = channelRange(boxes[b], ch);
        if (r > bestRange) { bestRange = r; best = b; bestCh = ch; }
      }
    }
    if (best < 0) break;
    const box = boxes[best];
    box.idx.sort((a, b) => pixels[a * 4 + bestCh] - pixels[b * 4 + bestCh]);
    const mid = box.idx.length >> 1;
    boxes.splice(best, 1, { idx: box.idx.slice(0, mid) }, { idx: box.idx.slice(mid) });
  }

  const palette: number[][] = boxes.map((box) => {
    let r = 0, g = 0, b = 0;
    for (const i of box.idx) { r += pixels[i * 4]; g += pixels[i * 4 + 1]; b += pixels[i * 4 + 2]; }
    const n = box.idx.length || 1;
    return [r / n | 0, g / n | 0, b / n | 0];
  });

  // 每个像素归入最近调色板色
  const indices = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    let best = 0, bd = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const dr = pixels[i * 4] - palette[p][0];
      const dg = pixels[i * 4 + 1] - palette[p][1];
      const db = pixels[i * 4 + 2] - palette[p][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; best = p; }
    }
    indices[i] = best;
  }
  return { palette, indices };
}

/**
 * 图片文件 → 提花组织 grid。
 * 每个量化色按明度映射到一个阴影缎纹层级: 亮色=经面比例高(经纱色显), 暗色=纬面比例高。
 */
export async function imageToGrid(file: File, opt: ImportOptions): Promise<{ grid: Uint8Array; palette: number[][] }> {
  const bmp = await createImageBitmap(file);
  const cv = document.createElement('canvas');
  cv.width = opt.width; cv.height = opt.height;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, opt.width, opt.height);
  const data = ctx.getImageData(0, 0, opt.width, opt.height).data;

  const { palette, indices } = quantize(data, opt.width * opt.height, opt.maxColors);

  // 按明度排序调色板 → 层级 0..n-1
  const lum = palette.map((c, i) => ({ i, l: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] }));
  lum.sort((a, b) => a.l - b.l);
  const levelOf = new Uint8Array(palette.length);
  lum.forEach((e, rank) => (levelOf[e.i] = rank));
  const n = palette.length;

  // 为每个层级生成阴影缎纹(经面比例 = rank/(n-1))
  const ends = opt.satinEnds;
  const step = ends === 8 ? 3 : 2;
  const layers: Uint8Array[] = [];
  for (let k = 0; k < n; k++) {
    const level = n === 1 ? 0.5 : k / (n - 1);
    layers.push(genShadeSatin(ends, ends, ends, step, level));
  }

  const grid = new Uint8Array(opt.width * opt.height);
  for (let y = 0; y < opt.height; y++)
    for (let x = 0; x < opt.width; x++) {
      const lvl = levelOf[indices[y * opt.width + x]];
      grid[y * opt.width + x] = layers[lvl][(y % ends) * ends + (x % ends)];
    }
  return { grid, palette };
}
