import { getSunTimes, calcSunCoords } from '../astronomy/sun';
import { getMoonAge, getMoonPath, calcMoonCoords } from '../astronomy/moon';
import { getSiderealTime, getStarRotation } from '../astronomy/sidereal';
import { calcSkyColors, calcTwilight } from '../astronomy/sky';
import { setupSatelliteLoops, type SatelliteController } from '../astronomy/satellite';
import type { FlareElements } from '../astronomy/types';
import { WebGLCloudRenderer } from '../clouds/webglCloudRenderer';
import type { CloudLightingContext, CloudStageProfile } from '../clouds/types';
import type { WeatherResponse } from '../types/weather';
import {
  getSavedSkyBg,
  setSavedSkyBg,
  getSavedSkyPerf,
  setSavedSkyPerf,
  getSavedSkyClouds,
  setSavedSkyClouds,
  getSavedSkyTimeOffset,
  setSavedSkyTimeOffset,
} from '../utils/storage';
import { getCachedWeather, onWeatherUpdate } from './weatherService';

export class SkyBackgroundService {
  private container: HTMLElement | null = null;
  private flareEls: FlareElements | null = null;
  private skyLayerEl: HTMLElement | null = null;
  private skyAtmosphereEl: HTMLElement | null = null;
  private starWrapperEl: HTMLElement | null = null;
  private starContainerEl: HTMLElement | null = null;
  private moonAuraEl: HTMLElement | null = null;
  private moonDiskEl: HTMLElement | null = null;
  private moonEarthshineEl: HTMLElement | null = null;
  private moonCrescentEl: HTMLElement | null = null;
  private moonCrescentPathEl: SVGPathElement | null = null;
  private sunDiskEl: HTMLElement | null = null;
  private sunStreakEl: HTMLElement | null = null;
  private satController: SatelliteController | null = null;

  // 구름 렌더러
  private cloudRenderer: WebGLCloudRenderer | null = null;
  private cloudCanvasEl: HTMLCanvasElement | null = null;
  private resizeHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private isCloudsEnabled: boolean = true;
  private lastCloudRenderTs: number = 0;
  private readonly _boundLoop: (ts: number) => void;
  private readonly _boundIdleTick: () => void;
  private unregisterWeather: (() => void) | null = null;

  private rafId: number | null = null;
  private idleIntervalId: number | null = null;
  private isEnabled: boolean = false;
  private isPerfMode: boolean = false;
  private timeOffset: number = 0; // 시간 단위 오프셋 (-12 ~ +14)
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private isSuppressed: boolean = false;

  // 2초 단위 상태 캐시 키 (청명/구름 정적 천체 계산 스킵용)
  private lastSkyKey: number = -1;

  // DOM 더티 체크 캐시 (값이 바뀐 요소만 최소 갱신)
  private lastZenith: string = '';
  private lastHorizon: string = '';
  private lastAtmVisible: boolean = true;
  private lastAtmPos: string = '';
  private lastAtmOpacity: string = '';
  private lastSunVisible: boolean = true;
  private lastSunPos: string = '';
  private lastSunOpacity: string = '';
  private lastSunFcVisible: boolean = true;
  private lastSunFcOpacity: string = '';
  private lastSunStreakPos: string = '';
  private lastMoonVisible: boolean = true;
  private lastMoonPos: string = '';
  private lastMoonOpacity: string = '';
  private lastMoonAuraVisible: boolean = true;
  private lastMoonAuraPos: string = '';
  private lastMoonAuraOpacity: string = '';
  private lastEarthshineOpacity: string = '';
  private lastMoonGlow: string = '';
  private lastMoonPath: string = '';
  private lastMoonFcVisible: boolean = true;
  private lastMoonFcOpacity: string = '';
  private lastStarWrapperVisible: boolean = true;
  private lastStarMaskVisible: boolean = true;
  private lastStarWrapperMoonPos: string = '';
  private lastStarContainerVisible: boolean = true;
  private lastStarOpacity: string = '';
  private lastStarRot: string = '';
  private lastStarMaskNone: boolean = false;
  private lastStarMaskY: string = '';

  // 마지막 updateSky에서 계산된 조명 컨텍스트
  private _lastLightingCtx: CloudLightingContext = {
    sunAlt: -90,
    sunDir: [0, -1, 0],
    sunVisible: false,
    moonAlt: -90,
    moonDir: [0, -1, 0],
    moonVisible: false,
    moonPhaseAge: 0,
    zenithColor: [0, 0, 0],
    horizonColor: [0, 0, 0],
    ambientBrightness: 0,
  };

  constructor() {
    this._boundLoop = this.loop.bind(this);
    this._boundIdleTick = this.onIdleTick.bind(this);
  }

