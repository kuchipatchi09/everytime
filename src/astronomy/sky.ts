import type { SunTimes } from './types';

const KF_Z: ReadonlyArray<readonly [number, number, number]> = [
  [5, 10, 25],
  [5, 10, 25],
  [40, 80, 140],
  [25, 90, 180],
  [25, 90, 180],
  [20, 30, 80],
  [10, 15, 40],
  [5, 10, 25],
  [5, 10, 25],
];

const KF_HZ: ReadonlyArray<readonly [number, number, number]> = [
  [10, 20, 35],
  [10, 20, 35],
  [255, 150, 100],
  [180, 230, 255],
  [180, 230, 255],
  [245, 125, 75],
  [60, 30, 60],
  [10, 20, 35],
  [10, 20, 35],
];

const kfM = [-1440, 0, 0, 0, 0, 0, 0, 0, 1440];

export function calcSkyColors(mG: number, solar: SunTimes): {
  zenith: string;
  horizon: string;
  zenithRgb: [number, number, number];
  horizonRgb: [number, number, number];
  brightness: number;
} {
  kfM[1] = solar.sunrise - 135;
  kfM[2] = solar.sunrise;
  kfM[3] = (solar.sunrise + solar.sunset) / 2;
  kfM[4] = solar.sunset - 135;
  kfM[5] = solar.sunset;
  kfM[6] = solar.sunset + 15;
  kfM[7] = solar.sunset + 30;

  let r = 10, g = 20, b = 35;
  let zr = 5, zg = 10, zb = 25;
  let zenith = 'rgb(5, 10, 25)';
  let horizon = 'rgb(10, 20, 35)';
  let brightness = 15;

  for (let i = 0; i < 8; i++) {
    const m0 = kfM[i];
    const m1 = kfM[i + 1];
    if (mG >= m0 && mG < m1) {
      const t = (mG - m0) / (m1 - m0);
      const z0 = KF_Z[i];
      const z1 = KF_Z[i + 1];
      const hz0 = KF_HZ[i];
      const hz1 = KF_HZ[i + 1];

      r = Math.round(hz0[0] + (hz1[0] - hz0[0]) * t);
      g = Math.round(hz0[1] + (hz1[1] - hz0[1]) * t);
      b = Math.round(hz0[2] + (hz1[2] - hz0[2]) * t);
      zr = Math.round(z0[0] + (z1[0] - z0[0]) * t);
      zg = Math.round(z0[1] + (z1[1] - z0[1]) * t);
      zb = Math.round(z0[2] + (z1[2] - z0[2]) * t);
      zenith = `rgb(${zr}, ${zg}, ${zb})`;
      horizon = `rgb(${r}, ${g}, ${b})`;
      brightness = (r + g + b) / 3;
      break;
    }
  }

  return { zenith, horizon, zenithRgb: [zr, zg, zb], horizonRgb: [r, g, b], brightness };
}

export function calcTwilight(mG: number, solar: SunTimes): { starOpacity: number; starMaskY: number } {
  let sOp = 0;
  let sMaskY = -50;
  const twilightDuration = 45;

  if (mG >= solar.sunset - 15 && mG <= solar.sunset - 15 + twilightDuration) {
    // 일몰 15분 전부터 황혼: 별들이 나타나기 시작
    sOp = (mG - (solar.sunset - 15)) / twilightDuration;
    sMaskY = -50 + (200 * sOp);
  } else if (mG >= solar.sunrise + 15 - twilightDuration && mG <= solar.sunrise + 15) {
    // 일출 15분 후까지 새벽: 별들이 사라짐
    sOp = 1 - (mG - (solar.sunrise + 15 - twilightDuration)) / twilightDuration;
    sMaskY = -50 + (200 * sOp);
  } else if (mG > solar.sunset - 15 + twilightDuration || mG < solar.sunrise + 15 - twilightDuration) {
    // 한밤중/황혼 이후: 별들이 100% 보임
    sOp = 1;
    sMaskY = 150;
  } else {
    // 한낮: 별들이 보이지 않음
    sOp = 0;
    sMaskY = -50;
  }

  return {
    starOpacity: Math.max(0, Math.min(1, sOp)),
    starMaskY: sMaskY,
  };
}
