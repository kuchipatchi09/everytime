import type { SunTimes } from './types';

interface SkyKeyframe {
  m: number;
  z: [number, number, number];
  hz: [number, number, number];
}

export function calcSkyColors(mG: number, solar: SunTimes): {
  zenith: string;
  horizon: string;
  zenithRgb: [number, number, number];
  horizonRgb: [number, number, number];
  brightness: number;
  colors: number[];
} {
  const solarNoon = (solar.sunrise + solar.sunset) / 2;

  const kf: SkyKeyframe[] = [
    // 심야 (Deep Astronomical Night) - 맑고 깊은 칠흑 남색
    { m: -1440, z: [4, 8, 22], hz: [8, 14, 30] },
    // 여명 시작 (Astro dawn: 일출 90분 전)
    { m: solar.sunrise - 90, z: [4, 8, 22], hz: [8, 14, 30] },
    // 항해박명 (Nautical dawn: 일출 50분 전) - 보랏빛 라벤더 지평선
    { m: solar.sunrise - 50, z: [10, 18, 52], hz: [48, 30, 68] },
    // 시민박명 (Civil dawn: 일출 25분 전) - 찬란한 살구빛/장미빛 노을과 깊은 로열블루 천정
    { m: solar.sunrise - 25, z: [25, 52, 122], hz: [242, 108, 86] },
    // 일출 (Sunrise: 태양이 지평선에 걸친 순간) - 눈부신 황금빛 살구 지평선 & 청명한 스카이블루
    { m: solar.sunrise, z: [35, 90, 180], hz: [255, 175, 80] },
    // 아침 골든아워 (Golden Morning: 일출 40분 후) - 화사하고 청명한 아침 하늘
    { m: solar.sunrise + 40, z: [22, 95, 205], hz: [200, 235, 255] },
    // 한낮 (Solar Noon) - 청명하고 깊은 사파이어 블루 천정과 눈부신 시안 지평선
    { m: solarNoon, z: [14, 85, 215], hz: [165, 225, 255] },
    // 늦은 오후 (Late Afternoon: 일몰 50분 전) - 청명한 하늘빛 유지
    { m: solar.sunset - 50, z: [18, 80, 205], hz: [185, 225, 255] },
    // 골든아워 일몰 (Sunset: 태양이 지평선에 닿는 순간) - 타오르는 듯한 진홍/주황빛 노을 & 로열 인디고 천정
    { m: solar.sunset, z: [22, 45, 125], hz: [255, 115, 45] },
    // 매직아워 황혼 (Civil Dusk: 일몰 20분 후) - 진한 장미빛 자색과 벨벳 바이올렛
    { m: solar.sunset + 20, z: [16, 22, 75], hz: [175, 55, 85] },
    // 항해박명 황혼 (Nautical Dusk: 일몰 45분 후) - 어스름한 보랏빛 지평선
    { m: solar.sunset + 45, z: [9, 14, 45], hz: [42, 26, 60] },
    // 밤 진입 (Astro Dusk: 일몰 75분 후)
    { m: solar.sunset + 75, z: [4, 8, 22], hz: [8, 14, 30] },
    // 심야 끝
    { m: 1440, z: [4, 8, 22], hz: [8, 14, 30] },
  ];

  let r = 8, g = 14, b = 30;
  let zr = 4, zg = 8, zb = 22;
  let zenith = 'rgb(4, 8, 22)';
  let horizon = 'rgb(8, 14, 30)';
  let brightness = 15;

  for (let i = 0; i < kf.length - 1; i++) {
    if (mG >= kf[i].m && mG < kf[i + 1].m) {
      const t = (mG - kf[i].m) / (kf[i + 1].m - kf[i].m);
      const l = (c1: number, c2: number) => c1 + (c2 - c1) * t;
      r = Math.round(l(kf[i].hz[0], kf[i + 1].hz[0]));
      g = Math.round(l(kf[i].hz[1], kf[i + 1].hz[1]));
      b = Math.round(l(kf[i].hz[2], kf[i + 1].hz[2]));
      zr = Math.round(l(kf[i].z[0], kf[i + 1].z[0]));
      zg = Math.round(l(kf[i].z[1], kf[i + 1].z[1]));
      zb = Math.round(l(kf[i].z[2], kf[i + 1].z[2]));
      zenith = `rgb(${zr}, ${zg}, ${zb})`;
      horizon = `rgb(${r}, ${g}, ${b})`;
      brightness = (r + g + b) / 3;
      break;
    }
  }

  let tContrast = Math.min(1, Math.max(0, (brightness - 22) / 200));
  if (tContrast < 0.5) tContrast *= 0.5;
  if (tContrast > 0.5) tContrast = tContrast * 0.5 + 0.5;

  const dark_colors = [20, 25, 35, 0.65, 255, 255, 255, 255, 255, 255, 0x90, 0xca, 0xf9, 0x00, 0x33, 0x54, 255, 0.1];
  const bright_colors = [235, 245, 255, 0.45, 0, 20, 40, 0, 20, 50, 0x00, 0x7a, 0xff, 0xfa, 0xfa, 0xfa, 55, 0.2];
  const colors = dark_colors.map((e, i) => e * (1 - tContrast) + bright_colors[i] * tContrast);

  return {
    zenith,
    horizon,
    zenithRgb: [zr, zg, zb],
    horizonRgb: [r, g, b],
    brightness,
    colors,
  };
}

export function calcTwilight(mG: number, solar: SunTimes): { starOpacity: number; starMaskY: number } {
  let sOp = 0;
  let sMaskY = -50;
  const twilightDuration = 50;

  if (mG >= solar.sunset - 5 && mG <= solar.sunset - 5 + twilightDuration) {
    // 일몰 직전부터 황혼: 서서히 별들이 나타나기 시작
    sOp = (mG - (solar.sunset - 5)) / twilightDuration;
    sMaskY = -50 + (200 * sOp);
  } else if (mG >= solar.sunrise + 5 - twilightDuration && mG <= solar.sunrise + 5) {
    // 일출 직후까지 새벽: 별들이 사라짐
    sOp = 1 - (mG - (solar.sunrise + 5 - twilightDuration)) / twilightDuration;
    sMaskY = -50 + (200 * sOp);
  } else if (mG > solar.sunset - 5 + twilightDuration || mG < solar.sunrise + 5 - twilightDuration) {
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