  public init(container: HTMLElement | null): void {
    this.container = container;
    this.isEnabled = getSavedSkyBg();
    this.isPerfMode = getSavedSkyPerf();
    this.isCloudsEnabled = getSavedSkyClouds();
    this.timeOffset = getSavedSkyTimeOffset();

    // 탭 비활성화(브라우저 백그라운드) 시 불필요한 루프 일시정지 (중복 등록 방지)
    if (!this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (document.hidden) {
          this.pause();
        } else if (this.isEnabled && !this.isSuppressed && this.isRunning) {
          this.resume();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    if (this.isEnabled && !this.isSuppressed && this.container) {
      this.start();
    }
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  public getIsPerfMode(): boolean {
    return this.isPerfMode;
  }

  public getIsCloudsEnabled(): boolean {
    return this.isCloudsEnabled;
  }

  public getTimeOffset(): number {
    return this.timeOffset;
  }

  /** Temporarily hide the sky without changing the user's saved preference. */
  public setSuppressed(suppressed: boolean): void {
    if (this.isSuppressed === suppressed) return;
    this.isSuppressed = suppressed;

    if (suppressed) {
      this.stop();
    } else if (this.isEnabled) {
      this.start();
    }
  }

  private getSimTime(): { currentMinutes: number; simDate: Date; skyKey: number } {
    const nowMs = Date.now();
    const simMs = nowMs + this.timeOffset * 3600000;
    const simDate = new Date(simMs);
    const nowDate = this.timeOffset === 0 ? simDate : new Date(nowMs);
    const currentMinutes =
      nowDate.getHours() * 60 + nowDate.getMinutes() + nowDate.getSeconds() / 60 + this.timeOffset * 60;
    return {
      currentMinutes,
      simDate,
      skyKey: Math.floor(simMs / 2000),
    };
  }

  private refreshNow(): void {
    if (!this.isRunning) return;
    this.lastSkyKey = -1;
    const { currentMinutes, simDate, skyKey } = this.getSimTime();
    this.lastSkyKey = skyKey;
    this.updateSky(currentMinutes, simDate);
    if (!this.isPaused) {
      this.syncScheduler();
    }
  }

  public setTimeOffset(offset: number): void {
    this.timeOffset = offset;
    setSavedSkyTimeOffset(offset);
    this.refreshNow();
  }

  public toggleClouds(enabled: boolean): void {
    this.isCloudsEnabled = enabled;
    setSavedSkyClouds(enabled);
    if (!enabled) {
      if (this.cloudCanvasEl) {
        this.cloudCanvasEl.style.display = 'none';
      }
    }
    this.refreshNow();
  }

  public setCloudLevel(level: number): void {
    this.cloudRenderer?.setStageLevel(level);
    this.refreshNow();
  }

  public getCloudLevel(): number {
    return this.cloudRenderer ? this.cloudRenderer.getStageLevel() : 800;
  }

  public getCloudProfile(): CloudStageProfile | null {
    return this.cloudRenderer ? this.cloudRenderer.getStageProfile() : null;
  }

  public setWind(speed: number, angleDeg: number): void {
    this.cloudRenderer?.setWind(speed, angleDeg);
  }

  public updateFromWeather(data: WeatherResponse): void {
    if (!data) return;

    let cloudLevel = 800;
    const weatherId = data.weather?.[0]?.id;
    const cloudCoverPercent = data.clouds?.all;

    if (typeof cloudCoverPercent === 'number' && !isNaN(cloudCoverPercent)) {
      const isPrecipitation = weatherId !== undefined && weatherId < 700;
      const minLevel = isPrecipitation ? 803.5 : 800;
      cloudLevel = Math.max(minLevel, 800 + (Math.max(0, Math.min(100, cloudCoverPercent)) / 100) * 4);
    } else if (weatherId !== undefined) {
      if (weatherId >= 800 && weatherId <= 804) {
        cloudLevel = weatherId;
      } else if (weatherId < 700) {
        cloudLevel = 804;
      } else if (weatherId >= 700 && weatherId < 800) {
        cloudLevel = 803.5;
      }
    }

    this.cloudRenderer?.setStageLevel(cloudLevel);

    const windSpeed = (data.wind?.speed && data.wind.speed > 0) ? Math.min(8.0, data.wind.speed) : 1.2;
    const windDeg = (typeof data.wind?.deg === 'number') ? data.wind.deg : 45;
    this.cloudRenderer?.setWind(windSpeed, windDeg);

    this.refreshNow();
  }

  private needsCloudRaf(): boolean {
    if (!this.isCloudsEnabled || !this.cloudRenderer) return false;
    return this.cloudRenderer.getStageProfile().coverage > 0.001;
  }

  private clearSchedulers(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.idleIntervalId !== null) {
      clearInterval(this.idleIntervalId);
      this.idleIntervalId = null;
    }
  }

  private syncScheduler(): void {
    if (!this.isRunning || this.isPaused) {
      this.clearSchedulers();
      return;
    }

    if (this.needsCloudRaf()) {
      if (this.idleIntervalId !== null) {
        clearInterval(this.idleIntervalId);
        this.idleIntervalId = null;
      }
      if (this.rafId === null) {
        this.lastCloudRenderTs = performance.now();
        this.rafId = requestAnimationFrame(this._boundLoop);
      }
    } else {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.idleIntervalId === null) {
        this.idleIntervalId = window.setInterval(this._boundIdleTick, 2000);
      }
    }
  }

  private syncStarWrapperVisibility(): void {
    if (!this.starWrapperEl) return;
    const shouldShow = this.lastStarContainerVisible || (this.satController?.hasActive() ?? false);
    if (this.lastStarWrapperVisible !== shouldShow) {
      this.lastStarWrapperVisible = shouldShow;
      this.starWrapperEl.style.display = shouldShow ? '' : 'none';
    }
  }

  /**
   * 하늘 배경 시뮬레이션 시작 (DOM 생성, 루프 가동, 위성 스케줄러 등록, 구름 렌더러 초기화)
   */
  public start(): void {
    if (this.isRunning || this.isSuppressed) return;
    if (!this.container) {
      this.container = document.getElementById('sky-background');
      if (!this.container) return;
    }

    this.mountDOM();
    document.body.classList.add('sky-bg-active');
    if (this.isPerfMode) {
      document.body.classList.add('perf-active');
    }

    const satLayer = this.container.querySelector<HTMLElement>('#satLayer');
    if (satLayer) {
      this.satController = setupSatelliteLoops(
        satLayer,
        () => this.isPerfMode,
        () => this.syncStarWrapperVisibility()
      );
    }

    // 구름 렌더러 초기화 (초기 쾌청 시 GL 컨텍스트 지연 생성)
    this.cloudCanvasEl = this.container.querySelector<HTMLCanvasElement>('#cloudCanvas');
    if (this.cloudCanvasEl) {
      this.cloudRenderer = new WebGLCloudRenderer(this.cloudCanvasEl);
      this.cloudRenderer.setPerfMode(this.isPerfMode);
      if (!this.isCloudsEnabled) {
        this.cloudCanvasEl.style.display = 'none';
      }
    }

    // 창 리사이즈 이벤트 바인딩
    this.resizeHandler = () => {
      this.cloudRenderer?.resize();
    };
    window.addEventListener('resize', this.resizeHandler);

    // 날씨 실시간 연동 등록
    const cached = getCachedWeather();
    if (cached) {
      this.updateFromWeather(cached);
    }
    this.unregisterWeather = onWeatherUpdate((w) => {
      this.updateFromWeather(w);
    });

    this.isRunning = true;
    this.isPaused = false;
    this.refreshNow();
  }

  /**
   * 하늘 배경 시뮬레이션 완전 정지 및 모든 자원 해제 (Zero Resource Overhead)
   */
  public stop(): void {
    this.isRunning = false;
    this.isPaused = false;

    // 1. rAF 및 유휴 타이머 즉시 취소
    this.clearSchedulers();

    // 2. 리사이즈 이벤트 리스너 해제
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    // 3. 날씨 리스너 해제
    if (this.unregisterWeather) {
      this.unregisterWeather();
      this.unregisterWeather = null;
    }

    // 4. 구름 WebGL 렌더러 완전 해제
    if (this.cloudRenderer) {
      this.cloudRenderer.destroy();
      this.cloudRenderer = null;
    }
    this.cloudCanvasEl = null;

    // 5. 인공위성 타이머 및 애니메이션 완전 해제
    if (this.satController) {
      this.satController.stop();
      this.satController = null;
    }

    // 6. body 클래스 제거
    document.body.classList.remove('sky-bg-active');
    document.body.classList.remove('perf-active');

    // 7. DOM 및 캐시 상태 완전 정리
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.clearDomRefs();
  }

  /**
   * 메인 탭 이탈 시 임시 일시정지 (루프 및 위성 루프 정지하여 CPU/GPU 절약)
   */
  public pause(): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    this.clearSchedulers();
    this.satController?.pause();
  }

