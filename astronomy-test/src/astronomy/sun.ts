import { LAT, LON } from './constants';
import type { SunTimes, ScreenCoords } from './types';

export function getSunTimes(date: Date, lat = LAT, lon = LON): SunTimes {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
  const rad = Math.PI / 180;
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1);
  const eqtime = 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) -
    0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) -
    0.040849 * Math.sin(2 * gamma)
  );

  // 태양 적위 (declination)
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma);
  const cosHa = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) -
    Math.tan(lat * rad) * Math.tan(decl);

  let ha = 90;
  if (cosHa >= 1) {
    ha = 0; // 극야 (해 안 뜸)
  } else if (cosHa <= -1) {
    ha = 180; // 백야 (해 안 짐)
  } else {
    ha = Math.acos(cosHa) / rad;
  }

  // 태양의 최대 남중고도
  const maxAlt = 90 - lat + (decl / rad);

  return {
    sunrise: 720 - 4 * (lon + ha) - eqtime + 540,
    sunset: 720 - 4 * (lon - ha) - eqtime + 540,
    solarNoon: 720 - 4 * lon - eqtime + 540,
    maxAlt,
    declDeg: decl / rad,
  };
}

export function calcSunCoords(mG: number, solar: SunTimes): ScreenCoords {
  const dayLength = solar.sunset - solar.sunrise;
  const sunT = dayLength > 0 ? (mG - solar.sunrise) / dayLength : 0; // 0 (sunrise) to 1 (sunset)

  let sunCoords: ScreenCoords = { x: '0vw', y: '150vh', dx: 0, dy: 100, altitude: -10 };

  if (mG >= solar.sunrise - 20 && mG <= solar.sunset + 20) {
    const progAngle = (sunT * 2 - 1) * 90; // -90 to +90 degrees
    const rad = (progAngle * Math.PI) / 180;

    const dx = 38 * Math.sin(rad);
    const maxAlt = solar.maxAlt;
    const R_y = 25 + maxAlt * 0.45;
    const dy = 25 - R_y * Math.cos(rad);
    const alt = (25 - dy) / 0.62;

    sunCoords = {
      x: `calc(50vw + ${dx}vmax)`,
      y: `calc(50vh + ${dy}vmax)`,
      dx,
      dy,
      altitude: alt,
    };
  }

  return sunCoords;
}
