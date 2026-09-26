import { getSunTimes, calcSunCoords } from './astronomy/sun';
import { getMoonAge, getMoonPath, calcMoonCoords, getMoonPhaseName } from './astronomy/moon';
import { getSiderealTime, getStarRotation } from './astronomy/sidereal';
import { calcSkyColors, calcTwilight } from './astronomy/sky';
import { setupSatelliteLoops, type SatelliteController } from './astronomy/satellite';
import { DEFAULT_LAT, DEFAULT_LON } from './astronomy/constants';
import type { FlareElements, SunTimes, ScreenCoords } from './astronomy/types';
import { WebGLCloudRenderer } from './clouds/webglCloudRenderer';
import type { CloudStageProfile, CloudLightingContext } from './clouds/types';

export interface AstronomyTelemetry {
  currentMinutes: number;
  simDate: Date;
  formattedTime: string;
  formattedDate: string;
  solar: SunTimes;
  sunCoords: ScreenCoords;
  moonAge: number;
  moonPhase: { name: string; icon: string; percent: number };
  moonCoords: ScreenCoords;
  moonElongation: number;
  lst: number;
  starRot: number;
  starOpacity: number;
  starMaskY: number;
  zenith: string;
  horizon: string;
  brightness: number;
  lat: number;
  lon: number;
  isPlaying: boolean;
  speedMultiplier: number;
  cloudLevel: number;
  cloudProfile: CloudStageProfile;
  sunOcclusion: number;
  moonOcclusion: number;
  starOcclusion: number;
}

export class PlanetariumEngine {
  private container: HTMLElement | null = null;
  private flareEls: FlareElements | null = null;
  private moonCrescentPathEl: SVGPathElement | null = null;
  private moonCrescentEl: HTMLElement | null = null;
  private skyLayerEl: HTMLElement | null = null;
  private skyAtmosphereEl: HTMLElement | null = null;
  private sunDiskEl: HTMLElement | null = null;
  private sunStreakEl: HTMLElement | null = null;
  private moonDiskEl: HTMLElement | null = null;
  private moonAuraEl: HTMLElement | null = null;
  private moonEarthshineEl: HTMLElement | null = null;
  private starContainerEl: HTMLElement | null = null;
  private starWrapperEl: HTMLElement | null = null;
  private satLayerEl: HTMLElement | null = null;
  private satController: SatelliteController | null = null;

  // 구름 렌더러
  private cloudRenderer: WebGLCloudRenderer | null = null;
  private cloudCanvasEl: HTMLCanvasElement | null = null;

  private resizeHandler: (() => void) | null = null;

  private rafId: number | null = null;
  private isRunning: boolean = false;
  private isPlaying: boolean = true;
  private speedMultiplier: number = 1;
  private isPerfMode: boolean = false;

  private lat: number = DEFAULT_LAT;
  private lon: number = DEFAULT_LON;

  // 시뮬레이션 상태
  private simDate: Date = new Date();
  private currentMinutes: number = 0;
  private lastRafTimestamp: number = 0;

  private lastZenith: string = '';
  private lastHorizon: string = '';
  private lastMoonPath: string = '';
  private visibilityHandler: (() => void) | null = null;
  private frameCounter: number = -1;

  // ===== Phase 1 최적화: 바운드 루프 캐시 (전략 2) =====
  private readonly _boundLoop: (ts: number) => void;

  // ===== Phase 1 최적화: 시간 기반 더티 플래그 (전략 1) =====
  private lastSkyKey: number = -1;

  // ===== Phase 1 최적화: Zero-Alloc 텔레메트리 캐시 (전략 4) =====
  private _telemetryCache: AstronomyTelemetry;

  // ===== Phase 1 최적화: 마지막 DRS 프레임타임 (적응형 DRS) =====
  private lastDrsTimestamp: number = 0;

  private telemetryListeners: Array<(data: AstronomyTelemetry) => void> = [];

  // 마지막 updateSky에서 계산된 조명 컨텍스트 (renderCached에서 재사용)
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
    const now = new Date();
    this.simDate = new Date(now.getTime());
    this.currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    // 바운드 루프 함수를 생성자에서 1회만 바인딩 (매 프레임 .bind() 호출 제거)
    this._boundLoop = this.loop.bind(this);