  /**
   * 메인 탭 복귀 시 루프 재개
   */
  public resume(): void {
    if (!this.isEnabled || this.isSuppressed) return;
    if (!this.isRunning) {
      this.start();
      return;
    }
    if (!this.isPaused) return;

    this.isPaused = false;
    this.satController?.resume();
    this.refreshNow();
  }

  public toggle(enabled: boolean): void {
    this.isEnabled = enabled;
    setSavedSkyBg(enabled);

    if (enabled && !this.isSuppressed) {
      this.start();
    } else {
      this.stop();
    }
  }

  public setPerfMode(enabled: boolean): void {
    this.isPerfMode = enabled;
    setSavedSkyPerf(enabled);
    this.cloudRenderer?.setPerfMode(enabled);

    if (enabled && !this.isSuppressed) {
      document.body.classList.add('perf-active');
    } else {
      document.body.classList.remove('perf-active');
    }
  }

  private clearDomRefs(): void {
    this.flareEls = null;
    this.skyLayerEl = null;
    this.skyAtmosphereEl = null;
    this.starWrapperEl = null;
    this.starContainerEl = null;
    this.moonAuraEl = null;
    this.moonDiskEl = null;
    this.moonEarthshineEl = null;
    this.moonCrescentEl = null;
    this.moonCrescentPathEl = null;
    this.sunDiskEl = null;
    this.sunStreakEl = null;

    this.lastSkyKey = -1;
    this.lastZenith = '';
    this.lastHorizon = '';
    this.lastAtmVisible = true;
    this.lastAtmPos = '';
    this.lastAtmOpacity = '';
    this.lastSunVisible = true;
    this.lastSunPos = '';
    this.lastSunOpacity = '';
    this.lastSunFcVisible = true;
    this.lastSunFcOpacity = '';
    this.lastSunStreakPos = '';
    this.lastMoonVisible = true;
    this.lastMoonPos = '';
    this.lastMoonOpacity = '';
    this.lastMoonAuraVisible = true;
    this.lastMoonAuraPos = '';
    this.lastMoonAuraOpacity = '';
    this.lastEarthshineOpacity = '';
    this.lastMoonGlow = '';
    this.lastMoonPath = '';
    this.lastMoonFcVisible = true;
    this.lastMoonFcOpacity = '';
    this.lastStarWrapperVisible = true;
    this.lastStarMaskVisible = true;
    this.lastStarWrapperMoonPos = '';
    this.lastStarContainerVisible = true;
    this.lastStarOpacity = '';
    this.lastStarRot = '';
    this.lastStarMaskNone = false;
    this.lastStarMaskY = '';
  }

