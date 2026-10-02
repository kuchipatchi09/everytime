import { LAT, SYNODIC_MONTH } from './constants';
import type { SunTimes, ScreenCoords } from './types';

// 실제 날짜 기준의 달의 위상 계산 엔진 (New Moon Epoch: 2000-01-06 18:14 UTC)
export function getMoonAge(date: Date): number {
  const time = date.getTime();
  const jd = (time / 86400000) + 2440587.5;
  let age = (jd - 2451550.26) % SYNODIC_MONTH;
  if (age < 0) age += SYNODIC_MONTH;
  return age;
}

/**
 * 기준일(baseDate)로부터 가장 가까운 특정 월령(targetAge, 0~29.5일)에
 * 도달하는 정밀한 Date 객체를 역산출합니다.
 */
export function getDateForMoonAge(baseDate: Date, targetAge: number): Date {
  const currentAge = getMoonAge(baseDate);
  let diff = targetAge - currentAge;
  diff = ((diff % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  if (diff > SYNODIC_MONTH / 2) diff -= SYNODIC_MONTH;
  return new Date(baseDate.getTime() + diff * 86400000);
}

// 달의 황도상 위상을 수학적 SVG Path 데이터로 변환하는 생성기
export function getMoonPath(age: number): string {
  const r = 16;
  const phase = (((age % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH) / SYNODIC_MONTH; // 0 to 1

  // 삭 (신월): 완전히 보이지 않음 (0.015 = 약 10시간 이내)
  if (phase < 0.015 || phase > 0.985) {
    return 'M 0 0';
  }

  // 만월 (보름달): 완전한 원형 (0.485 ~ 0.515)
  if (Math.abs(phase - 0.5) < 0.015) {
    return 'M 16 0 A 16 16 0 1 1 15.99 0 Z';
  }

  const rx = Math.abs(Math.cos(phase * 2 * Math.PI)) * r;
  const rxStr = rx.toFixed(2);
  const sweep2 = (phase < 0.25 || phase >= 0.75) ? 0 : 1;

  if (phase < 0.5) {
    // Waxing Moon (오른쪽이 차오름: 초승달, 상현달, 차오르는달)
    return `M 16 0 A 16 16 0 0 1 16 32 A ${rxStr} 16 0 0 ${sweep2} 16 0 Z`;
  } else {
    // Waning Moon (왼쪽이 차오름: 이지러지는달, 하현달, 그믐달)
    return `M 16 0 A ${rxStr} 16 0 0 ${sweep2} 16 32 A 16 16 0 0 1 16 0 Z`;
  }
}

export function getMoonPhaseName(age: number): { name: string; icon: string; percent: number } {
  const phase = (((age % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH) / SYNODIC_MONTH; // 0 to 1
  const percent = Math.round(((1 - Math.cos(phase * 2 * Math.PI)) / 2) * 100);

  if (phase < 0.03 || phase >= 0.97) return { name: '삭 (신월, New Moon)', icon: '🌑', percent };
  if (phase < 0.22) return { name: '초승달 (Waxing Crescent)', icon: '🌒', percent };
  if (phase < 0.28) return { name: '상현달 (First Quarter)', icon: '🌓', percent };
  if (phase < 0.47) return { name: '차오르는 달 (Waxing Gibbous)', icon: '🌔', percent };
  if (phase < 0.53) return { name: '보름달 (만월, Full Moon)', icon: '🌕', percent };
  if (phase < 0.72) return { name: '이지러지는 달 (Waning Gibbous)', icon: '🌖', percent };
  if (phase < 0.78) return { name: '하현달 (Last Quarter)', icon: '🌗', percent };
  return { name: '그믐달 (Waning Crescent)', icon: '🌘', percent };
}

export function calcMoonCoords(
  mG: number,
  solar: SunTimes,
  moonAge: number,
  lat = LAT
): { coords: ScreenCoords; haMoon: number; elongation: number } {
  const elongation = (moonAge / SYNODIC_MONTH) * 360;

  // 태양의 24시간 연속 시간각 계산 (태양 남중 기준, 1440분 = 360도 연속 회전)
  const solarNoon = (solar.sunrise + solar.sunset) / 2;
  let haSun = ((mG - solarNoon) * 0.25) % 360;
  haSun = ((haSun + 180) % 360 + 360) % 360 - 180;

  // 달의 시간각 (Hour Angle): 태양의 연속 시간각에서 이각(elongation)을 차감
  let haMoon = haSun - elongation;
  haMoon = ((haMoon + 180) % 360 + 360) % 360 - 180; // 범위 [-180, 180] 보정

  let moonCoords: ScreenCoords = { x: '0vw', y: '150vh', dx: 0, dy: 100, altitude: -10 };

  if (haMoon >= -105 && haMoon <= 105) {
    const rad = (haMoon * Math.PI) / 180;

    const dx = 38 * Math.sin(rad);
    // 황도상 달의 위치에 따른 적위 및 남중고도 계산 (보름달은 태양 반대 적위, 신월은 태양과 같은 적위)
    const moonDeclDeg = -solar.declDeg * Math.cos((elongation * Math.PI) / 180);
    const moonMaxAlt = Math.max(15, Math.min(80, 90 - lat + moonDeclDeg));
    const R_y = 25 + moonMaxAlt * 0.45;
    const dy = 25 - R_y * Math.cos(rad);
    const alt = (25 - dy) / 0.62;

    moonCoords = {
      x: `calc(50vw + ${dx}vmax)`,
      y: `calc(50vh + ${dy}vmax)`,
      dx,
      dy,
      altitude: alt,
    };
  }

  return { coords: moonCoords, haMoon, elongation };
}