    // 텔레메트리 캐시 객체 사전 할당 (Zero-GC)
    this._telemetryCache = {
      currentMinutes: 0,
      simDate: this.simDate,
      formattedTime: '',
      formattedDate: '',
      solar: { sunrise: 0, sunset: 0, solarNoon: 0, maxAlt: 0, declDeg: 0 },
      sunCoords: { x: '0', y: '0', dx: 0, dy: 0, altitude: 0 },
      moonAge: 0,
      moonPhase: { name: '', icon: '', percent: 0 },
      moonCoords: { x: '0', y: '0', dx: 0, dy: 0, altitude: 0 },
      moonElongation: 0,
      lst: 0,
      starRot: 0,
      starOpacity: 0,
      starMaskY: 0,
      zenith: '',
      horizon: '',
      brightness: 0,
      lat: this.lat,
      lon: this.lon,
      isPlaying: true,
      speedMultiplier: 1,
      cloudLevel: 800,
      cloudProfile: {} as CloudStageProfile,
      sunOcclusion: 0,
      moonOcclusion: 0,
      starOcclusion: 0,
    };
  }

  public init(container: HTMLElement | null): void {
    this.container = container;
    if (!this.container) {
      this.container = document.getElementById('sky-background');
    }
    if (this.container) {
      this.start();
    }
  }

  public start(): void {
    if (this.isRunning) return;
    if (!this.container) {
      this.container = document.getElementById('sky-background');
      if (!this.container) return;
    }

    this.mountDOM();
    document.body.classList.add('sky-bg-active');
    if (this.isPerfMode) {
      document.body.classList.add('perf-active');
    }

    this.satLayerEl = this.container.querySelector<HTMLElement>('#satLayer');
    if (this.satLayerEl) {
      this.satController = setupSatelliteLoops(
        this.satLayerEl,
        () => this.isPerfMode,
        () => this.currentMinutes,
        () => this.simDate
      );
    }

    // 구름 렌더러 초기화
    this.cloudCanvasEl = this.container.querySelector<HTMLCanvasElement>('#cloudCanvas');
    if (this.cloudCanvasEl) {
      this.cloudRenderer = new WebGLCloudRenderer(this.cloudCanvasEl);
      this.cloudRenderer.setPerfMode(this.isPerfMode);
    }

    // 윈도우 리사이즈 이벤트 바인딩
    this.resizeHandler = () => {
      this.cloudRenderer?.resize();
    };
    window.addEventListener('resize', this.resizeHandler);

    // [최적화] 브라우저 백그라운드 탭 전환 시 자동 휴면(CPU/GPU 0.00% 동면)
    this.visibilityHandler = () => {
      if (document.hidden) {
        if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
      } else if (this.isRunning && this.rafId === null) {
        this.lastRafTimestamp = performance.now();
        this.rafId = requestAnimationFrame(this._boundLoop);
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    this.isRunning = true;
    this.lastRafTimestamp = performance.now();
    this.lastDrsTimestamp = performance.now();
    this.frameCounter = -1;
    this.lastSkyKey = -1; // 첫 프레임에서 반드시 updateSky 실행

    // 초기 렌더링
    this.updateSky();

    this.rafId = requestAnimationFrame(this._boundLoop);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.satController) {
      this.satController.stop();
      this.satController = null;
    }
    document.body.classList.remove('sky-bg-active');
    document.body.classList.remove('perf-active');
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.flareEls = null;
    this.moonCrescentPathEl = null;
    this.moonCrescentEl = null;
    this.skyLayerEl = null;
    this.skyAtmosphereEl = null;
    this.sunDiskEl = null;
    this.sunStreakEl = null;
    this.moonDiskEl = null;
    this.moonAuraEl = null;
    this.moonEarthshineEl = null;
    this.starContainerEl = null;
    this.starWrapperEl = null;
    this.satLayerEl = null;
    this.cloudCanvasEl = null;
    if (this.cloudRenderer) {
      this.cloudRenderer.destroy();
      this.cloudRenderer = null;
    }
    this.lastZenith = '';
    this.lastHorizon = '';
  }

  public setPlaying(playing: boolean): void {
    this.isPlaying = playing;
    this.lastRafTimestamp = performance.now();
  }

  public togglePlay(): boolean {
    this.isPlaying = !this.isPlaying;
    this.lastRafTimestamp = performance.now();
    return this.isPlaying;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = multiplier;
  }

  public getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  public setPerfMode(enabled: boolean): void {
    this.isPerfMode = enabled;
    this.cloudRenderer?.setPerfMode(enabled);
    if (enabled) {
      document.body.classList.add('perf-active');
    } else {
      document.body.classList.remove('perf-active');
    }
  }

  public getIsPerfMode(): boolean {
    return this.isPerfMode;
  }

  public setLocation(lat: number, lon: number): void {
    this.lat = lat;
    this.lon = lon;
    this.lastSkyKey = -1; // 강제 더티
    this.updateSky();
  }

  public getLocation(): { lat: number; lon: number } {
    return { lat: this.lat, lon: this.lon };
  }

  public setTime(minutes: number): void {
    this.currentMinutes = ((minutes % 1440) + 1440) % 1440;
    this.lastSkyKey = -1; // 강제 더티
    this.updateSky();
  }

  public getTime(): number {
    return this.currentMinutes;
  }

  public setDate(date: Date): void {
    this.simDate = new Date(date.getTime());
    this.lastSkyKey = -1; // 강제 더티
    this.updateSky();
  }

  public getDate(): Date {
    return this.simDate;
  }

  public syncWithRealTime(): void {
    const now = new Date();
    this.simDate = new Date(now.getTime());
    this.currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    this.speedMultiplier = 1;
    this.isPlaying = true;
    this.lastSkyKey = -1; // 강제 더티
    this.updateSky();
  }

  public spawnSatellite(isStarlink = false): void {
    if (this.satController) {
      this.satController.spawnSatellite(isStarlink, true);
    }
  }

  // 구름 제어 메서드
  public setCloudLevel(level: number): void {
    this.cloudRenderer?.setStageLevel(level);
    this.lastSkyKey = -1; // 강제 더티
    this.updateSky();
  }

  public getCloudLevel(): number {
    return this.cloudRenderer ? this.cloudRenderer.getStageLevel() : 0;
  }

  public getCloudProfile(): CloudStageProfile | null {
    return this.cloudRenderer ? this.cloudRenderer.getStageProfile() : null;
  }

  public setWind(speed: number, angleDeg: number): void {
    this.cloudRenderer?.setWind(speed, angleDeg);
  }

  public setCloudLayerVisibility(high: boolean, low: boolean): void {
    this.cloudRenderer?.setLayerVisibility(high, low);
  }

  public setLayerVisibility(
    layer: 'atmosphere' | 'stars' | 'sun' | 'moon' | 'satellites' | 'filmGrain' | 'clouds',
    visible: boolean
  ): void {
    if (!this.container) return;
    const layerMap: Record<string, string> = {
      atmosphere: '.sky-atmosphere',
      stars: '.star-wrapper',
      sun: '.sun-disk, #sunFlareCont',
      moon: '.moon-disk, .moon-aura, #moonFlareCont',
      satellites: '#satLayer',
      filmGrain: '.sky-film-grain',
      clouds: '#cloudCanvas',
    };
    const selector = layerMap[layer];
    if (selector) {
      const els = this.container.querySelectorAll<HTMLElement>(selector);
      els.forEach((el) => {
        el.style.display = visible ? '' : 'none';
      });
    }
  }

  public onTelemetry(callback: (data: AstronomyTelemetry) => void): () => void {
    this.telemetryListeners.push(callback);
    return () => {
      this.telemetryListeners = this.telemetryListeners.filter((l) => l !== callback);
    };
  }

  private mountDOM(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <!-- 베이스 하늘 그라디언트 레이어 (CSS 선형 & 방사형 그라디언트) -->
      <div class="sky-bg-layer sky-base" style="z-index: 0;"></div>
      <div id="skyLayer" class="sky-bg-layer sky-layer" style="z-index: 0;"></div>
      <div class="sky-bg-layer sky-atmosphere" style="z-index: 1;"></div>
      <div class="sky-bg-layer star-wrapper" style="z-index: 2;">
        <div class="sky-bg-layer star-container"></div>
        <div id="satLayer" class="sky-bg-layer" style="z-index: 3;"></div>
      </div>
      <div class="sky-bg-layer celestial" style="z-index: 3;">
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
    `;

    this.skyLayerEl = this.container.querySelector<HTMLElement>('#skyLayer');
    this.skyAtmosphereEl = this.container.querySelector<HTMLElement>('.sky-atmosphere');
    this.sunDiskEl = this.container.querySelector<HTMLElement>('.sun-disk');
    this.sunStreakEl = this.container.querySelector<HTMLElement>('.sun-streak');
    this.moonDiskEl = this.container.querySelector<HTMLElement>('.moon-disk');
    this.moonAuraEl = this.container.querySelector<HTMLElement>('.moon-aura');
    this.moonEarthshineEl = this.container.querySelector<HTMLElement>('.moon-earthshine');
    this.moonCrescentEl = this.container.querySelector<HTMLElement>('.moon-crescent');
    this.moonCrescentPathEl = this.container.querySelector<SVGPathElement>('#moonCrescentPath');
    this.starContainerEl = this.container.querySelector<HTMLElement>('.star-container');
    this.starWrapperEl = this.container.querySelector<HTMLElement>('.star-wrapper');

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

  private updateSky(): void {
    const mG = ((this.currentMinutes % 1440) + 1440) % 1440;
    const solar = getSunTimes(this.simDate, this.lat, this.lon);
    const { zenith, horizon, zenithRgb, horizonRgb, brightness } = calcSkyColors(mG, solar);

    // 구름 차폐 파라미터 가져오기
    const cloudProfile = this.cloudRenderer?.getStageProfile();
    const sunOcc = cloudProfile ? cloudProfile.sunOcclusion : 0;
    const moonOcc = cloudProfile ? cloudProfile.moonOcclusion : 0;
    const starOcc = cloudProfile ? cloudProfile.starOcclusion : 0;
    const ambientDull = cloudProfile ? cloudProfile.ambientDull : 0;

    // Zero-GC 숫자 기반 대기색 둔화 (전천 흐림 시)
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

    const earthshineOpacity = Math.max(0, Math.min(1, 1 - (brightness - 21.67) / 8)) * (1 - moonOcc);
    const moonAuraOpacity = Math.max(0, Math.min(1, 1 - (brightness - 21.67) / 15)) * (1 - moonOcc);
    if (this.moonEarthshineEl) {
      this.moonEarthshineEl.style.opacity = earthshineOpacity.toString();
    }
    if (this.moonCrescentEl) {
      this.moonCrescentEl.style.filter = (brightness > 30 || moonOcc > 0.6)
        ? 'none'
        : 'drop-shadow(0 0 5px rgba(255, 245, 220, 0.85)) drop-shadow(0 0 15px rgba(200, 225, 255, 0.4))';
    }

    // 1. 태양 좌표 및 직접 DOM 렌더링
    const sunCoords = calcSunCoords(mG, solar);
    const rawSunOpacity = Math.max(0, Math.min(1, (sunCoords.altitude - -2) / 7));
    const sunOpacity = rawSunOpacity * (1 - sunOcc);

    if (sunCoords.altitude >= -2.0) {
      if (this.sunDiskEl) {
        this.sunDiskEl.style.transform = `translate3d(${sunCoords.x}, ${sunCoords.y}, 0) translate(-50%, -50%)`;
        this.sunDiskEl.style.opacity = sunOpacity.toString();
      }
      if (this.sunStreakEl) {
        this.sunStreakEl.style.transform = `translate3d(${sunCoords.x}, ${sunCoords.y}, 0) translate(-50%, -50%) rotate(-3deg)`;
      }

      const maxAltFactor = solar.maxAlt / 90;
      const normalizedAlt = Math.max(0, sunCoords.altitude / 90);
      const atmOpacity = Math.max(0, Math.min(0.85, (normalizedAlt / maxAltFactor) * 1.2)) * (1 - sunOcc * 0.7);

      // Phase 1 전략 3: CSS Custom Property로 대기 그라디언트 중심 업데이트 (문자열 재생성 제거)
      if (this.skyAtmosphereEl) {
        this.skyAtmosphereEl.style.setProperty('--atm-cx', sunCoords.x);
        this.skyAtmosphereEl.style.setProperty('--atm-cy', sunCoords.y);
        this.skyAtmosphereEl.style.opacity = atmOpacity.toString();
      }

      const flareOcc = Math.pow(Math.max(0, 1 - sunOcc), 2.8);
      this.updateOptics(sunCoords.dx, sunCoords.dy, sunCoords.altitude, false, 1, flareOcc);
    } else {
      if (this.sunDiskEl) {
        this.sunDiskEl.style.transform = `translate3d(50vw, 150vh, 0) translate(-50%, -50%)`;
        this.sunDiskEl.style.opacity = '0';
      }
      if (this.skyAtmosphereEl) {
        this.skyAtmosphereEl.style.opacity = '0';
      }
      if (this.flareEls?.sunFC) this.flareEls.sunFC.style.opacity = '0';
    }

    // 2. 달 좌표 및 직접 DOM 렌더링
    const moonAge = getMoonAge(this.simDate);
    const { coords: moonCoords, elongation } = calcMoonCoords(mG, solar, moonAge, this.lat);

    const rawMoonOpacity = Math.max(0, Math.min(1, (moonCoords.altitude - -2) / 7));
    const moonOpacity = rawMoonOpacity * (1 - moonOcc);

    if (moonCoords.altitude >= -2.0) {
      if (this.moonDiskEl) {
        this.moonDiskEl.style.transform = `translate3d(${moonCoords.x}, ${moonCoords.y}, 0) translate(-50%, -50%)`;
        this.moonDiskEl.style.opacity = moonOpacity.toString();
      }
      if (this.moonAuraEl) {
        this.moonAuraEl.style.transform = `translate3d(${moonCoords.x}, ${moonCoords.y}, 0) translate(-50%, -50%)`;
        this.moonAuraEl.style.opacity = (moonOpacity * moonAuraOpacity).toString();
      }
      if (this.starWrapperEl) {
        const maskVal = `radial-gradient(circle at ${moonCoords.x} ${moonCoords.y}, transparent 15.5px, #fff 16px)`;
        this.starWrapperEl.style.maskImage = maskVal;
        this.starWrapperEl.style.webkitMaskImage = maskVal;
      }

      const moonPath = getMoonPath(moonAge);
      if (this.moonCrescentPathEl && moonPath !== this.lastMoonPath) {
        this.moonCrescentPathEl.setAttribute('d', moonPath);
        this.lastMoonPath = moonPath;
      }

      const moonGlowFactor = Math.max(0, Math.min(1, 1 - (brightness - 21.67) / 20));
      const moonFlareOcc = Math.pow(Math.max(0, 1 - moonOcc), 2.8);
      this.updateOptics(moonCoords.dx, moonCoords.dy, moonCoords.altitude, true, moonGlowFactor * moonOpacity, moonFlareOcc);
    } else {
      if (this.moonDiskEl) {
        this.moonDiskEl.style.transform = `translate3d(50vw, 150vh, 0) translate(-50%, -50%)`;
        this.moonDiskEl.style.opacity = '0';
      }
      if (this.moonAuraEl) {
        this.moonAuraEl.style.opacity = '0';
      }
      if (this.flareEls?.moonFC) this.flareEls.moonFC.style.opacity = '0';
    }

    // 3. 밤하늘 은하수 / 황혼 페이딩 직접 DOM 렌더링
    const { starOpacity: rawStarOpacity, starMaskY } = calcTwilight(mG, solar);
    const lst = getSiderealTime(this.simDate, this.lon);
    const starRot = getStarRotation(lst);
    const starOpacity = rawStarOpacity * (1 - starOcc);

    if (this.starContainerEl) {
      this.starContainerEl.style.transform = `translate(-50%, -50%) rotate(${starRot}deg) translate3d(0, 0, 0)`;
      this.starContainerEl.style.opacity = starOpacity.toString();
      const starMask = `linear-gradient(to bottom, #fff calc(${starMaskY}% - 40%), transparent calc(${starMaskY}% + 40%))`;
      this.starContainerEl.style.maskImage = starMask;
      this.starContainerEl.style.webkitMaskImage = starMask;
    }

    // 3D 천구 광원 방향 벡터 계산 (방위각, 고도각 기반)
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

    // 4. 구름 렌더러에 실시간 물리 광학 조명 컨텍스트 전달 및 렌더링
    // 조명 컨텍스트를 재사용 가능한 객체에 in-place 갱신 (Zero-GC)
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

    if (this.cloudRenderer) {
      this.cloudRenderer.render(ctx);
    }

    // 5. 텔레메트리 전송 (Zero-Alloc: 캐시 객체 재사용)
    if (this.telemetryListeners.length > 0) {
      const hh = Math.floor(mG / 60);
      const mm = Math.floor(mG % 60);
      const ss = Math.floor((mG * 60) % 60);

      const tel = this._telemetryCache;
      tel.currentMinutes = mG;
      tel.simDate = this.simDate;
      tel.formattedTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      tel.formattedDate = this.simDate.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      });
      tel.solar = solar;
      tel.sunCoords = sunCoords;
      tel.moonAge = moonAge;
      tel.moonPhase = getMoonPhaseName(moonAge);
      tel.moonCoords = moonCoords;
      tel.moonElongation = elongation;
      tel.lst = lst;
      tel.starRot = starRot;
      tel.starOpacity = starOpacity;
      tel.starMaskY = starMaskY;
      tel.zenith = displayZenith;
      tel.horizon = displayHorizon;
      tel.brightness = brightness;
      tel.lat = this.lat;
      tel.lon = this.lon;
      tel.isPlaying = this.isPlaying;
      tel.speedMultiplier = this.speedMultiplier;
      tel.cloudLevel = this.cloudRenderer ? this.cloudRenderer.getStageLevel() : 0;
      tel.cloudProfile = this.cloudRenderer ? this.cloudRenderer.getStageProfile() : ({} as CloudStageProfile);
      tel.sunOcclusion = sunOcc;
      tel.moonOcclusion = moonOcc;
      tel.starOcclusion = starOcc;

      for (const listener of this.telemetryListeners) {
        listener(tel);
      }
    }
  }

  private loop(timestamp: number): void {
    if (!this.isRunning) return;

    const deltaSec = (timestamp - this.lastRafTimestamp) / 1000;
    this.lastRafTimestamp = timestamp;

    if (deltaSec > 0 && deltaSec < 2) {
      // 구름 이동 업데이트 (항상 실행 — 바람은 매 프레임 진행)
      this.cloudRenderer?.update(deltaSec);

      // 적응형 DRS 업데이트
      const deltaMs = deltaSec * 1000;
      this.cloudRenderer?.adaptiveDRS(deltaMs);

      // 인공위성 통합 tick (Phase 1 전략 5: 개별 rAF 대신 메인 루프에서 일괄 업데이트)
      if (this.satController) {
        this.satController.tick(timestamp);
      }

      if (this.isPlaying) {
        const minutesDelta = (deltaSec * this.speedMultiplier) / 60;
        this.currentMinutes += minutesDelta;

        if (this.currentMinutes >= 1440) {
          const days = Math.floor(this.currentMinutes / 1440);
          this.currentMinutes %= 1440;
          this.simDate = new Date(this.simDate.getTime() + days * 86400000);
        } else if (this.currentMinutes < 0) {
          const days = Math.ceil(Math.abs(this.currentMinutes) / 1440);
          this.currentMinutes = ((this.currentMinutes % 1440) + 1440) % 1440;
          this.simDate = new Date(this.simDate.getTime() - days * 86400000);
        }
      }
    }

    this.frameCounter++;

    // ===== Phase 1 전략 1: 시간 기반 더티 플래그 =====
    // 천문 상태가 실제로 변한 경우에만 updateSky() 풀 재계산
    // 3초 해상도(0.05분) — 1x 재생 시 updateSky 호출 60fps → ~0.33fps (180배 감소)
    const skyKey = Math.floor(this.currentMinutes * 20);

    if (skyKey !== this.lastSkyKey) {
      this.lastSkyKey = skyKey;
      // perfMode에서는 추가로 15프레임 스킵
      if (!this.isPerfMode || this.frameCounter % 15 === 0) {
        this.updateSky();
      }
    } else {
      // 천문 상태 불변 → 구름 캐시만 출력 (Temporal Reprojection)
      this.cloudRenderer?.renderCached();
    }

    this.rafId = requestAnimationFrame(this._boundLoop);
  }
}
