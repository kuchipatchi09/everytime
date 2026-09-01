import { getSunTimes, calcSunCoords } from '../astronomy/sun';
import { getMoonAge, getMoonPath, calcMoonCoords } from '../astronomy/moon';
import { getSiderealTime, getStarRotation } from '../astronomy/sidereal';
import { calcSkyColors, calcTwilight } from '../astronomy/sky';
import { setupSatelliteLoops, type SatelliteController } from '../astronomy/satellite';
import type { FlareElements } from '../astronomy/types';
import {
  getSavedSkyBg,
  setSavedSkyBg,
  getSavedSkyPerf,
  setSavedSkyPerf,
  getSavedSkyTimeOffset,
  setSavedSkyTimeOffset,
} from '../utils/storage';

export class SkyBackgroundService {
  private container: HTMLElement | null = null;
  private flareEls: FlareElements | null = null;
  private moonCrescentPathEl: SVGPathElement | null = null;
  private skyLayerEl: HTMLElement | null = null;
  private satController: SatelliteController | null = null;

  private rafId: number | null = null;
  private isEnabled: boolean = true;
  private isPerfMode: boolean = false;
  private timeOffset: number = 0; // 시간 단위 오프셋 (-12 ~ +14)
  private isRunning: boolean = false;
  private isPaused: boolean = false;

  private lastZenith: string = '';
  private lastHorizon: string = '';
  private frameCounter: number = -1;

