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
  private moonCrescentPathEl: SVGPathElement | null = null;
  private skyLayerEl: HTMLElement | null = null;
  private satController: SatelliteController | null = null;

  // 구름 렌더러
  private cloudRenderer: WebGLCloudRenderer | null = null;
  private cloudCanvasEl: HTMLCanvasElement | null = null;
  private resizeHandler: (() => void) | null = null;
  private isCloudsEnabled: boolean = true;
  private lastRafTimestamp: number = 0;
  private readonly _boundLoop: (ts: number) => void;
  private unregisterWeather: (() => void) | null = null;

  private rafId: number | null = null;
  private isEnabled: boolean = true;
  private isPerfMode: boolean = false;
  private timeOffset: number = 0; // 시간 단위 오프셋 (-12 ~ +14)
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private isSuppressed: boolean = false;

  private lastZenith: string = '';
  private lastHorizon: string = '';
  private frameCounter: number = -1;

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
  }

  public init(container: HTMLElement | null): void {
    this.container = container;
    this.isEnabled = getSavedSkyBg();
    this.isPerfMode = getSavedSkyPerf();
    this.isCloudsEnabled = getSavedSkyClouds();
    this.timeOffset = getSavedSkyTimeOffset();

    // 탭 비활성화(브라우저 백그라운드) 시 불필요한 루프 일시정지
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
      } else if (this.isEnabled && !this.isSuppressed && this.isRunning) {
        this.resume();
      }
    });

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

  public setTimeOffset(offset: number): void {
    this.timeOffset = offset;
    setSavedSkyTimeOffset(offset);
    if (this.isRunning) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + this.timeOffset * 60;
      const simDate = new Date(now.getTime() + this.timeOffset * 3600000);
      this.updateSky(currentMinutes, simDate);
    }
  }

  public toggleClouds(enabled: boolean): void {
    this.isCloudsEnabled = enabled;
    setSavedSkyClouds(enabled);
    if (this.cloudCanvasEl) {
      this.cloudCanvasEl.style.display = enabled ? '' : 'none';
    }
    if (this.isRunning) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + this.timeOffset * 60;
      const simDate = new Date(now.getTime() + this.timeOffset * 3600000);
      this.updateSky(currentMinutes, simDate);
    }
  }

  public setCloudLevel(level: number): void {
    this.cloudRenderer?.setStageLevel(level);
    if (this.isRunning) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + this.timeOffset * 60;
      const simDate = new Date(now.getTime() + this.timeOffset * 3600000);
      this.updateSky(currentMinutes, simDate);
    }
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

    if (this.isRunning) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + this.timeOffset * 60;
      const simDate = new Date(now.getTime() + this.timeOffset * 3600000);
      this.updateSky(currentMinutes, simDate);
    }
  }

  /**
   * 하늘 배경 시뮬레이션 시작 (DOM 생성, RAF 루프 가동, 위성 스케줄러 등록, 구름 렌더러 초기화)
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
      this.satController = setupSatelliteLoops(satLayer, () => this.isPerfMode);
    }

    // 구름 렌더러 초기화
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
    this.frameCounter = -1;
    this.lastRafTimestamp = performance.now();

    // 첫 프레임 즉각 동기 렌더링 (깜빡임/지연 방지)
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + this.timeOffset * 60;
    const simDate = new Date(now.getTime() + this.timeOffset * 3600000);
    this.updateSky(currentMinutes, simDate);

    this.rafId = requestAnimationFrame(this._boundLoop);
  }

  /**
   * 하늘 배경 시뮬레이션 완전 정지 및 모든 자원 해제 (Zero Resource Overhead)
   */
  public stop(): void {
    this.isRunning = false;
    this.isPaused = false;

    // 1. requestAnimationFrame 즉시 취소
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

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

    // 7. DOM 완전 정리
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.flareEls = null;
    this.moonCrescentPathEl = null;
    this.skyLayerEl = null;
    this.lastZenith = '';
    this.lastHorizon = '';
  }

  /**
   * 메인 탭 이탈 시 임시 일시정지 (루프만 정지하여 CPU/GPU 절약)
   */
  public pause(): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
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
    this.lastRafTimestamp = performance.now();
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(this._boundLoop);
    }
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

  private mountDOM(): void {
    if (!this.container) return;

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
    this.moonCrescentPathEl = this.container.querySelector<SVGPathElement>('#moonCrescentPath');

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

  private updateOptics(dx: number, dy: number, alt: number, isMoon = false, moonGlowFactor = 1, occlusionFactor = 1): void {
    if (!this.flareEls) return;
    const cont = isMoon ? this.flareEls.moonFC : this.flareEls.sunFC;
    if (!cont) return;

    const fadeStart = 0;
    const visibleRange = 0.3;
    const rawOpacity = (alt - fadeStart) / visibleRange;
    const finalOpacity = Math.max(0, Math.min(1, rawOpacity)) * occlusionFactor;

    const maxOpacity = isMoon ? 0.4 * moonGlowFactor : 0.95;
    cont.style.opacity = (finalOpacity * maxOpacity).toString();

    if (finalOpacity <= 0) return;

    const setFP = (id: keyof FlareElements, s: number) => {
      const el = this.flareEls?.[id];
      if (el) {
        const px = dx * (1 - s);
        const py = dy * (1 - s);
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
  }

  private updateSky(m: number, simDate: Date): void {
    const root = document.documentElement.style;
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

    const earthshineOpacity = Math.max(0, Math.min(1, 1 - (brightness - 21.67) / 8)) * (1 - moonOcc);
    const moonAuraOpacity = Math.max(0, Math.min(1, 1 - (brightness - 21.67) / 15)) * (1 - moonOcc);
    root.setProperty('--moon-earthshine-opacity', earthshineOpacity.toString());
    root.setProperty('--moon-aura-opacity', moonAuraOpacity.toString());

    if (brightness > 30 || moonOcc > 0.6) {
      root.setProperty('--moon-crescent-glow', 'none');
    } else {
      root.setProperty(
        '--moon-crescent-glow',
        'drop-shadow(0 0 5px rgba(255, 245, 220, 0.85)) drop-shadow(0 0 15px rgba(200, 225, 255, 0.4))'
      );
    }

    if (displayZenith !== this.lastZenith || displayHorizon !== this.lastHorizon) {
      if (this.skyLayerEl) {
        this.skyLayerEl.style.background = `linear-gradient(to bottom, ${displayZenith} 0%, ${displayHorizon} 100%)`;
      }
      root.setProperty('--sky-zenith', displayZenith);
      root.setProperty('--sky-horizon', displayHorizon);
      this.lastZenith = displayZenith;
      this.lastHorizon = displayHorizon;
    }

    // 1. 태양 좌표 및 렌더링
    const sunCoords = calcSunCoords(mG, solar);
    const rawSunOpacity = Math.max(0, Math.min(1, (sunCoords.altitude - -2) / 7));
    const sunOpacity = rawSunOpacity * (1 - sunOcc);
    root.setProperty('--sun-opacity', sunOpacity.toString());

    if (sunCoords.altitude >= -2.0) {
      root.setProperty('--sun-x', sunCoords.x);
      root.setProperty('--sun-y', sunCoords.y);

      const maxAltFactor = solar.maxAlt / 90;
      const normalizedAlt = Math.max(0, sunCoords.altitude / 90);
      root.setProperty(
        '--atm-opacity',
        (Math.max(0, Math.min(0.85, (normalizedAlt / maxAltFactor) * 1.2)) * (1 - sunOcc * 0.7)).toString()
      );

      const flareOcc = Math.pow(Math.max(0, 1 - sunOcc), 2.8);
      this.updateOptics(sunCoords.dx, sunCoords.dy, sunCoords.altitude, false, 1, flareOcc);
    } else {
      root.setProperty('--sun-y', '150vh');
      root.setProperty('--atm-opacity', '0');
      if (this.flareEls?.sunFC) this.flareEls.sunFC.style.opacity = '0';
    }

    // 2. 달 좌표 및 렌더링
    const moonAge = getMoonAge(simDate);
    const { coords: moonCoords } = calcMoonCoords(mG, solar, moonAge);

    const rawMoonOpacity = Math.max(0, Math.min(1, (moonCoords.altitude - -2) / 7));
    const moonOpacity = rawMoonOpacity * (1 - moonOcc);
    root.setProperty('--moon-opacity', moonOpacity.toString());

    if (moonCoords.altitude >= -2.0) {
      root.setProperty('--moon-x', moonCoords.x);
      root.setProperty('--moon-y', moonCoords.y);

      const moonPath = getMoonPath(moonAge);
      if (this.moonCrescentPathEl) {
        this.moonCrescentPathEl.setAttribute('d', moonPath);
      }

      const moonGlowFactor = Math.max(0, Math.min(1, 1 - (brightness - 21.67) / 20));
      const moonFlareOcc = Math.pow(Math.max(0, 1 - moonOcc), 2.8);
      this.updateOptics(moonCoords.dx, moonCoords.dy, moonCoords.altitude, true, moonGlowFactor * moonOpacity, moonFlareOcc);
    } else {
      root.setProperty('--moon-y', '150vh');
      if (this.flareEls?.moonFC) this.flareEls.moonFC.style.opacity = '0';
    }

    // 3. 밤하늘 은하수 / 황혼 페이딩
    const { starOpacity: rawStarOpacity, starMaskY } = calcTwilight(mG, solar);
    const lst = getSiderealTime(simDate);
    const starRot = getStarRotation(lst);
    const starOpacity = rawStarOpacity * (1 - starOcc);

    root.setProperty('--star-opacity', starOpacity.toString());
    root.setProperty('--star-mask-y', `${starMaskY}%`);
    root.setProperty('--star-rot', `${starRot}deg`);

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

  private loop(timestamp: number): void {
    if (!this.isRunning || this.isPaused) return;

    const deltaSec = (timestamp - this.lastRafTimestamp) / 1000;
    this.lastRafTimestamp = timestamp;

    if (deltaSec > 0 && deltaSec < 2 && this.isCloudsEnabled) {
      // 1. 구름 실시간 이동 애니메이션 (바람에 따른 유체 드리프트)
      this.cloudRenderer?.update(deltaSec);

      // 2. 적응형 DRS (동적 해상도 스케일링)
      const deltaMs = deltaSec * 1000;
      this.cloudRenderer?.adaptiveDRS(deltaMs);
    }

    this.frameCounter++;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + this.timeOffset * 60;
    const simDate = new Date(now.getTime() + this.timeOffset * 3600000);

    // 저사양 모드 시 15프레임마다 연산, 일반 모드 시 매 프레임 연산
    if (!this.isPerfMode || this.frameCounter % 15 === 0) {
      this.updateSky(currentMinutes, simDate);
    } else if (this.isCloudsEnabled) {
      this.cloudRenderer?.renderCached();
    }

    this.rafId = requestAnimationFrame(this._boundLoop);
  }
}

export const skyBackgroundService = new SkyBackgroundService();

// 개발 및 테스트를 위한 전역 객체 노출
if (typeof window !== 'undefined') {
  (window as unknown as { skyBackgroundService: SkyBackgroundService }).skyBackgroundService = skyBackgroundService;
}