  private mountDOM(): void {
    if (!this.container) return;
    this.clearDomRefs();

    this.container.innerHTML = `
      <div class="sky-bg-layer sky-base"></div>
      <div id="skyLayer" class="sky-bg-layer sky-layer"></div>
      <div class="sky-bg-layer sky-atmosphere"></div>
      <div class="sky-bg-layer star-wrapper">
        <div class="sky-bg-layer star-container"></div>
        <div id="satLayer" class="sky-bg-layer" style="z-index: 3;"></div>
      </div>
      <div class="sky-bg-layer celestial">
        <div class="moon-aura"></div>
        <div class="moon-disk">
          <div class="moon-earthshine"></div>
          <div class="moon-crescent">
            <svg width="32" height="32" viewBox="0 0 32 32" style="width: 100%; height: 100%; display: block;">
              <path id="moonCrescentPath" d="" fill="#fff6e3" />
            </svg>
          </div>
        </div>
        <div class="sun-disk"></div>
      </div>
      <!-- 실사 프랙탈 구름 캔버스 레이어: 천체/별빛 앞, 렌즈플레어 뒤 -->
      <canvas id="cloudCanvas" class="sky-bg-layer" style="z-index: 5; pointer-events: none; width: 100vw; height: 100vh;"></canvas>
      <div class="lens-flare-container" id="sunFlareCont" style="z-index: 6;">
        <div class="sun-streak"></div>
        <div class="flare-ghost flare-halo" id="h-1" style="width: 60vmax; height: 60vmax;"></div>
        <div class="flare-ghost ghost-rainbow" id="r-1" style="width: 500px; height: 500px;"></div>
        <div class="flare-ghost ghost-hex" id="g-1" style="width: 100px; height: 100px;"></div>
        <div class="flare-ghost ghost-hex" id="g-2" style="width: 50px; height: 50px; background: rgba(150, 255, 200, 0.12);"></div>
        <div class="flare-ghost ghost-tiny" id="t-1" style="width: 10px; height: 10px; background: #fff; box-shadow: 0 0 10px #fff;"></div>
      </div>
      <div class="moon-flare-container" id="moonFlareCont" style="z-index: 6;">
        <div class="flare-ghost ghost-hex" id="mg-1" style="width: 40px; height: 40px; background: rgba(200, 230, 255, 0.1);"></div>
        <div class="flare-ghost flare-halo" id="mh-1" style="width: 20vmax; height: 20vmax; opacity: 0.2;"></div>
      </div>
      <div class="sky-film-grain"></div>
    `;

    this.skyLayerEl = this.container.querySelector<HTMLElement>('#skyLayer');
    this.skyAtmosphereEl = this.container.querySelector<HTMLElement>('.sky-atmosphere');
    this.starWrapperEl = this.container.querySelector<HTMLElement>('.star-wrapper');
    this.starContainerEl = this.container.querySelector<HTMLElement>('.star-container');
    this.moonAuraEl = this.container.querySelector<HTMLElement>('.moon-aura');
    this.moonDiskEl = this.container.querySelector<HTMLElement>('.moon-disk');
    this.moonEarthshineEl = this.container.querySelector<HTMLElement>('.moon-earthshine');
    this.moonCrescentEl = this.container.querySelector<HTMLElement>('.moon-crescent');
    this.moonCrescentPathEl = this.container.querySelector<SVGPathElement>('#moonCrescentPath');
    this.sunDiskEl = this.container.querySelector<HTMLElement>('.sun-disk');
    this.sunStreakEl = this.container.querySelector<HTMLElement>('.sun-streak');

    this.flareEls = {
      'h-1': this.container.querySelector<HTMLElement>('#h-1'),
      'r-1': this.container.querySelector<HTMLElement>('#r-1'),
      'g-1': this.container.querySelector<HTMLElement>('#g-1'),
      'g-2': this.container.querySelector<HTMLElement>('#g-2'),
      't-1': this.container.querySelector<HTMLElement>('#t-1'),
      'mg-1': this.container.querySelector<HTMLElement>('#mg-1'),
      'mh-1': this.container.querySelector<HTMLElement>('#mh-1'),
      sunFC: this.container.querySelector<HTMLElement>('#sunFlareCont'),
      moonFC: this.container.querySelector<HTMLElement>('#moonFlareCont'),
    };
  }

