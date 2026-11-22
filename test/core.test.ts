import { describe, it, expect } from 'vitest';
import {
  createPattern,
  generatePlain,
  generateTwill,
  generateSatin,
  satinStepOptions,
  gcd,
  resizePattern,
  rotateCW,
  invertCells,
  getCell,
} from '../src/core/weave';
import { analyzeAll, analyzeSide, runsForYarn, runCells, auditPattern } from '../src/core/float';
import { buildGeometry, verifyGeometryAgainstCells } from '../src/core/geometry';
import type { Yarn } from '../src/core/types';

const yarnW: Yarn = { id: 'w', name: 'w', color: '#ffffff', thickness: 1, twist: 1, luster: 0.8, kind: 'filament' };
const yarnF: Yarn = { id: 'f', name: 'f', color: '#000000', thickness: 1, twist: 1, luster: 0.8, kind: 'filament' };

function pattern(w: number, h: number, cells: Uint8Array, name = 't') {
  const p = createPattern(w, h, name, 'w', 'f');
  p.cells = cells;
  return p;
}

describe('基本组织生成', () => {
  it('平纹是棋盘格,相邻格组织点相反', () => {
    const c = generatePlain(8, 8);
    expect(c[0]).toBe(0);
    expect(c[1]).toBe(1);
    expect(c[8]).toBe(1);
    for (let r = 0; r < 8; r++)
      for (let cc = 0; cc < 8; cc++) expect(c[r * 8 + cc]).toBe((r + cc) % 2);
  });

  it('2/2 斜纹循环正确', () => {
    const c = generateTwill(8, 8, 4, 2, 1);
    // 行0: 列0,1 为经浮
    expect(c[0]).toBe(1);
    expect(c[1]).toBe(1);
    expect(c[2]).toBe(0);
    // 行1 整体右移1
    expect(c[8 + 1]).toBe(1);
    expect(c[8 + 2]).toBe(1);
  });

  it('缎纹飞数与枚数互质,每行恰好一个经浮点', () => {
    expect(gcd(8, 5)).toBe(1);
    expect(satinStepOptions(8)).toContain(5);
    const c = generateSatin(8, 8, 8, 5);
    for (let r = 0; r < 8; r++) {
      const row = c.slice(r * 8, r * 8 + 8);
      expect(row.reduce((a, b) => a + b, 0)).toBe(1);
    }
  });

  it('非互质参数抛错', () => {
    expect(() => generateSatin(8, 8, 8, 4)).toThrow();
  });
});

