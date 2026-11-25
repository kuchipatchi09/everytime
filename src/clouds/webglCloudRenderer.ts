import { VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE } from './cloudShaderSource';
import { getInterpolatedCloudStage } from './cloudStages';
import { createNoiseTexture } from './noiseTextureGenerator';
import type { CloudStageProfile, CloudLightingContext } from './types';

const CLOUD_UNIFORMS = [
  'u_aspect', 'u_timeWarp', 'u_noiseLut',
  'u_density', 'u_cloudType', 'u_cloudThreshold', 'u_macroRejectThresh',
  'u_puffFactor', 'u_mieIntensity', 'u_haloStrength', 'u_cirrusThresh',
  'u_cirrusScale', 'u_dullFactor',
  'u_normSunDir', 'u_activeLightDir', 'u_sunColor', 'u_sunAlt',
  'u_sunIntensity', 'u_sunsetFactor', 'u_sunRadiance', 'u_lightRadiance',
  'u_darkBaseScale', 'u_nightBaseScale', 'u_stormBase',
  'u_skyZenith', 'u_skyHorizon',
  'u_windOffsetHigh', 'u_windOffsetLow', 'u_shear1', 'u_shear2', 'u_shear3',
  'u_visibleHigh',
] as const;

function glslSmoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class WebGLCloudRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private glInitAttempted: boolean = false;

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

  // 맑은 날 불필요한 매 프레임 gl.clear() 및 DOM 변경을 스킵하는 상태 플래그
  private isCanvasCleared: boolean = true;
  private isCanvasHidden: boolean = false;

  // 유니폼 더티 플래그 (정적 프레임 불필요 업로드 제거)
  private profileUniformsDirty: boolean = true;
  private visibilityUniformDirty: boolean = true;
  private lastUploadedSunX: number = NaN;
  private lastUploadedSunY: number = NaN;
  private lastUploadedSunZ: number = NaN;
  private lastUploadedMoonX: number = NaN;
  private lastUploadedMoonY: number = NaN;
  private lastUploadedMoonZ: number = NaN;
  private lastUploadedSunAlt: number = NaN;
  private lastUploadedMoonAlt: number = NaN;
  private lastUploadedMoonAge: number = NaN;
  private lastUploadedZenithR: number = NaN;
  private lastUploadedZenithG: number = NaN;
  private lastUploadedZenithB: number = NaN;
  private lastUploadedHorizonR: number = NaN;
  private lastUploadedHorizonG: number = NaN;
  private lastUploadedHorizonB: number = NaN;
  private lastRenderSucceeded: boolean = false;

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
    // 초기 상태는 800(쾌청)이므로 WebGL 컨텍스트 생성을 지연하고 캔버스 레이어를 숨긴다
    this.setCanvasVisible(false);
  }

  private setCanvasVisible(visible: boolean): void {
    const hidden = !visible;
    if (this.isCanvasHidden === hidden) return;
    this.isCanvasHidden = hidden;
    this.canvas.style.display = visible ? '' : 'none';
  }

  private initGL(): void {
    this.glInitAttempted = true;
    const gl =
      this.canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        stencil: false,
      }) ||
      (this.canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      console.warn('WebGL is not supported on this browser/hardware.');
      return;
    }

    this.gl = gl;

    // 1. 심리스 Perlin-Worley LUT 텍스처 생성 (모듈 캐시 공유)
    this.noiseLutTexture = createNoiseTexture(gl);

    // 2. 메인 구름 셰이더 프로그램 컴파일
    this.cloudProgram = this.buildProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    if (this.cloudProgram) {
      this.attribPosition = gl.getAttribLocation(this.cloudProgram, 'a_position');
      for (const name of CLOUD_UNIFORMS) {
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

    this.resetUniformCache();
  }

  private resetUniformCache(): void {
    this.profileUniformsDirty = true;
    this.visibilityUniformDirty = true;
    this.lastUploadedSunAlt = NaN;
    this.lastUploadedZenithR = NaN;
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
    if (!this.gl) return;

    const isMobile = window.innerWidth <= 820;
    // 0.44x 스케일 (모바일 0.35x, 저사양 0.28x)
    const baseScale = this.isPerfMode ? 0.28 : (isMobile ? 0.35 : this.drsScale);

    const w = Math.max(320, Math.floor(window.innerWidth * baseScale));
    const h = Math.max(240, Math.floor(window.innerHeight * baseScale));

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    this.gl.viewport(0, 0, w, h);
    // 창 크기 변경 시에만 aspect 유니폼 1회 갱신 (프레임당 연산 제거)
    if (this.cloudProgram && this.cloudUniformLocs.u_aspect) {
      this.gl.useProgram(this.cloudProgram);
      this.gl.uniform1f(this.cloudUniformLocs.u_aspect, w / h);
    }
    this.isCanvasCleared = false;
  }

  public adaptiveDRS(deltaMs: number): void {
    if (this.isPerfMode || !this.lastRenderSucceeded) return;

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
    const clamped = Math.max(800, Math.min(804, level));
    if (clamped === this.stageLevel && this.stageProfile) return;
    this.stageLevel = clamped;
    this.stageProfile = getInterpolatedCloudStage(this.stageLevel);
    this.isCanvasCleared = false;
    this.profileUniformsDirty = true;
    this.lastRenderSucceeded = false;
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
    if (this.isVisibleHigh === high && this.isVisibleLow === low) return;
    this.isVisibleHigh = high;
    this.isVisibleLow = low;
    this.isCanvasCleared = false;
    this.visibilityUniformDirty = true;
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
    this.lastLighting = lighting;
    this.lastRenderSucceeded = false;

    // [최적화] 800단계(완전 쾌청)이거나 가시 구름 없을 시: 컨텍스트 생성/렌더 0% & 캔버스 숨김
    if (this.stageProfile.coverage <= 0.001) {
      if (this.gl && !this.isCanvasCleared) {
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.isCanvasCleared = true;
      }
      this.setCanvasVisible(false);
      return;
    }

    // 지연 WebGL 초기화 (첫 구름 표시 시점에만 실행)
    if (!this.gl && !this.glInitAttempted) {
      this.initGL();
      this.resize();
    }

    const gl = this.gl;
    if (!gl || !this.cloudProgram) return;

    this.setCanvasVisible(true);
    this.isCanvasCleared = false;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const locs = this.cloudUniformLocs;

    // 시간 워프 유니폼 (256 타일 주기 유지하며 float32 정밀도 손실 방지)
    gl.uniform1f(locs.u_timeWarp, ((performance.now() / 1000) * 0.0022) % 16.0);

    // 1. 구름 프로필 유니폼 (단계 변경 시에만 업로드)
    if (this.profileUniformsDirty) {
      const p = this.stageProfile;
      gl.uniform1f(locs.u_density, p.density);
      gl.uniform1f(locs.u_cloudType, p.cloudType);
      gl.uniform1f(locs.u_cloudThreshold, 0.79 - p.coverage * 0.44);
      gl.uniform1f(locs.u_macroRejectThresh, 0.64 - p.coverage * 0.44);
      gl.uniform1f(locs.u_puffFactor, Math.max(0.0, Math.min(1.0, p.puffiness * 0.65)));
      gl.uniform1f(locs.u_mieIntensity, p.mieIntensity);
      gl.uniform1f(locs.u_haloStrength, p.haloStrength);
      gl.uniform1f(locs.u_cirrusThresh, 0.70 - p.coverage * 0.28);
      gl.uniform1f(locs.u_cirrusScale, (1.0 - p.cloudType) * 0.55 * p.density);
      gl.uniform1f(locs.u_dullFactor, p.ambientDull > 0.02 ? Math.max(0.0, Math.min(0.26, p.ambientDull)) : 0.0);
      gl.uniform1f(locs.u_darkBaseScale, 1.0 - 0.25 * p.darkBase);
      gl.uniform1f(locs.u_nightBaseScale, 0.70 - 0.40 * p.darkBase);
      this.profileUniformsDirty = false;
    }

    // 2. 천문/광원 유니폼 (값이 바뀐 경우에만 CPU 사전계산 및 업로드)
    const sDir = lighting.sunDir;
    const mDir = lighting.moonDir;
    if (
      this.lastUploadedSunAlt !== lighting.sunAlt ||
      this.lastUploadedMoonAlt !== lighting.moonAlt ||
      this.lastUploadedMoonAge !== lighting.moonPhaseAge ||
      this.lastUploadedSunX !== sDir[0] ||
      this.lastUploadedSunY !== sDir[1] ||
      this.lastUploadedSunZ !== sDir[2] ||
      this.lastUploadedMoonX !== mDir[0] ||
      this.lastUploadedMoonY !== mDir[1] ||
      this.lastUploadedMoonZ !== mDir[2]
    ) {
      this.lastUploadedSunAlt = lighting.sunAlt;
      this.lastUploadedMoonAlt = lighting.moonAlt;
      this.lastUploadedMoonAge = lighting.moonPhaseAge;
      this.lastUploadedSunX = sDir[0];
      this.lastUploadedSunY = sDir[1];
      this.lastUploadedSunZ = sDir[2];
      this.lastUploadedMoonX = mDir[0];
      this.lastUploadedMoonY = mDir[1];
      this.lastUploadedMoonZ = mDir[2];

      const sLen = Math.hypot(sDir[0], sDir[1], sDir[2]) || 1;
      const nSunX = sDir[0] / sLen;
      const nSunY = sDir[1] / sLen;
      const nSunZ = sDir[2] / sLen;
      gl.uniform3f(locs.u_normSunDir, nSunX, nSunY, nSunZ);

      if (lighting.sunAlt > -4.0) {
        gl.uniform3f(locs.u_activeLightDir, nSunX, nSunY, nSunZ);
      } else {
        const mLen = Math.hypot(mDir[0], mDir[1], mDir[2]) || 1;
        gl.uniform3f(locs.u_activeLightDir, mDir[0] / mLen, mDir[1] / mLen, mDir[2] / mLen);
      }

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

      const sunIntensity = glslSmoothstep(-7.0, 7.0, lighting.sunAlt);
      const sunsetFactor =
        glslSmoothstep(14.0, 2.0, lighting.sunAlt) * glslSmoothstep(-6.0, 0.0, lighting.sunAlt);
      gl.uniform1f(locs.u_sunIntensity, sunIntensity);
      gl.uniform1f(locs.u_sunsetFactor, sunsetFactor);

      const radScale = 1.25 + sunsetFactor * 0.45;
      const sRadR = sunR * radScale;
      const sRadG = sunG * radScale;
      const sRadB = sunB * radScale;
      gl.uniform3f(locs.u_sunRadiance, sRadR, sRadG, sRadB);

      // 달 광원
      const moonAltNorm = Math.max(0, Math.sin(Math.max(0, lighting.moonAlt) * Math.PI / 180));
      const phaseNorm = Math.sin(Math.max(0, Math.min(1, lighting.moonPhaseAge / 29.53)) * Math.PI);
      const moonLum = moonAltNorm * phaseNorm * 0.12;
      const moonR = 0.65 * moonLum;
      const moonG = 0.78 * moonLum;
      const moonB = 0.98 * moonLum;

      const nightMix = 1.0 - sunIntensity;
      gl.uniform3f(
        locs.u_lightRadiance,
        moonR * nightMix + sRadR * sunIntensity,
        moonG * nightMix + sRadG * sunIntensity,
        moonB * nightMix + sRadB * sunIntensity
      );

      const stormScale = Math.max(0.08, sunIntensity);
      gl.uniform3f(locs.u_stormBase, 0.55 * stormScale, 0.58 * stormScale, 0.65 * stormScale);
    }

    // 3. 대기색 (변경 시에만 업로드)
    const zRgb = lighting.zenithColor;
    const hRgb = lighting.horizonColor;
    if (
      this.lastUploadedZenithR !== zRgb[0] ||
      this.lastUploadedZenithG !== zRgb[1] ||
      this.lastUploadedZenithB !== zRgb[2] ||
      this.lastUploadedHorizonR !== hRgb[0] ||
      this.lastUploadedHorizonG !== hRgb[1] ||
      this.lastUploadedHorizonB !== hRgb[2]
    ) {
      this.lastUploadedZenithR = zRgb[0];
      this.lastUploadedZenithG = zRgb[1];
      this.lastUploadedZenithB = zRgb[2];
      this.lastUploadedHorizonR = hRgb[0];
      this.lastUploadedHorizonG = hRgb[1];
      this.lastUploadedHorizonB = hRgb[2];
      gl.uniform3f(locs.u_skyZenith, zRgb[0], zRgb[1], zRgb[2]);
      gl.uniform3f(locs.u_skyHorizon, hRgb[0], hRgb[1], hRgb[2]);
    }

    // 4. 바람 이동 오프셋 및 전단(shear) 사전 결합
    const lowX = this.windOffsetLow.x;
    const lowY = this.windOffsetLow.y;
    const wx = lowX + 0.001;
    const wy = lowY + 0.001;
    const wLen = Math.hypot(wx, wy) || 1;
    const wdx = wx / wLen;
    const wdy = wy / wLen;

    gl.uniform2f(locs.u_windOffsetHigh, this.windOffsetHigh.x, this.windOffsetHigh.y);
    gl.uniform2f(locs.u_windOffsetLow, lowX, lowY);
    gl.uniform2f(locs.u_shear1, lowX + wdx * 0.056, lowY + wdy * 0.056);
    gl.uniform2f(locs.u_shear2, lowX + wdx * 0.140, lowY + wdy * 0.140);
    gl.uniform2f(locs.u_shear3, lowX + wdx * 0.224, lowY + wdy * 0.224);

    // 5. 레이어 가시성
    if (this.visibilityUniformDirty) {
      gl.uniform1f(locs.u_visibleHigh, this.isVisibleHigh ? 1.0 : 0.0);
      this.visibilityUniformDirty = false;
    }

    // 1 드로우 콜 풀스크린 렌더링
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.lastRenderSucceeded = true;
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