  private updateOptics(
    dx: number,
    dy: number,
    alt: number,
    isMoon = false,
    moonGlowFactor = 1,
    occlusionFactor = 1
  ): boolean {
    if (!this.flareEls) return false;
    const cont = isMoon ? this.flareEls.moonFC : this.flareEls.sunFC;
    if (!cont) return false;

    const fadeStart = 0;
    const visibleRange = 0.3;
    const rawOpacity = (alt - fadeStart) / visibleRange;
    const finalOpacity = Math.max(0, Math.min(1, rawOpacity)) * occlusionFactor;
    const maxOpacity = isMoon ? 0.4 * moonGlowFactor : 0.95;
    const netOpacity = finalOpacity * maxOpacity;

    if (netOpacity <= 0.001) {
      if (isMoon) {
        if (this.lastMoonFcVisible) {
          this.lastMoonFcVisible = false;
          cont.style.display = 'none';
        }
      } else {
        if (this.lastSunFcVisible) {
          this.lastSunFcVisible = false;
          cont.style.display = 'none';
        }
      }
      return false;
    }

    const opStr = netOpacity.toFixed(4);
    if (isMoon) {
      if (!this.lastMoonFcVisible) {
        this.lastMoonFcVisible = true;
        cont.style.display = '';
      }
      if (opStr !== this.lastMoonFcOpacity) {
        this.lastMoonFcOpacity = opStr;
        cont.style.opacity = opStr;
      }
    } else {
      if (!this.lastSunFcVisible) {
        this.lastSunFcVisible = true;
        cont.style.display = '';
      }
      if (opStr !== this.lastSunFcOpacity) {
        this.lastSunFcOpacity = opStr;
        cont.style.opacity = opStr;
      }
    }

    const setFP = (id: keyof FlareElements, s: number) => {
      const el = this.flareEls?.[id];
      if (el) {
        const px = (dx * (1 - s)).toFixed(3);
        const py = (dy * (1 - s)).toFixed(3);
        el.style.transform = `translate3d(calc(50vw + ${px}vmax), calc(50vh + ${py}vmax), 0) translate(-50%, -50%)`;
      }
    };

    if (!isMoon) {
      setFP('h-1', 0.5);
      setFP('r-1', 1.3);
      setFP('g-1', 1.6);
      setFP('g-2', 1.1);
      setFP('t-1', 0.25);
    } else {
      setFP('mg-1', 1.2);
      setFP('mh-1', 0.5);
    }

    return true;
  }

