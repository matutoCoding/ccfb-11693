# 提花组织设计与织物渲染系统 (Jacquard Studio)

浏览器内的提花组织设计 + 真实感织物渲染工具。TypeScript + WebGL2,无第三方渲染依赖,数据全部保存在浏览器本地。

## 启动

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建
npm run test       # 核心逻辑单元测试(Vitest)
npm run preview    # 预览生产构建
```

需要支持 WebGL2 的浏览器(Chrome/Edge/Firefox 近年版本均可)。

## 六大页面

| 页面 | 功能 |
| --- | --- |
| 花型列表 | 新建/复制/重命名/删除,缩略图,JSON 打包导出导入,组织图 PNG 导出 |
| 组织设计 | Canvas 格子编辑(画笔/直线/矩形/循环填充/取色),平纹/斜纹/缎纹一键生成,经纬反转/旋转/镜像/缩放,图片量化导入,浮长统计与逐格审计 |
| 纱线库 | 颜色、粗细、捻度、光泽(各向异性强度)、长丝/短纤;花型经/纬分别指定 |
| 织物预览 | WebGL2 三维交织渲染,轨道相机,可拖动光源,循环平铺,实时 FPS/HUD,渲染截图 |
| 对比 | 两个花型并排,共享光源与渲染参数,浮长统计对照 |
| 设置 | 渲染参数、长浮长阈值、本地存储管理 |

## 核心架构:为什么浮长与渲染能逐格一致

系统只有**一份组织数据** `WeavePattern.cells: Uint8Array`(1=经浮点,0=纬浮点),
浮长统计和三维几何都从它直接派生,不存在两套可能不一致的模型。

```
cells (单一数据源)
  ├─ core/float.ts      循环 run-length 扫描 → 浮长段 / 统计 / 审计
  ├─ core/geometry.ts   每格高度 = cells 决定的 ±layerGap → 实例缓冲
  └─ ui/WeaveEditor.ts  画布渲染与编辑,写回同一份 cells
```

- **浮长分析** (`core/float.ts`):对每根经纱(列)/纬纱(行)做循环首尾相接的连续段扫描,
  输出每段的起点、长度、所属纱线。`auditPattern()` 再逐格回算验证:
  段内每格组织点正确、段边界为相反组织点、每个格子恰好被一段对应浮长覆盖。
- **几何一致性** (`core/geometry.ts` 的 `verifyGeometryAgainstCells`):
  对每段浮长验证其覆盖格点的纱线中心高度全部在上层、边界沉入下层。
  渲染器只消费这个几何缓冲,因此画面里看到的每段浮长都可回溯到组织图的具体格子。
- 单元测试 `test/core.test.ts` 覆盖平/斜/缎生成、循环浮长(含首尾相接)、
  审计覆盖完整性、几何高度符号、反转/旋转/缩放后的不变性,以及 512×512 的性能。

## 渲染方案

- 每根纱线在相邻格点之间是一个**实例化盒段**(顶/底/左右壁共 4 个 TRIANGLE_STRIP)。
  经纱、纬纱各一个 VAO,各自一次 `drawArraysInstanced`,不依赖 `baseInstance` 扩展,兼容更多驱动。
- 512×512 组织 = 524,288 个实例段,实测稳定 60 FPS;几何重建约 50ms,编辑时自动合并高频修改。
- 相机旋转、光源移动只改变 uniform,不重建几何缓冲。
- 片元着色器使用 **Kajiya-Kay 各向异性高光**:高光带沿纱线轴向拉长,
  光源方位/仰角改变时光带在纱线表面游走;捻纹通过螺旋相位扰动法线表现。

## 图片转组织

`core/imageImport.ts`:缩放到目标尺寸 → k-means++ 颜色量化(颜色数 2~8 可调)→
按聚类亮度阈值二值化(亮→经浮点),可选 Floyd-Steinberg 抖动。输出量化预览和调色板。

## 目录结构

```
src/
  core/        纯领域逻辑(无 DOM 依赖,可独立测试)
    types.ts weave.ts float.ts geometry.ts imageImport.ts storage.ts store.ts util.ts
  render/      WebGL2 渲染器、GLSL、轨道控制、矩阵
  ui/          页面与组件
  test/        Vitest 单元测试
```
