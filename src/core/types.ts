// 核心数据类型 —— 全系统单一数据源定义

/** 组织点:1 = 经浮点(经纱在上),0 = 纬浮点(纬纱在上) */
export type CellValue = 0 | 1;

export interface WeavePattern {
  id: string;
  name: string;
  /** 列数 = 经纱根数 */
  width: number;
  /** 行数 = 纬纱根数 */
  height: number;
  /** row-major 组织点数组,长度 width*height,索引 r*width+c */
  cells: Uint8Array;
  warpYarnId: string;
  weftYarnId: string;
  createdAt: number;
  updatedAt: number;
  note?: string;
}

export type YarnKind = 'filament' | 'spun';

export interface Yarn {
  id: string;
  name: string;
  /** 十六进制颜色 */
  color: string;
  /** 直径(织物单位,0.5~2.0) */
  thickness: number;
  /** 捻度:每根交叉纱上的捻回数 0~4 */
  twist: number;
  /** 光泽强度 0~1(各向异性高光) */
  luster: number;
  kind: YarnKind;
}

export interface AppSettings {
  repeatX: number;
  repeatY: number;
  /** 纱线截面边数 4/6/8 */
  tubeSides: number;
  bgColor: string;
  aoStrength: number;
  twistVisible: boolean;
  lightAzimuth: number;
  lightElevation: number;
  /** 长浮长判定阈值(连续压过几根) */
  longFloatThreshold: number;
}

/** 一段连续浮长 */
export interface FloatRun {
  kind: 'warp' | 'weft';
  /** 所属纱线序号:经纱=列号,纬纱=行号 */
  yarnIndex: number;
  /** 起点(经浮长为行号序列起点,纬浮长为列号序列起点) */
  start: number;
  /** 连续长度(压过的纱线根数) */
  length: number;
}

export interface FloatSideStats {
  runs: FloatRun[];
  totalRuns: number;
  maxLength: number;
  meanLength: number;
  /** 长度 >= 长浮长阈值的段数 */
  longFloats: number;
}

export interface FloatStats {
  warp: FloatSideStats;
  weft: FloatSideStats;
}

export interface AuditIssue {
  message: string;
  run?: FloatRun;
}

export interface AuditResult {
  ok: boolean;
  checkedRuns: number;
  checkedCells: number;
  issues: AuditIssue[];
}

/** 导入/导出文件格式 */
export interface BundleFile {
  format: 'jacquard-studio-bundle';
  version: 1;
  exportedAt: number;
  patterns: Array<Omit<WeavePattern, 'cells'> & { cellsBase64: string }>;
  yarns: Yarn[];
}
