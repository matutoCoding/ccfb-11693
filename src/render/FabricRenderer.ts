// WebGL2 实例化织物渲染器
import type { WeavePattern, Yarn, AppSettings } from '../core/types';
import { buildGeometry, type GeometryBuffers } from '../core/geometry';
import { TUBE_VERT, TUBE_FRAG, GROUND_VERT, GROUND_FRAG } from './shaders';
import { perspective, lookAt, multiply, clamp } from './mat4';

interface ProgramInfo {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('着色器编译失败: ' + log);
  }
  return sh;
}

function makeProgram(gl: WebGL2RenderingContext, vs: string, fs: string, uniformNames: string[]): ProgramInfo {
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fs));
  // 显式 location 已在着色器中指定,直接链接
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('程序链接失败: ' + gl.getProgramInfoLog(program));
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name);
  return { program, uniforms };
}

export interface RenderParams {
  repeatX: number;
  repeatY: number;
  tubeSides: number;
  bgColor: [number, number, number];
  aoStrength: number;
  twistVisible: boolean;
  lightAzimuth: number;  // 度
  lightElevation: number; // 度
}

export class FabricRenderer {
  private gl: WebGL2RenderingContext;
  private tubeProg: ProgramInfo;
  private groundProg: ProgramInfo;
  private warpVao: WebGLVertexArrayObject;
  private weftVao: WebGLVertexArrayObject;
  private ringVbo: WebGLBuffer;
  private warpVbo: WebGLBuffer;
  private weftVbo: WebGLBuffer;
  private groundVao: WebGLVertexArrayObject;
  private geom: GeometryBuffers | null = null;
  private pattern: WeavePattern | null = null;
  private cell = 1;
  private frame = 0;
  private raf = 0;
  private lastSides = 0;
  private destroyed = false;

  // 相机轨道
  azimuth = 25;
  elevation = 55;
  distance = 0;
  private target: [number, number, number] = [0, 0, 0];

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      preserveDrawingBuffer: true, // 截图需要
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2,请使用最新版 Chrome/Edge/Firefox');
    this.gl = gl;

    this.tubeProg = makeProgram(gl, TUBE_VERT, TUBE_FRAG, [
      'uViewProj', 'uGrid', 'uRepeat', 'uCell',
      'uLightDir', 'uViewPos', 'uBgColor', 'uAOStrength',
    ]);
    this.groundProg = makeProgram(gl, GROUND_VERT, GROUND_FRAG, [
      'uViewProj', 'uHalf', 'uGroundY', 'uBgColor', 'uLightDir',
    ]);

    this.ringVbo = gl.createBuffer()!;
    this.warpVbo = gl.createBuffer()!;
    this.weftVbo = gl.createBuffer()!;
    this.warpVao = this.createYarnVao(this.warpVbo);
    this.weftVao = this.createYarnVao(this.weftVbo);
    this.groundVao = this.createGround();

