// ---------- 数据模型 ----------

/** 纱线规格 */
export interface YarnSpec {
  id: string;
  name: string;
  /** 颜色 #rrggbb */
  color: string;
  /** 粗细(纱线直径,相对单位 0.1~1.0,1 = 占满一个组织点间距) */
  thickness: number;
  /** 捻度(捻/米,影响表面扭转纹理) */
  twist: number;
  /** 光泽度 0~1(0 哑光,1 强丝光) */
  gloss: number;
}

/** 花型(组织图)。grid[y*w+x]: 1=经浮(经纱在上), 0=纬浮(纬纱在上) */
export interface Pattern {
  id: string;
  name: string;
  width: number;
  height: number;
  grid: Uint8Array;
  warpYarnId: string;
  weftYarnId: string;
  createdAt: number;
  updatedAt: number;
}

/** 序列化用 */
export interface PatternJSON {
  id: string;
  name: string;
  width: number;
  height: number;
  /** base64 编码的 grid */
  grid: string;
  warpYarnId: string;
  weftYarnId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  defaultWidth: number;
  defaultHeight: number;
  /** 渲染径向分段数(质量) */
  radialSegments: number;
  lightAzimuth: number;
  lightElevation: number;
  autoRotateLight: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultWidth: 64,
  defaultHeight: 64,
  radialSegments: 8,
  lightAzimuth: 45,
  lightElevation: 55,
  autoRotateLight: false,
};

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}