describe('浮长分析 —— 与组织图逐格一致', () => {
  it('平纹所有浮长段长度为 1', () => {
    const p = pattern(8, 8, generatePlain(8, 8));
    const s = analyzeAll(p, 5);
    expect(s.warp.runs.length).toBe(8 * 4); // 每列 4 段
    expect(s.weft.runs.length).toBe(8 * 4);
    expect(s.warp.maxLength).toBe(1);
    expect(s.weft.maxLength).toBe(1);
  });

  it('手工构造的经浮长 3 被准确识别', () => {
    // 6x6:列2的行1,2,3 为连续经浮
    const c = new Uint8Array(36);
    c[1 * 6 + 2] = 1;
    c[2 * 6 + 2] = 1;
    c[3 * 6 + 2] = 1;
    const p = pattern(6, 6, c);
    const runs = runsForYarn(p, 'warp', 2);
    expect(runs).toHaveLength(1);
    expect(runs[0].length).toBe(3);
    expect(runs[0].start).toBe(1);
    expect(runCells(runs[0], 6)).toEqual([
      { c: 2, r: 1 },
      { c: 2, r: 2 },
      { c: 2, r: 3 },
    ]);
  });

  it('循环首尾相接的浮长段被合并', () => {
    // 4x4 列0:行0和行3为1(循环相邻),行1,2为0
    const c = new Uint8Array(16);
    c[0 * 4 + 0] = 1;
    c[3 * 4 + 0] = 1;
    const p = pattern(4, 4, c);
    const runs = runsForYarn(p, 'warp', 0);
    expect(runs).toHaveLength(1);
    expect(runs[0].length).toBe(2);
    expect(runCells(runs[0], 4).map((x) => x.r).sort()).toEqual([0, 3]);
  });

  it('全经面组织返回整列浮长且无边界误报', () => {
    const c = new Uint8Array(16).fill(1);
    const p = pattern(4, 4, c);
    const s = analyzeSide(p, 'warp', 5);
    expect(s.runs).toHaveLength(4);
    expect(s.runs.every((r) => r.length === 4)).toBe(true);
    const audit = auditPattern(p, 5);
    expect(audit.ok).toBe(true);
  });

  it('纬浮长:连续 0 沿行方向识别', () => {
    const c = new Uint8Array(25);
    // 行2 列 1,2,3 为 0(其余填1)
    c.fill(1);
    c[2 * 5 + 1] = 0;
    c[2 * 5 + 2] = 0;
    c[2 * 5 + 3] = 0;
    const p = pattern(5, 5, c);
    const runs = runsForYarn(p, 'weft', 2);
    expect(runs).toHaveLength(1);
    expect(runs[0].length).toBe(3);
  });

  it('审计:每个格子恰好被一段对应浮长覆盖', () => {
    const p = pattern(16, 16, generateTwill(16, 16, 4, 2, 1));
    const audit = auditPattern(p, 5);
    expect(audit.ok).toBe(true);
    expect(audit.checkedCells).toBe(16 * 16);
  });

  it('缎纹审计通过且长浮长统计正确', () => {
    const p = pattern(8, 8, generateSatin(8, 8, 8, 5));
    const s = analyzeAll(p, 4);
    // 8枚缎纹:每列恰好1个经浮点 -> 经浮长=1,纬浮长=7(长纬浮是缎纹光泽来源)
    expect(s.warp.maxLength).toBe(1);
    expect(s.weft.maxLength).toBe(7);
    expect(s.weft.longFloats).toBeGreaterThan(0);
    expect(auditPattern(p, 4).ok).toBe(true);
  });

  it('大尺寸(512x512)分析在合理时间内完成且审计通过', () => {
    const p = pattern(512, 512, generateTwill(512, 512, 8, 3, 1));
    const t0 = Date.now();
    const audit = auditPattern(p, 5);
    const elapsed = Date.now() - t0;
    expect(audit.ok).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('几何与浮长一致性', () => {
  it('几何校验:所有经浮长格点在上层、纬浮长格点在上层', () => {
    const p = pattern(12, 12, generateTwill(12, 12, 4, 2, 1));
    const mismatches = verifyGeometryAgainstCells(p);
    expect(mismatches).toHaveLength(0);
  });

  it('几何段数 = 2WH(每根纱线每个格间一段)', () => {
    const p = pattern(6, 4, generatePlain(6, 4));
    const g = buildGeometry(p, { warpYarn: yarnW, weftYarn: yarnF, twistVisible: true });
    expect(g.warpCount).toBe(6 * 4);
    expect(g.weftCount).toBe(4 * 6);
  });

  it('实例高度与 cells 直接对应(浮点反转则上下层交换)', () => {
    const c = new Uint8Array(4);
    c[0] = 1; // (0,0) 经浮
    const p = pattern(2, 2, c);
    const g = buildGeometry(p, { warpYarn: yarnW, weftYarn: yarnF, twistVisible: false });
    // 经纱列0段0起点处于上层(高度>0)
    expect(g.warpData[2]).toBeGreaterThan(0);
    // 经纱列1起点(0,0 处为0)处于下层
    const col1Offset = 2 * 16; // 列1段0
    expect(g.warpData[col1Offset + 2]).toBeLessThan(0);
    // 两段高度绝对值相同、符号相反
    expect(g.warpData[2]).toBe(-g.warpData[col1Offset + 2]);
  });

  it('任意变换(反转/旋转/缩放)后审计与几何校验仍一致', () => {
    const p = pattern(8, 8, generateSatin(8, 8, 8, 5));
    invertCells(p);
    expect(auditPattern(p, 5).ok).toBe(true);
    expect(verifyGeometryAgainstCells(p)).toHaveLength(0);
    rotateCW(p);
    expect(auditPattern(p, 5).ok).toBe(true);
    resizePattern(p, 12, 10);
    expect(auditPattern(p, 5).ok).toBe(true);
    expect(verifyGeometryAgainstCells(p)).toHaveLength(0);
    // 缩放后循环取格与原组织一致
    expect(getCell(p, 9, 9)).toBe(getCell(p, 1, 1));
  });
});