    gl.enable(gl.DEPTH_TEST);
    // 盒段各面绕序不统一,关闭剔除;不透明表面靠深度测试保证正确遮挡
    gl.disable(gl.CULL_FACE);
  }

  /** 每个纱线方向一个独立 VAO:共享盒段基础网格,各自绑定实例 VBO */
  private createYarnVao(instVbo: WebGLBuffer): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    // 盒段 16 顶点:顶/底/左右壁各 4 顶点 TRIANGLE_STRIP
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ringVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, 0, 1, 1, 0, 1, -1, 1, 1, 1, 1, 1,
        -1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0,
        -1, 0, 1, -1, 0, 0, -1, 1, 1, -1, 1, 0,
        1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0,
      ]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, instVbo);
    const stride = 16 * 4;
    for (let i = 0; i < 4; i++) {
      const loc = 1 + i;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, i * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  private createGround(): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  /** 重建几何缓冲(仅在组织图/纱线/捻纹开关变化时调用) */
  setGeometry(pattern: WeavePattern, warpYarn: Yarn, weftYarn: Yarn, twistVisible: boolean): void {
    const gl = this.gl;
    this.pattern = pattern;
    this.geom = buildGeometry(pattern, { warpYarn, weftYarn, twistVisible });

    // 经纬各自独立 VBO/VAO,避免依赖 baseInstance 扩展
    gl.bindBuffer(gl.ARRAY_BUFFER, this.warpVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.geom.warpData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.weftVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.geom.weftData, gl.STATIC_DRAW);

    if (this.distance === 0) this.frameView();
  }

  setTubeSides(_sides: number): void {
    // 盒段网格为固定 16 顶点;画质档位保留给调用方决定是否降采样,渲染本身与该值解耦
  }

  /** 让相机刚好容纳整块织物 */
  frameView(): void {
    if (!this.pattern) return;
    const span = Math.max(this.pattern.width, this.pattern.height) * this.cell;
    this.distance = span * 1.15;
  }

  render(params: RenderParams): void {
    if (this.destroyed || !this.geom || !this.pattern) return;
    const gl = this.gl;
    this.frame++;
    this.setTubeSides(params.tubeSides);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(params.bgColor[0], params.bgColor[1], params.bgColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = w / Math.max(1, h);
    const proj = perspective((40 * Math.PI) / 180, aspect, 0.1, 5000);
    const az = (this.azimuth * Math.PI) / 180;
    const el = (this.elevation * Math.PI) / 180;
    const eye: [number, number, number] = [
      this.distance * Math.cos(el) * Math.sin(az),
      this.distance * Math.sin(el),
      this.distance * Math.cos(el) * Math.cos(az),
    ];
    const view = lookAt(eye, this.target, [0, 1, 0]);
    const viewProj = multiply(proj, view);

    const la = (params.lightAzimuth * Math.PI) / 180;
    const le = (params.lightElevation * Math.PI) / 180;
    const lightDir: [number, number, number] = [
      Math.cos(le) * Math.sin(la),
      Math.sin(le),
      Math.cos(le) * Math.cos(la),
    ];

    // 地面
    const halfX = (this.pattern.width * this.cell * params.repeatX) / 2 + 4;
    const halfZ = (this.pattern.height * this.cell * params.repeatY) / 2 + 4;
    gl.useProgram(this.groundProg.program);
    gl.uniformMatrix4fv(this.groundProg.uniforms.uViewProj, false, viewProj);
    gl.uniform2f(this.groundProg.uniforms.uHalf, halfX, halfZ);
    gl.uniform1f(this.groundProg.uniforms.uGroundY, -1.35);
    gl.uniform3f(this.groundProg.uniforms.uBgColor, ...params.bgColor);
    gl.uniform3f(this.groundProg.uniforms.uLightDir, ...lightDir);
    gl.bindVertexArray(this.groundVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 纱线(经/纬两次实例绘制,同一 VBO 偏移)
    gl.useProgram(this.tubeProg.program);
    const u = this.tubeProg.uniforms;
    gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
    gl.uniform2f(u.uGrid, this.pattern.width, this.pattern.height);
    gl.uniform2f(u.uRepeat, params.repeatX, params.repeatY);
    gl.uniform1f(u.uCell, this.cell);
    gl.uniform3f(u.uLightDir, ...lightDir);
    gl.uniform3f(u.uViewPos, ...eye);
    gl.uniform3f(u.uBgColor, ...params.bgColor);
    gl.uniform1f(u.uAOStrength, params.aoStrength);

    // 经纬各自独立 VAO 绘制;每个 VAO 画 4 个盒段面(顶/底/左右壁)
    const stripVerts = 4;
    for (const [vao, count] of [
      [this.warpVao, this.geom.warpCount],
      [this.weftVao, this.geom.weftCount],
    ] as Array<[WebGLVertexArrayObject, number]>) {
      gl.bindVertexArray(vao);
      for (const offset of [0, 4, 8, 12]) {
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, offset, stripVerts, count);
      }
    }
    gl.bindVertexArray(null);
  }

  /** 渲染循环(相机/光源交互不重建几何,每帧仅重绘,保证流畅) */
  startLoop(getParams: () => RenderParams): void {
    const tick = () => {
      if (this.destroyed) return;
      this.render(getParams());
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stopLoop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** 当前实例总数(性能面板用) */
  get instanceCount(): number {
    return this.geom ? this.geom.warpCount + this.geom.weftCount : 0;
  }

  get frameCount(): number {
    return this.frame;
  }

  screenshot(): string {
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    const gl = this.gl;
    gl.deleteBuffer(this.ringVbo);
    gl.deleteBuffer(this.warpVbo);
    gl.deleteBuffer(this.weftVbo);
    gl.deleteVertexArray(this.warpVao);
    gl.deleteVertexArray(this.weftVao);
    gl.deleteVertexArray(this.groundVao);
    gl.deleteProgram(this.tubeProg.program);
    gl.deleteProgram(this.groundProg.program);
  }
}

export { clamp };
