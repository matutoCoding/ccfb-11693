// localStorage 持久化 + 导入导出打包
import type { WeavePattern, Yarn, AppSettings, BundleFile } from './types';
import { bytesToBase64, base64ToBytes } from './util';

const PATTERNS_KEY = 'jacquard.patterns.v1';
const YARNS_KEY = 'jacquard.yarns.v1';
const SETTINGS_KEY = 'jacquard.settings.v1';

export function loadPatterns(): WeavePattern[] {
  try {
    const raw = localStorage.getItem(PATTERNS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Array<Omit<WeavePattern, 'cells'> & { cellsBase64: string }>;
    return arr.map((e) => ({
      ...e,
      cells: base64ToBytes(e.cellsBase64),
    }));
  } catch (err) {
    console.error('读取花型失败', err);
    return [];
  }
}

export function savePatterns(patterns: WeavePattern[]): void {
  const payload = patterns.map((p) => {
    const { cells, ...rest } = p;
    return { ...rest, cellsBase64: bytesToBase64(cells) };
  });
  localStorage.setItem(PATTERNS_KEY, JSON.stringify(payload));
}

export function loadYarns(): Yarn[] | null {
  try {
    const raw = localStorage.getItem(YARNS_KEY);
    return raw ? (JSON.parse(raw) as Yarn[]) : null;
  } catch {
    return null;
  }
}

export function saveYarns(yarns: Yarn[]): void {
  localStorage.setItem(YARNS_KEY, JSON.stringify(yarns));
}

export function loadSettings(): AppSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as AppSettings) : null;
  } catch {
    return null;
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function buildBundle(patterns: WeavePattern[], yarns: Yarn[]): BundleFile {
  return {
    format: 'jacquard-studio-bundle',
    version: 1,
    exportedAt: Date.now(),
    patterns: patterns.map((p) => {
      const { cells, ...rest } = p;
      return { ...rest, cellsBase64: bytesToBase64(cells) };
    }),
    yarns,
  };
}

export function parseBundle(text: string): { patterns: WeavePattern[]; yarns: Yarn[] } {
  const data = JSON.parse(text) as BundleFile;
  if (data.format !== 'jacquard-studio-bundle' || data.version !== 1) {
    throw new Error('文件格式或版本不支持');
  }
  const patterns = data.patterns.map((e) => ({
    ...e,
    cells: base64ToBytes(e.cellsBase64),
  }));
  return { patterns, yarns: data.yarns ?? [] };
}
