import { VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE } from './cloudShaderSource';
import { getInterpolatedCloudStage } from './cloudStages';
import { createNoiseTexture } from './noiseTextureGenerator';
import type { CloudStageProfile, CloudLightingContext } from './types';

export class WebGLCloudRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;

  // 메인 구름 셰이더 프로그램 및 유니폼 위치
  private cloudProgram: WebGLProgram | null = null;
  private cloudUniformLocs: Record<string, WebGLUniformLocation | null> = {};

  // 사전 연산된 256x256 Perlin-Worley RGBA 노이즈 LUT 텍스처
  private noiseLutTexture: WebGLTexture | null = null;

  // 풀스크린 쿼드 VBO
  private quadBuffer: WebGLBuffer | null = null;
  private attribPosition: number = -1;

  // 구름 프리셋 프로필
  private stageProfile: CloudStageProfile;
  private stageLevel: number = 800;

  // 바람
  private windSpeed: number = 1.0;
  private windAngleDeg: number = 45;
  private windOffsetHigh = { x: 0, y: 0 };
  private windOffsetLow = { x: 0, y: 0 };

  // 모드 및 레이어 가시성 플래그
  private isPerfMode: boolean = false;
  private isVisibleHigh: boolean = true;
  private isVisibleLow: boolean = true;

  // 맑은 날 불필요한 매 프레임 gl.clear() 호출을 0%로 스킵하는 클리어 상태 플래그
  private isCanvasCleared: boolean = false;

  // 적응형 다이내믹 해상도 스케일링 (DRS)
  private drsScale: number = 0.44;
  private frameTimeAccum: number = 0;
  private drsFrameCount: number = 0;
  private readonly DRS_TARGET_FPS: number = 55;
  private readonly DRS_ADJUST_INTERVAL: number = 45;

  // 마지막 조명 컨텍스트 캐시 (renderCached에서 사용)
  private lastLighting: CloudLightingContext | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.stageProfile = getInterpolatedCloudStage(800);

    this.initGL();
    this.resize();
  }

  private initGL(): void {
    const gl =
      this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false }) ||
      (this.canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      console.warn('WebGL is not supported on this browser/hardware.');
      return;
    }

    this.gl = gl;

    // 1. 심리스 Perlin-Worley LUT 텍스처 생성 (GPU 메모리 256KB 점유, 1회 생성)
    this.noiseLutTexture = createNoiseTexture(gl);

    // 2. 메인 구름 셰이더 프로그램 컴파일
    this.cloudProgram = this.buildProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    if (this.cloudProgram) {
      this.attribPosition = gl.getAttribLocation(this.cloudProgram, 'a_position');
      const cloudUniforms = [
        'u_aspect', 'u_time', 'u_noiseLut',
        'u_coverage', 'u_density', 'u_cloudType', 'u_puffiness',
        'u_darkBase', 'u_mieIntensity', 'u_haloStrength', 'u_ambientDull',
        'u_sunDir', 'u_sunColor', 'u_sunAlt',
        'u_moonDir', 'u_moonColor', 'u_moonAlt', 'u_moonPhase',
        'u_skyZenith', 'u_skyHorizon',
        'u_windOffsetHigh', 'u_windOffsetLow',
        'u_visibleHigh', 'u_visibleLow',
      ];
      for (const name of cloudUniforms) {
        this.cloudUniformLocs[name] = gl.getUniformLocation(this.cloudProgram, name);
      }
    }

    // 3. 풀스크린 쿼드 버퍼
    const quadVertices = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
       1.0,  1.0,
    ]);
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    // 4. [상태 캐싱 최적화] 매 프레임 상태 변경 오버헤드 0%: 초기화 시점에 1회 영구 설정
    if (this.cloudProgram && this.attribPosition !== -1) {
      gl.useProgram(this.cloudProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.enableVertexAttribArray(this.attribPosition);
      gl.vertexAttribPointer(this.attribPosition, 2, gl.FLOAT, false, 0, 0);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // 텍스처 유닛 0번에 LUT 영구 연결
      if (this.noiseLutTexture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.noiseLutTexture);
        gl.uniform1i(this.cloudUniformLocs.u_noiseLut, 0);
      }
    }
  }

  private buildProgram(gl: WebGLRenderingContext, vertSrc: string, fragSrc: string): WebGLProgram | null {
    const vertShader = this.compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    const fragShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vertShader || !fragShader) return null;

    const program = gl.createProgram()!;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  private compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  public resize(): void {
    const isMobile = window.innerWidth <= 820;
    // 0.44x 스케일 (모바일 0.35x, 저사양 0.28x)
    const baseScale = this.isPerfMode ? 0.28 : (isMobile ? 0.35 : this.drsScale);

    const w = Math.max(320, Math.floor(window.innerWidth * baseScale));
    const h = Math.max(240, Math.floor(window.innerHeight * baseScale));

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    if (this.gl) {
      this.gl.viewport(0, 0, w, h);
      // 창 크기 변경 시에만 aspect 유니폼 1회 갱신 (프레임당 연산 제거)
      if (this.cloudProgram && this.cloudUniformLocs.u_aspect) {
        this.gl.useProgram(this.cloudProgram);
        this.gl.uniform1f(this.cloudUniformLocs.u_aspect, w / h);
      }
    }
    this.isCanvasCleared = false;
  }

  public adaptiveDRS(deltaMs: number): void {
    if (this.isPerfMode) return;

    this.frameTimeAccum += deltaMs;
    this.drsFrameCount++;

    if (this.drsFrameCount >= this.DRS_ADJUST_INTERVAL) {
      const avgFrameMs = this.frameTimeAccum / this.drsFrameCount;
      const currentFps = 1000 / avgFrameMs;

      if (currentFps < this.DRS_TARGET_FPS - 6) {
        this.drsScale = Math.max(0.30, this.drsScale - 0.04);
        this.resize();
      } else if (currentFps > this.DRS_TARGET_FPS + 4 && this.drsScale < 0.65) {
        this.drsScale = Math.min(0.65, this.drsScale + 0.02);
        this.resize();
      }

      this.frameTimeAccum = 0;
      this.drsFrameCount = 0;
    }
  }

  public setStageLevel(level: number): void {
    this.stageLevel = Math.max(800, Math.min(804, level));
    this.stageProfile = getInterpolatedCloudStage(this.stageLevel);
    this.isCanvasCleared = false;
  }

  public getStageLevel(): number {
    return this.stageLevel;
  }

  public getStageProfile(): CloudStageProfile {
    return this.stageProfile;
  }

  public setWind(speed: number, angleDeg: number): void {
    this.windSpeed = Math.max(0, speed);
    this.windAngleDeg = angleDeg;
  }

  public setPerfMode(enabled: boolean): void {
    if (this.isPerfMode !== enabled) {
      this.isPerfMode = enabled;
      this.resize();
    }
  }

  public setLayerVisibility(high: boolean, low: boolean): void {
    this.isVisibleHigh = high;
    this.isVisibleLow = low;
    this.isCanvasCleared = false;
  }

  public update(dtSec: number): void {
    if (this.windSpeed <= 0 || dtSec <= 0) return;

    const rad = (this.windAngleDeg * Math.PI) / 180;
    const baseVx = Math.cos(rad) * this.windSpeed * 0.00075;
    const baseVy = Math.sin(rad) * this.windSpeed * 0.00045;

    // 상층운: 0.18배 천천히 드리프트
    this.windOffsetHigh.x += baseVx * 0.18 * dtSec;
    this.windOffsetHigh.y += baseVy * 0.18 * dtSec;

    // 중/하층운: 1.0배 정속 드리프트
    this.windOffsetLow.x += baseVx * dtSec;
    this.windOffsetLow.y += baseVy * dtSec;
  }

  /**
   * 제로 오버헤드 실사 볼류메트릭 구름 렌더링 파이프라인
   */
  public render(lighting: CloudLightingContext): void {
    const gl = this.gl;
    if (!gl || !this.cloudProgram) return;

    this.lastLighting = lighting;

    // [최적화] 800단계(완전 쾌청)이거나 가시 구름 없을 시: 이미 클리어되어 있으면 0ns 즉시 바이패스!
    if (this.stageProfile.coverage <= 0.001) {
      if (!this.isCanvasCleared) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.isCanvasCleared = true;
      }
      return;
    }
    this.isCanvasCleared = false;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const locs = this.cloudUniformLocs;

    // 시간 유니폼
    gl.uniform1f(locs.u_time, performance.now() / 1000);

    // 구름 프로필 유니폼
    gl.uniform1f(locs.u_coverage, this.stageProfile.coverage);
    gl.uniform1f(locs.u_density, this.stageProfile.density);
    gl.uniform1f(locs.u_cloudType, this.stageProfile.cloudType);
    gl.uniform1f(locs.u_puffiness, this.stageProfile.puffiness);
    gl.uniform1f(locs.u_darkBase, this.stageProfile.darkBase);
    gl.uniform1f(locs.u_mieIntensity, this.stageProfile.mieIntensity);
    gl.uniform1f(locs.u_haloStrength, this.stageProfile.haloStrength);
    gl.uniform1f(locs.u_ambientDull, this.stageProfile.ambientDull);

    // 태양 광원
    const sDir = lighting.sunDir;
    gl.uniform3f(locs.u_sunDir, sDir[0], sDir[1], sDir[2]);
    gl.uniform1f(locs.u_sunAlt, lighting.sunAlt);

    // 황혼 노을 틴팅
    let sunR = 1.0, sunG = 0.98, sunB = 0.95;
    if (lighting.sunAlt >= -6 && lighting.sunAlt <= 14) {
      const t = (lighting.sunAlt - -6) / 20;
      sunR = 1.0;
      sunG = 0.52 + t * 0.46;
      sunB = 0.32 + t * 0.63;
    } else if (lighting.sunAlt < -6) {
      sunR = 0.70; sunG = 0.80; sunB = 1.00;
    }
    gl.uniform3f(locs.u_sunColor, sunR, sunG, sunB);

    // 달 광원
    const mDir = lighting.moonDir;
    gl.uniform3f(locs.u_moonDir, mDir[0], mDir[1], mDir[2]);
    gl.uniform1f(locs.u_moonAlt, lighting.moonAlt);

    const moonAltNorm = Math.max(0, Math.sin(Math.max(0, lighting.moonAlt) * Math.PI / 180));
    const phaseNorm = Math.sin(Math.max(0, Math.min(1, lighting.moonPhaseAge / 29.53)) * Math.PI);
    const moonLum = moonAltNorm * phaseNorm * 0.12;
    gl.uniform3f(locs.u_moonColor, 0.65 * moonLum, 0.78 * moonLum, 0.98 * moonLum);
    gl.uniform1f(locs.u_moonPhase, lighting.moonPhaseAge / 29.53);

    // 대기색
    const zRgb = lighting.zenithColor;
    const hRgb = lighting.horizonColor;
    gl.uniform3f(locs.u_skyZenith, zRgb[0], zRgb[1], zRgb[2]);
    gl.uniform3f(locs.u_skyHorizon, hRgb[0], hRgb[1], hRgb[2]);

    // 바람 이동 오프셋
    gl.uniform2f(locs.u_windOffsetHigh, this.windOffsetHigh.x, this.windOffsetHigh.y);
    gl.uniform2f(locs.u_windOffsetLow, this.windOffsetLow.x, this.windOffsetLow.y);

    // 레이어 가시성
    gl.uniform1f(locs.u_visibleHigh, this.isVisibleHigh ? 1.0 : 0.0);
    gl.uniform1f(locs.u_visibleLow, this.isVisibleLow ? 1.0 : 0.0);

    // 1 드로우 콜 풀스크린 렌더링
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * 캐시된 조명 컨텍스트로 구름 렌더링
   */
  public renderCached(): void {
    if (this.lastLighting) {
      this.render(this.lastLighting);
    }
  }

  public destroy(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    if (this.cloudProgram) gl.deleteProgram(this.cloudProgram);
    if (this.noiseLutTexture) gl.deleteTexture(this.noiseLutTexture);
    this.gl = null;
    this.cloudProgram = null;
    this.noiseLutTexture = null;
  }
}