  private updateSky(m: number, simDate: Date): void {
    const mG = ((m % 1440) + 1440) % 1440;
    const solar = getSunTimes(simDate);
    const { zenith, horizon, zenithRgb, horizonRgb, brightness } = calcSkyColors(mG, solar);

    // 구름 차폐 파라미터 가져오기
    const cloudProfile = this.isCloudsEnabled ? this.cloudRenderer?.getStageProfile() : null;
    const sunOcc = cloudProfile ? cloudProfile.sunOcclusion : 0;
    const moonOcc = cloudProfile ? cloudProfile.moonOcclusion : 0;
    const starOcc = cloudProfile ? cloudProfile.starOcclusion : 0;
    const ambientDull = cloudProfile ? cloudProfile.ambientDull : 0;

    // 대기색 둔화 (전천 흐림 시)
    let displayZenith = zenith;
    let displayHorizon = horizon;
    let zR = zenithRgb[0], zG = zenithRgb[1], zB = zenithRgb[2];
    let hR = horizonRgb[0], hG = horizonRgb[1], hB = horizonRgb[2];

    if (ambientDull > 0.05) {
      zR = Math.round(zR * (1 - ambientDull) + 40 * ambientDull);
      zG = Math.round(zG * (1 - ambientDull) + 48 * ambientDull);
      zB = Math.round(zB * (1 - ambientDull) + 60 * ambientDull);
      hR = Math.round(hR * (1 - ambientDull) + 65 * ambientDull);
      hG = Math.round(hG * (1 - ambientDull) + 75 * ambientDull);
      hB = Math.round(hB * (1 - ambientDull) + 88 * ambientDull);
      displayZenith = `rgb(${zR}, ${zG}, ${zB})`;
      displayHorizon = `rgb(${hR}, ${hG}, ${hB})`;
    }

    if (displayZenith !== this.lastZenith || displayHorizon !== this.lastHorizon) {
      if (this.skyLayerEl) {
        this.skyLayerEl.style.background = `linear-gradient(to bottom, ${displayZenith} 0%, ${displayHorizon} 100%)`;
      }
      this.lastZenith = displayZenith;
      this.lastHorizon = displayHorizon;
    }

    // 1. 태양 좌표 및 렌더링 (보이는 요소만 갱신, 불가시 레이어 컬링)
    const sunCoords = calcSunCoords(mG, solar);
    const rawSunOpacity = Math.max(0, Math.min(1, (sunCoords.altitude - -2) / 7));
    const sunOpacity = rawSunOpacity * (1 - sunOcc);
    const sunPosKey = `${sunCoords.x}|${sunCoords.y}`;

    if (sunCoords.altitude >= -2.0 && sunOpacity > 0.001) {
      if (this.sunDiskEl) {
        if (!this.lastSunVisible) {
          this.lastSunVisible = true;
          this.sunDiskEl.style.display = '';
        }
        const sunOpStr = sunOpacity.toFixed(4);
        if (sunOpStr !== this.lastSunOpacity) {
          this.lastSunOpacity = sunOpStr;
          this.sunDiskEl.style.opacity = sunOpStr;
        }
        if (sunPosKey !== this.lastSunPos) {
          this.lastSunPos = sunPosKey;
          this.sunDiskEl.style.transform = `translate3d(${sunCoords.x}, ${sunCoords.y}, 0) translate(-50%, -50%)`;
        }
      }
    } else if (this.sunDiskEl && this.lastSunVisible) {
      this.lastSunVisible = false;
      this.sunDiskEl.style.display = 'none';
    }

    if (sunCoords.altitude >= -2.0) {
      const maxAltFactor = solar.maxAlt / 90;
      const normalizedAlt = Math.max(0, sunCoords.altitude / 90);
      const atmOpacity = Math.max(0, Math.min(0.85, (normalizedAlt / maxAltFactor) * 1.2)) * (1 - sunOcc * 0.7);

      if (this.skyAtmosphereEl) {
        if (atmOpacity > 0.001) {
          if (!this.lastAtmVisible) {
            this.lastAtmVisible = true;
            this.skyAtmosphereEl.style.display = '';
          }
          const atmOpStr = atmOpacity.toFixed(4);
          if (atmOpStr !== this.lastAtmOpacity) {
            this.lastAtmOpacity = atmOpStr;
            this.skyAtmosphereEl.style.opacity = atmOpStr;
          }
          if (sunPosKey !== this.lastAtmPos) {
            this.lastAtmPos = sunPosKey;
            this.skyAtmosphereEl.style.setProperty('--atm-x', sunCoords.x);
            this.skyAtmosphereEl.style.setProperty('--atm-y', sunCoords.y);
          }
        } else if (this.lastAtmVisible) {
          this.lastAtmVisible = false;
          this.skyAtmosphereEl.style.display = 'none';
        }
      }

      const flareOcc = Math.pow(Math.max(0, 1 - sunOcc), 2.8);
      const sunFcVisible = this.updateOptics(sunCoords.dx, sunCoords.dy, sunCoords.altitude, false, 1, flareOcc);
      if (sunFcVisible && this.sunStreakEl && sunPosKey !== this.lastSunStreakPos) {
        this.lastSunStreakPos = sunPosKey;
        this.sunStreakEl.style.transform = `translate3d(${sunCoords.x}, ${sunCoords.y}, 0) translate(-50%, -50%) rotate(-3deg)`;
      }
    } else {
      if (this.skyAtmosphereEl && this.lastAtmVisible) {
        this.lastAtmVisible = false;
        this.skyAtmosphereEl.style.display = 'none';
      }
      if (this.flareEls?.sunFC && this.lastSunFcVisible) {
        this.lastSunFcVisible = false;
        this.flareEls.sunFC.style.display = 'none';
      }
    }

    // 2. 달 좌표 및 렌더링
    const moonAge = getMoonAge(simDate);
    const { coords: moonCoords } = calcMoonCoords(mG, solar, moonAge);

    const rawMoonOpacity = Math.max(0, Math.min(1, (moonCoords.altitude - -2) / 7));
    const moonOpacity = rawMoonOpacity * (1 - moonOcc);
    const moonVisible = moonCoords.altitude >= -2.0 && moonOpacity > 0.001;
    const moonPosKey = `${moonCoords.x}|${moonCoords.y}`;

    if (moonVisible) {
      const moonOpStr = moonOpacity.toFixed(4);
      const earthshineOpacity = Math.max(0, Math.min(1, 1 - (brightness - 21.67) / 8)) * (1 - moonOcc);
      const moonAuraOpacity = Math.max(0, Math.min(1, 1 - (brightness - 21.67) / 15)) * (1 - moonOcc);
      const earthshineOpStr = earthshineOpacity.toFixed(4);
      const auraTotalOp = moonOpacity * moonAuraOpacity;

      if (this.moonDiskEl) {
        if (!this.lastMoonVisible) {
          this.lastMoonVisible = true;
          this.moonDiskEl.style.display = '';
        }
        if (moonOpStr !== this.lastMoonOpacity) {
          this.lastMoonOpacity = moonOpStr;
          this.moonDiskEl.style.opacity = moonOpStr;
          if (this.moonCrescentEl) {
            this.moonCrescentEl.style.opacity = moonOpStr;
          }
        }
        if (moonPosKey !== this.lastMoonPos) {
          this.lastMoonPos = moonPosKey;
          this.moonDiskEl.style.transform = `translate3d(${moonCoords.x}, ${moonCoords.y}, 0) translate(-50%, -50%)`;
        }
      }

      if (this.moonEarthshineEl && earthshineOpStr !== this.lastEarthshineOpacity) {
        this.lastEarthshineOpacity = earthshineOpStr;
        this.moonEarthshineEl.style.opacity = earthshineOpStr;
      }

      if (this.moonCrescentEl) {
        const glowVal =
          brightness > 30 || moonOcc > 0.6
            ? 'none'
            : 'drop-shadow(0 0 5px rgba(255, 245, 220, 0.85)) drop-shadow(0 0 15px rgba(200, 225, 255, 0.4))';
        if (glowVal !== this.lastMoonGlow) {
          this.lastMoonGlow = glowVal;
          this.moonCrescentEl.style.filter = glowVal;
        }
      }

      const moonPath = getMoonPath(moonAge);
      if (this.moonCrescentPathEl && moonPath !== this.lastMoonPath) {
        this.lastMoonPath = moonPath;
        this.moonCrescentPathEl.setAttribute('d', moonPath);
      }

      if (this.moonAuraEl) {
        if (auraTotalOp > 0.001) {
          if (!this.lastMoonAuraVisible) {
            this.lastMoonAuraVisible = true;
            this.moonAuraEl.style.display = '';
          }
          const auraOpStr = auraTotalOp.toFixed(4);
          if (auraOpStr !== this.lastMoonAuraOpacity) {
            this.lastMoonAuraOpacity = auraOpStr;
            this.moonAuraEl.style.opacity = auraOpStr;
          }
          if (moonPosKey !== this.lastMoonAuraPos) {
            this.lastMoonAuraPos = moonPosKey;
            this.moonAuraEl.style.transform = `translate3d(${moonCoords.x}, ${moonCoords.y}, 0) translate(-50%, -50%)`;
          }
        } else if (this.lastMoonAuraVisible) {
          this.lastMoonAuraVisible = false;
          this.moonAuraEl.style.display = 'none';
        }
      }

      const moonGlowFactor = Math.max(0, Math.min(1, 1 - (brightness - 21.67) / 20));
      const moonFlareOcc = Math.pow(Math.max(0, 1 - moonOcc), 2.8);
      this.updateOptics(moonCoords.dx, moonCoords.dy, moonCoords.altitude, true, moonGlowFactor * moonOpacity, moonFlareOcc);
    } else {
      if (this.moonDiskEl && this.lastMoonVisible) {
        this.lastMoonVisible = false;
        this.moonDiskEl.style.display = 'none';
      }
      if (this.moonAuraEl && this.lastMoonAuraVisible) {
        this.lastMoonAuraVisible = false;
        this.moonAuraEl.style.display = 'none';
      }
      if (this.flareEls?.moonFC && this.lastMoonFcVisible) {
        this.lastMoonFcVisible = false;
        this.flareEls.moonFC.style.display = 'none';
      }
    }

    // 3. 밤하늘 은하수 / 황혼 페이딩 및 별 마스크 제어
    const { starOpacity: rawStarOpacity, starMaskY } = calcTwilight(mG, solar);
    const starOpacity = rawStarOpacity * (1 - starOcc);
    const starVisible = starOpacity > 0.001;

    if (this.starContainerEl) {
      if (starVisible) {
        if (!this.lastStarContainerVisible) {
          this.lastStarContainerVisible = true;
          this.starContainerEl.style.display = '';
        }

        const starOpStr = starOpacity.toFixed(4);
        if (starOpStr !== this.lastStarOpacity) {
          this.lastStarOpacity = starOpStr;
          this.starContainerEl.style.opacity = starOpStr;
        }

        const lst = getSiderealTime(simDate);
        const starRotStr = getStarRotation(lst).toFixed(3);
        if (starRotStr !== this.lastStarRot) {
          this.lastStarRot = starRotStr;
          this.starContainerEl.style.transform = `translate(-50%, -50%) rotate(${starRotStr}deg) translate3d(0, 0, 0)`;
        }

        if (starMaskY >= 140) {
          if (!this.lastStarMaskNone) {
            this.lastStarMaskNone = true;
            this.starContainerEl.style.maskImage = 'none';
            this.starContainerEl.style.webkitMaskImage = 'none';
          }
        } else {
          if (this.lastStarMaskNone) {
            this.lastStarMaskNone = false;
            this.starContainerEl.style.maskImage = '';
            this.starContainerEl.style.webkitMaskImage = '';
          }
          const maskYStr = `${starMaskY.toFixed(2)}%`;
          if (maskYStr !== this.lastStarMaskY) {
            this.lastStarMaskY = maskYStr;
            this.starContainerEl.style.setProperty('--star-mask-y', maskYStr);
          }
        }
      } else if (this.lastStarContainerVisible) {
        this.lastStarContainerVisible = false;
        this.starContainerEl.style.display = 'none';
      }
    }

    if (this.starWrapperEl) {
      this.syncStarWrapperVisibility();
      if (this.lastStarWrapperVisible) {
        if (moonVisible) {
          if (!this.lastStarMaskVisible) {
            this.lastStarMaskVisible = true;
            this.starWrapperEl.style.maskImage = '';
            this.starWrapperEl.style.webkitMaskImage = '';
          }
          if (moonPosKey !== this.lastStarWrapperMoonPos) {
            this.lastStarWrapperMoonPos = moonPosKey;
            this.starWrapperEl.style.setProperty('--moon-x', moonCoords.x);
            this.starWrapperEl.style.setProperty('--moon-y', moonCoords.y);
          }
        } else if (this.lastStarMaskVisible) {
          this.lastStarMaskVisible = false;
          this.starWrapperEl.style.maskImage = 'none';
          this.starWrapperEl.style.webkitMaskImage = 'none';
        }
      }
    }

    // 4. 구름 렌더러에 실시간 3D 광원 조명 컨텍스트 전달 및 렌더링
    if (this.isCloudsEnabled && this.cloudRenderer) {
      const sunAzRad = (sunCoords.dx / 38) * 1.2;
      const sunAltRad = (sunCoords.altitude * Math.PI) / 180;
      const sunDirX = Math.sin(sunAzRad) * Math.cos(sunAltRad);
      const sunDirY = Math.sin(sunAltRad);
      const sunDirZ = Math.cos(sunAzRad) * Math.cos(sunAltRad);

      const moonAzRad = (moonCoords.dx / 38) * 1.2;
      const moonAltRad = (moonCoords.altitude * Math.PI) / 180;
      const moonDirX = Math.sin(moonAzRad) * Math.cos(moonAltRad);
      const moonDirY = Math.sin(moonAltRad);
      const moonDirZ = Math.cos(moonAzRad) * Math.cos(moonAltRad);

      const ctx = this._lastLightingCtx;
      ctx.sunAlt = sunCoords.altitude;
      ctx.sunDir[0] = sunDirX; ctx.sunDir[1] = sunDirY; ctx.sunDir[2] = sunDirZ;
      ctx.sunVisible = sunCoords.altitude >= -2;
      ctx.moonAlt = moonCoords.altitude;
      ctx.moonDir[0] = moonDirX; ctx.moonDir[1] = moonDirY; ctx.moonDir[2] = moonDirZ;
      ctx.moonVisible = moonCoords.altitude >= -2;
      ctx.moonPhaseAge = moonAge;
      ctx.zenithColor[0] = zR / 255; ctx.zenithColor[1] = zG / 255; ctx.zenithColor[2] = zB / 255;
      ctx.horizonColor[0] = hR / 255; ctx.horizonColor[1] = hG / 255; ctx.horizonColor[2] = hB / 255;
      ctx.ambientBrightness = brightness;

      this.cloudRenderer.render(ctx);
    }
  }

