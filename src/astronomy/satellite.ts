import { getSunTimes } from './sun';

export interface SatelliteController {
  stop: () => void;
}

export function setupSatelliteLoops(
  satLayer: HTMLElement,
  isPerfModeFn: () => boolean
): SatelliteController {
  const timeouts: number[] = [];
  const activeAnimations: number[] = [];
  let isStopped = false;

  function animateObject(isStarlink = false) {
    if (isStopped) return;

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
    const isPerfMode = isPerfModeFn();
    const count = isStarlink ? (isPerfMode ? 6 : 14) : 1;

    for (let i = 0; i < count; i++) {
      const delay = isStarlink ? i * (700 + Math.random() * 400) : 0;

      const tId = window.setTimeout(() => {
        if (isStopped) return;
        const sat = document.createElement('div');
        sat.className = 'satellite';
        sat.style.opacity = (Math.random() * 0.5 + 0.3).toString();
        satLayer.appendChild(sat);

        const startT = performance.now();
        const move = (currentT: number) => {
          if (isStopped) {
            sat.remove();
            return;
          }
          const t = (currentT - startT) / duration;
          if (t < 1) {
            sat.style.transform = `translate3d(${sx + (ex - sx) * t}vw, ${sy + (ey - sy) * t}vh, 0)`;
            const aId = requestAnimationFrame(move);
            activeAnimations.push(aId);
          } else {
            sat.remove();
          }
        };
        const animId = requestAnimationFrame(move);
        activeAnimations.push(animId);
      }, delay);

      timeouts.push(tId);
    }
  }

  const initialTimeout = window.setTimeout(() => {
    if (isStopped) return;

    const satLoop = () => {
      if (isStopped) return;
      animateObject(false);
      const nextDelay = Math.random() * 60000 + 40000;
      const tid = window.setTimeout(satLoop, nextDelay);
      timeouts.push(tid);
    };

    const starlinkLoop = () => {
      if (isStopped) return;
      animateObject(true);
      const nextDelay = Math.random() * 120000 + 120000;
      const tid = window.setTimeout(starlinkLoop, nextDelay);
      timeouts.push(tid);
    };

    satLoop();
    starlinkLoop();
  }, 4000);

  timeouts.push(initialTimeout);

  return {
    stop: () => {
      isStopped = true;
      timeouts.forEach((tid) => clearTimeout(tid));
      activeAnimations.forEach((aid) => cancelAnimationFrame(aid));
      timeouts.length = 0;
      activeAnimations.length = 0;
      if (satLayer) {
        satLayer.innerHTML = '';
      }
    },
  };
}