  public init(container: HTMLElement | null): void {
    this.container = container;
    this.isEnabled = getSavedSkyBg();
    this.isPerfMode = getSavedSkyPerf();
    this.timeOffset = getSavedSkyTimeOffset();

    // 탭 비활성화(브라우저 백그라운드) 시 불필요한 루프 일시정지
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
      } else if (this.isEnabled && this.isRunning) {
        this.resume();
      }
    });

    if (this.isEnabled && this.container) {
      this.start();
    }
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  public getIsPerfMode(): boolean {
    return this.isPerfMode;
  }

  public getTimeOffset(): number {
    return this.timeOffset;
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


  /**
   * 하늘 배경 시뮬레이션 시작 (DOM 생성, RAF 루프 가동, 위성 스케줄러 등록)
   */
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

    const satLayer = this.container.querySelector<HTMLElement>('#satLayer');
    if (satLayer) {
      this.satController = setupSatelliteLoops(satLayer, () => this.isPerfMode);
    }

    this.isRunning = true;
    this.isPaused = false;
    this.frameCounter = -1;

    // 첫 프레임 즉각 동기 렌더링 (깜빡임/지연 방지)
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + this.timeOffset * 60;
    const simDate = new Date(now.getTime() + this.timeOffset * 3600000);
    this.updateSky(currentMinutes, simDate);

    this.rafId = requestAnimationFrame(this.loop.bind(this));
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

    // 2. 인공위성 타이머 및 애니메이션 완전 해제
    if (this.satController) {
      this.satController.stop();
      this.satController = null;
    }

    // 3. body 클래스 제거
    document.body.classList.remove('sky-bg-active');
    document.body.classList.remove('perf-active');

    // 4. DOM 완전 정리
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
    if (!this.isEnabled) return;
    if (!this.isRunning) {
      this.start();
      return;
    }
    if (!this.isPaused) return;

    this.isPaused = false;
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(this.loop.bind(this));
    }
  }

  public toggle(enabled: boolean): void {
    this.isEnabled = enabled;
    setSavedSkyBg(enabled);

    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  public setPerfMode(enabled: boolean): void {
    this.isPerfMode = enabled;
    setSavedSkyPerf(enabled);

    if (enabled) {
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
      <div class="lens-flare-container" id="sunFlareCont">
        <div class="sun-streak"></div>
        <div class="flare-ghost flare-halo" id="h-1" style="width: 60vmax; height: 60vmax;"></div>
        <div class="flare-ghost ghost-rainbow" id="r-1" style="width: 500px; height: 500px;"></div>
        <div class="flare-ghost ghost-hex" id="g-1" style="width: 100px; height: 100px;"></div>
        <div class="flare-ghost ghost-hex" id="g-2" style="width: 50px; height: 50px; background: rgba(150, 255, 200, 0.12);"></div>
        <div class="flare-ghost ghost-tiny" id="t-1" style="width: 10px; height: 10px; background: #fff; box-shadow: 0 0 10px #fff;"></div>
      </div>
      <div class="moon-flare-container" id="moonFlareCont">
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

  private updateOptics(dx: number, dy: number, alt: number, isMoon = false, moonGlowFactor = 1): void {
    if (!this.flareEls) return;
    const cont = isMoon ? this.flareEls.moonFC : this.flareEls.sunFC;
    if (!cont) return;

    const fadeStart = 0;
    const visibleRange = 0.3;
    const rawOpacity = (alt - fadeStart) / visibleRange;
    const finalOpacity = Math.max(0, Math.min(1, rawOpacity));

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
    const { zenith, horizon, brightness } = calcSkyColors(mG, solar);

    const earthshineOpacity = Math.max(0, Math.min(1, 1 - (brightness - 21.67) / 8));
    const moonAuraOpacity = Math.max(0, Math.min(1, 1 - (brightness - 21.67) / 15));
    root.setProperty('--moon-earthshine-opacity', earthshineOpacity.toString());
    root.setProperty('--moon-aura-opacity', moonAuraOpacity.toString());

    if (brightness > 30) {
      root.setProperty('--moon-crescent-glow', 'none');
    } else {
      root.setProperty(
        '--moon-crescent-glow',
        'drop-shadow(0 0 5px rgba(255, 245, 220, 0.85)) drop-shadow(0 0 15px rgba(200, 225, 255, 0.4))'
      );
    }

    if (zenith !== this.lastZenith || horizon !== this.lastHorizon) {
      if (this.skyLayerEl) {
        this.skyLayerEl.style.background = `linear-gradient(to bottom, ${zenith} 0%, ${horizon} 100%)`;
      }
      root.setProperty('--sky-zenith', zenith);
      root.setProperty('--sky-horizon', horizon);
      this.lastZenith = zenith;
      this.lastHorizon = horizon;
    }

    // 1. 태양 좌표 및 렌더링
    const sunCoords = calcSunCoords(mG, solar);
    const sunOpacity = Math.max(0, Math.min(1, (sunCoords.altitude - -2) / 7));
    root.setProperty('--sun-opacity', sunOpacity.toString());

    if (sunCoords.altitude >= -2.0) {
      root.setProperty('--sun-x', sunCoords.x);
      root.setProperty('--sun-y', sunCoords.y);

      const maxAltFactor = solar.maxAlt / 90;
      const normalizedAlt = Math.max(0, sunCoords.altitude / 90);
      root.setProperty(
        '--atm-opacity',
        Math.max(0, Math.min(0.85, (normalizedAlt / maxAltFactor) * 1.2)).toString()
      );

      this.updateOptics(sunCoords.dx, sunCoords.dy, sunCoords.altitude, false);
    } else {
      root.setProperty('--sun-y', '150vh');
      root.setProperty('--atm-opacity', '0');
      if (this.flareEls?.sunFC) this.flareEls.sunFC.style.opacity = '0';
    }

    // 2. 달 좌표 및 렌더링
    const moonAge = getMoonAge(simDate);
    const { coords: moonCoords } = calcMoonCoords(mG, solar, moonAge);

    const moonOpacity = Math.max(0, Math.min(1, (moonCoords.altitude - -2) / 7));
    root.setProperty('--moon-opacity', moonOpacity.toString());

    if (moonCoords.altitude >= -2.0) {
      root.setProperty('--moon-x', moonCoords.x);
      root.setProperty('--moon-y', moonCoords.y);

      const moonPath = getMoonPath(moonAge);
      if (this.moonCrescentPathEl) {
        this.moonCrescentPathEl.setAttribute('d', moonPath);
      }

      const moonGlowFactor = Math.max(0, Math.min(1, 1 - (brightness - 21.67) / 20));
      this.updateOptics(moonCoords.dx, moonCoords.dy, moonCoords.altitude, true, moonGlowFactor * moonOpacity);
    } else {
      root.setProperty('--moon-y', '150vh');
      if (this.flareEls?.moonFC) this.flareEls.moonFC.style.opacity = '0';
    }

    // 3. 밤하늘 은하수 / 황혼 페이딩
    const { starOpacity, starMaskY } = calcTwilight(mG, solar);
    const lst = getSiderealTime(simDate);
    const starRot = getStarRotation(lst);

    root.setProperty('--star-opacity', starOpacity.toString());
    root.setProperty('--star-mask-y', `${starMaskY}%`);
    root.setProperty('--star-rot', `${starRot}deg`);
  }

  private loop(): void {
    if (!this.isRunning || this.isPaused) return;

    this.frameCounter++;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + this.timeOffset * 60;
    const simDate = new Date(now.getTime() + this.timeOffset * 3600000);

    // 저사양 모드 시 15프레임마다 연산, 일반 모드 시 매 프레임 연산
    if (!this.isPerfMode || this.frameCounter % 15 === 0) {
      this.updateSky(currentMinutes, simDate);
    }

    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }

}

export const skyBackgroundService = new SkyBackgroundService();
