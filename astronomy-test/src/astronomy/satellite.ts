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
  spawnSatellite: (isStarlink?: boolean, force?: boolean) => void;
  tick: (timestamp: number) => void;
}

export class SatelliteManager implements SatelliteController {
  private satLayer: HTMLElement;
  private isPerfModeFn: () => boolean;
  private getCurrentMinutesFn?: () => number;
  private getDateFn?: () => Date;

  private satellites: SatelliteInstance[] = [];
  private timeouts = new Set<number>();
  private isStopped = false;

  constructor(
    satLayer: HTMLElement,
    isPerfModeFn: () => boolean,
    getCurrentMinutesFn?: () => number,
    getDateFn?: () => Date
  ) {
    this.satLayer = satLayer;
    this.isPerfModeFn = isPerfModeFn;
    this.getCurrentMinutesFn = getCurrentMinutesFn;
    this.getDateFn = getDateFn;

    this.startAutoLoops();
  }

  private startAutoLoops() {
    const initialTimeout = window.setTimeout(() => {
      this.timeouts.delete(initialTimeout);
      if (this.isStopped) return;

      const satLoop = () => {
        if (this.isStopped) return;
        this.spawnSatellite(false, false);
        const nextDelay = Math.random() * 45000 + 30000;
        const tid = window.setTimeout(satLoop, nextDelay);
        this.timeouts.add(tid);
      };

      const starlinkLoop = () => {
        if (this.isStopped) return;
        this.spawnSatellite(true, false);
        const nextDelay = Math.random() * 90000 + 60000;
        const tid = window.setTimeout(starlinkLoop, nextDelay);
        this.timeouts.add(tid);
      };

      satLoop();
      starlinkLoop();
    }, 4000);

    this.timeouts.add(initialTimeout);
  }

  public tick(timestamp: number): void {
    if (this.isStopped) return;

    // 뒤에서부터 순회하여 배열 요소 삭제 시 인덱스 문제를 방지
    for (let i = this.satellites.length - 1; i >= 0; i--) {
      const sat = this.satellites[i];
      if (sat.startTime === 0) {
        sat.startTime = timestamp;
      }

      const t = (timestamp - sat.startTime) / sat.duration;

      if (t < 1) {
        const currentT = Math.max(0, t);
        sat.el.style.transform = `translate3d(${sat.sx + (sat.ex - sat.sx) * currentT}vw, ${sat.sy + (sat.ey - sat.sy) * currentT}vh, 0)`;
      } else {
        sat.el.remove();
        this.satellites.splice(i, 1);
      }
    }
  }

  public spawnSatellite(isStarlink = false, force = true): void {
    if (this.isStopped) return;

    if (!force) {
      const now = this.getDateFn ? this.getDateFn() : new Date();
      const manualMinutes = this.getCurrentMinutesFn
        ? this.getCurrentMinutesFn()
        : now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
      const solar = getSunTimes(now);
      const mG = ((manualMinutes % 1440) + 1440) % 1440;
      let tempSunAlt = -1;

      if (mG >= solar.sunrise && mG <= solar.sunset) {
        const prog = (mG - solar.sunrise) / (solar.sunset - solar.sunrise);
        tempSunAlt = Math.sin(prog * Math.PI);
      }
      // 낮 시간에는 인공위성이 보이지 않음
      if (tempSunAlt > 0.05) return;
    }

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

    const duration = Math.random() * 12000 + 18000;
    const isPerfMode = this.isPerfModeFn();
    const count = isStarlink ? (isPerfMode ? 6 : 14) : 1;

    for (let i = 0; i < count; i++) {
      const delay = isStarlink ? i * (500 + Math.random() * 300) : 0;

      const tId = window.setTimeout(() => {
        this.timeouts.delete(tId);
        if (this.isStopped) return;
        const el = document.createElement('div');
        el.className = 'satellite';
        el.style.opacity = (Math.random() * 0.5 + 0.4).toString();
        this.satLayer.appendChild(el);

        this.satellites.push({
          el,
          sx,
          sy,
          ex,
          ey,
          startTime: 0,
          duration,
        });
      }, delay);

      this.timeouts.add(tId);
    }
  }

  public stop(): void {
    this.isStopped = true;
    this.timeouts.forEach((tid) => clearTimeout(tid));
    this.timeouts.clear();

    for (const sat of this.satellites) {
      sat.el.remove();
    }
    this.satellites = [];

    if (this.satLayer) {
      this.satLayer.innerHTML = '';
    }
  }
}

export function setupSatelliteLoops(
  satLayer: HTMLElement,
  isPerfModeFn: () => boolean,
  getCurrentMinutesFn?: () => number,
  getDateFn?: () => Date
): SatelliteController {
  return new SatelliteManager(satLayer, isPerfModeFn, getCurrentMinutesFn, getDateFn);
}
