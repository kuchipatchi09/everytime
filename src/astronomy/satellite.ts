import { getSunTimes } from './sun';

interface SatelliteInstance {
  el: HTMLElement;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  startTime: number;
  duration: number;
}

export interface SatelliteController {
  stop: () => void;
  pause: () => void;
  resume: () => void;
  hasActive: () => boolean;
}

/**
 * 단일 rAF 루프와 Set 기반 타이머로 메모리 누수 없이 인공위성/스타링크 통과를 제어합니다.
 * 비행 중인 위성이 없으면 rAF를 가동하지 않습니다.
 */
class SatelliteManager implements SatelliteController {
  private satLayer: HTMLElement;
  private isPerfModeFn: () => boolean;
  private onActiveChange?: (active: boolean) => void;

  private satellites: SatelliteInstance[] = [];
  private timeouts = new Set<number>();
  private rafId: number | null = null;
  private isStopped = false;
  private isPaused = false;
  private pauseStartedAt = 0;
  private readonly _boundTick: (ts: number) => void;

  constructor(
    satLayer: HTMLElement,
    isPerfModeFn: () => boolean,
    onActiveChange?: (active: boolean) => void
  ) {
    this.satLayer = satLayer;
    this.isPerfModeFn = isPerfModeFn;
    this.onActiveChange = onActiveChange;
    this._boundTick = this.tick.bind(this);

    this.scheduleInitial();
  }

  private scheduleInitial(): void {
    const initialTimeout = window.setTimeout(() => {
      this.timeouts.delete(initialTimeout);
      if (this.isStopped) return;

      const satLoop = () => {
        if (this.isStopped) return;
        if (!this.isPaused) {
          this.animateObject(false);
        }
        const nextDelay = Math.random() * 60000 + 40000;
        const tid = window.setTimeout(satLoop, nextDelay);
        this.timeouts.add(tid);
      };

      const starlinkLoop = () => {
        if (this.isStopped) return;
        if (!this.isPaused) {
          this.animateObject(true);
        }
        const nextDelay = Math.random() * 120000 + 120000;
        const tid = window.setTimeout(starlinkLoop, nextDelay);
        this.timeouts.add(tid);
      };

      satLoop();
      starlinkLoop();
    }, 4000);

    this.timeouts.add(initialTimeout);
  }

  private ensureLoopRunning(): void {
    if (this.isStopped || this.isPaused) return;
    if (this.rafId === null && this.satellites.length > 0) {
      this.rafId = requestAnimationFrame(this._boundTick);
    }
  }

  private tick(timestamp: number): void {
    this.rafId = null;
    if (this.isStopped || this.isPaused) return;

    for (let i = this.satellites.length - 1; i >= 0; i--) {
      const sat = this.satellites[i];
      if (sat.startTime === 0) {
        sat.startTime = timestamp;
      }

      const t = (timestamp - sat.startTime) / sat.duration;
      if (t < 1) {
        const currentT = Math.max(0, t);
        const x = (sat.sx + (sat.ex - sat.sx) * currentT).toFixed(3);
        const y = (sat.sy + (sat.ey - sat.sy) * currentT).toFixed(3);
        sat.el.style.transform = `translate3d(${x}vw, ${y}vh, 0)`;
      } else {
        sat.el.remove();
        this.satellites.splice(i, 1);
      }
    }

    if (this.satellites.length > 0) {
      this.rafId = requestAnimationFrame(this._boundTick);
    } else {
      this.onActiveChange?.(false);
    }
  }

  private animateObject(isStarlink = false): void {
    if (this.isStopped || this.isPaused) return;

    const now = new Date();
    const manualMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const solar = getSunTimes(now);
    const mG = ((manualMinutes % 1440) + 1440) % 1440;
    let tempSunAlt = -1;

    if (mG >= solar.sunrise && mG <= solar.sunset) {
      const prog = (mG - solar.sunrise) / (solar.sunset - solar.sunrise);
      tempSunAlt = Math.sin(prog * Math.PI);
    }
    // 낮 시간에는 인공위성이 보이지 않음
    if (tempSunAlt > 0.05) return;

    const side = Math.floor(Math.random() * 4);
    let sx = 0, sy = 0, ex = 0, ey = 0;
    if (side === 0) {
      sx = -15; sy = Math.random() * 100; ex = 115; ey = Math.random() * 100;
    } else if (side === 1) {
      sx = 115; sy = Math.random() * 100; ex = -15; ey = Math.random() * 100;
    } else if (side === 2) {
      sx = Math.random() * 100; sy = -15; ex = Math.random() * 100; ey = 115;
    } else {
      sx = Math.random() * 100; sy = 115; ex = Math.random() * 100; ey = -15;
    }

    const duration = Math.random() * 20000 + 40000;
    const isPerfMode = this.isPerfModeFn();
    const count = isStarlink ? (isPerfMode ? 6 : 14) : 1;

    for (let i = 0; i < count; i++) {
      const delay = isStarlink ? i * (700 + Math.random() * 400) : 0;

      const tId = window.setTimeout(() => {
        this.timeouts.delete(tId);
        if (this.isStopped || this.isPaused) return;

        const wasEmpty = this.satellites.length === 0;
        const sat = document.createElement('div');
        sat.className = 'satellite';
        sat.style.opacity = (Math.random() * 0.5 + 0.3).toFixed(3);
        sat.style.transform = `translate3d(${sx.toFixed(3)}vw, ${sy.toFixed(3)}vh, 0)`;
        this.satLayer.appendChild(sat);

        this.satellites.push({
          el: sat,
          sx,
          sy,
          ex,
          ey,
          startTime: 0,
          duration,
        });

        if (wasEmpty) {
          this.onActiveChange?.(true);
        }
        this.ensureLoopRunning();
      }, delay);

      this.timeouts.add(tId);
    }
  }

  public hasActive(): boolean {
    return this.satellites.length > 0;
  }

  public pause(): void {
    if (this.isStopped || this.isPaused) return;
    this.isPaused = true;
    this.pauseStartedAt = performance.now();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public resume(): void {
    if (this.isStopped || !this.isPaused) return;
    this.isPaused = false;
    const pausedMs = performance.now() - this.pauseStartedAt;
    if (pausedMs > 0) {
      for (const sat of this.satellites) {
        if (sat.startTime > 0) {
          sat.startTime += pausedMs;
        }
      }
    }
    this.ensureLoopRunning();
  }

  public stop(): void {
    this.isStopped = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.timeouts.forEach((tid) => clearTimeout(tid));
    this.timeouts.clear();
    for (const sat of this.satellites) {
      sat.el.remove();
    }
    this.satellites.length = 0;
    if (this.satLayer) {
      this.satLayer.innerHTML = '';
    }
    this.onActiveChange?.(false);
  }
}

export function setupSatelliteLoops(
  satLayer: HTMLElement,
  isPerfModeFn: () => boolean,
  onActiveChange?: (active: boolean) => void
): SatelliteController {
  return new SatelliteManager(satLayer, isPerfModeFn, onActiveChange);
}