  private onIdleTick(): void {
    if (!this.isRunning || this.isPaused) return;
    const { currentMinutes, simDate, skyKey } = this.getSimTime();
    if (skyKey !== this.lastSkyKey) {
      this.lastSkyKey = skyKey;
      this.updateSky(currentMinutes, simDate);
    }
  }

  private loop(timestamp: number): void {
    if (!this.isRunning || this.isPaused) return;

    if (!this.needsCloudRaf()) {
      this.syncScheduler();
      return;
    }

    // 1-A: 일반 모드 최대 60fps(~14.17ms 임계치로 60Hz VSync 미스 방지 + 120/144/165Hz 제한),
    //      저사양 모드 최대 30fps 제한
    const targetIntervalMs = this.isPerfMode ? 1000 / 30 : 1000 / 60;
    const elapsedMs = timestamp - this.lastCloudRenderTs;

    if (elapsedMs >= targetIntervalMs - 2.5) {
      this.lastCloudRenderTs = timestamp;
      const clampedMs = Math.min(elapsedMs, 2000);
      const dtSec = clampedMs / 1000;

      if (dtSec > 0 && this.cloudRenderer) {
        this.cloudRenderer.update(dtSec);
        this.cloudRenderer.adaptiveDRS(clampedMs);
      }

      const { currentMinutes, simDate, skyKey } = this.getSimTime();
      if (skyKey !== this.lastSkyKey) {
        this.lastSkyKey = skyKey;
        this.updateSky(currentMinutes, simDate);
      } else {
        this.cloudRenderer?.renderCached();
      }
    }

    this.rafId = requestAnimationFrame(this._boundLoop);
  }
}

export const skyBackgroundService = new SkyBackgroundService();

// 개발 및 테스트를 위한 전역 객체 노출
if (typeof window !== 'undefined') {
  (window as unknown as { skyBackgroundService: SkyBackgroundService }).skyBackgroundService = skyBackgroundService;
}
