// 图片导入:缩放 -> 限色量化(k-means) -> 二值化为提花组织
// 约定:亮色区域 -> 经浮点(经纱在上),暗色区域 -> 纬浮点

export interface ImageConvertResult {
  cells: Uint8Array;
  width: number;
  height: number;
  palette: string[];
  /** 量化后的预览图(原图尺寸的小图),dataURL */
  quantizedPreview: string;
  /** 使用的明暗阈值 */
  threshold: number;
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function kmeans(samples: RGB[], k: number): RGB[] {
  k = Math.min(k, samples.length);
  // k-means++ 初始化
  const centers: RGB[] = [samples[Math.floor(Math.random() * samples.length)]];
  while (centers.length < k) {
    const d2 = samples.map((s) => {
      let best = Infinity;
      for (const c of centers) {
        const d = (s.r - c.r) ** 2 + (s.g - c.g) ** 2 + (s.b - c.b) ** 2;
        best = Math.min(best, d);
      }
      return best;
    });
    const sum = d2.reduce((a, b) => a + b, 0) || 1;
    let pick = Math.random() * sum;
    let idx = 0;
    for (let i = 0; i < d2.length; i++) {
      pick -= d2[i];
      if (pick <= 0) {
        idx = i;
        break;
      }
    }
    centers.push(samples[idx]);
  }

  const assign = new Int16Array(samples.length);
  for (let iter = 0; iter < 12; iter++) {
    let moved = 0;
    for (let i = 0; i < samples.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const d =
          (samples[i].r - centers[j].r) ** 2 +
          (samples[i].g - centers[j].g) ** 2 +
          (samples[i].b - centers[j].b) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        moved++;
      }
    }
    if (moved === 0 && iter > 0) break;
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      const j = assign[i];
      sums[j][0] += samples[i].r;
      sums[j][1] += samples[i].g;
      sums[j][2] += samples[i].b;
      sums[j][3]++;
    }
    for (let j = 0; j < centers.length; j++) {
      if (sums[j][3] > 0) {
        centers[j] = {
          r: sums[j][0] / sums[j][3],
          g: sums[j][1] / sums[j][3],
          b: sums[j][2] / sums[j][3],
        };
      } else if (samples.length) {
        // 空簇重新播种到随机样本,避免聚类塌缩成重复颜色
        centers[j] = { ...samples[Math.floor(Math.random() * samples.length)] };
      }
    }
  }
  return centers;
}

const lum = (c: RGB) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const rgbHex = (c: RGB) =>
  '#' +
  [c.r, c.g, c.b]
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('');

export interface ConvertOptions {
  width: number;
  height: number;
  maxColors: number;
  dither: boolean;
}

export function imageToCells(img: HTMLImageElement, opts: ConvertOptions): ImageConvertResult {
  const { width: w, height: h, maxColors } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // 抽样做 k-means(最多 6000 个样本,保证大图也快)
  const sampleStep = Math.max(1, Math.floor(Math.sqrt((w * h) / 6000)));
  const samples: RGB[] = [];
  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  }
  const centers = kmeans(samples, Math.max(2, Math.min(8, maxColors)));
  centers.sort((a, b) => lum(a) - lum(b));
  const palette = centers.map(rgbHex);

  // 全图分配到最近聚类
  const quantized = new Uint8ClampedArray(w * h * 4);
  const nearest = (r: number, g: number, b: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let j = 0; j < centers.length; j++) {
      const d = (r - centers[j].r) ** 2 + (g - centers[j].g) ** 2 + (b - centers[j].b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    return best;
  };

  const work = Float32Array.from(data);
  const cells = new Uint8Array(w * h);

  if (opts.dither) {
    // Floyd-Steinberg 抖动:在聚类空间量化后扩散误差
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const j = nearest(work[i], work[i + 1], work[i + 2]);
        const c = centers[j];
        quantized[i] = c.r;
        quantized[i + 1] = c.g;
        quantized[i + 2] = c.b;
        quantized[i + 3] = 255;
        const er = work[i] - c.r;
        const eg = work[i + 1] - c.g;
        const eb = work[i + 2] - c.b;
        const spread = (dx: number, dy: number, f: number) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny >= h) return;
          const ni = (ny * w + nx) * 4;
          work[ni] += er * f;
          work[ni + 1] += eg * f;
          work[ni + 2] += eb * f;
        };
        spread(1, 0, 7 / 16);
        spread(-1, 1, 3 / 16);
        spread(0, 1, 5 / 16);
        spread(1, 1, 1 / 16);
      }
    }
  } else {
    for (let i = 0; i < w * h; i++) {
      const j = nearest(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      const c = centers[j];
      quantized[i * 4] = c.r;
      quantized[i * 4 + 1] = c.g;
      quantized[i * 4 + 2] = c.b;
      quantized[i * 4 + 3] = 255;
    }
  }

  // 阈值:聚类按亮度排序后,取中间分界(让亮/暗聚类各归一侧)
  const split = Math.floor(centers.length / 2);
  const threshold = (lum(centers[split - 1]) + lum(centers[split])) / 2;
  for (let i = 0; i < w * h; i++) {
    const c: RGB = { r: quantized[i * 4], g: quantized[i * 4 + 1], b: quantized[i * 4 + 2] };
    cells[i] = lum(c) >= threshold ? 1 : 0;
  }

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.putImageData(new ImageData(quantized, w, h), 0, 0);

  return {
    cells,
    width: w,
    height: h,
    palette,
    quantizedPreview: out.toDataURL('image/png'),
    threshold,
  };
}
