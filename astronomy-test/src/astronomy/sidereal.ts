import { LON, J2000_EPOCH_JD } from './constants';

// 한국(충남/서울) 경도 기준 지방항성시(LST) 및 실시간 일주/연주운동 연동 엔진
export function getSiderealTime(simDate: Date, lon = LON): number {
  // Julian Date 계산 (UTC 기준 일수 계산)
  const jd = (simDate.getTime() / 86400000) + 2440587.5;
  const d = jd - J2000_EPOCH_JD; // J2000.0 Epoch 기준 경과 일수

  // 그리니치 평균 항성시(GMST) 계산 (도 단위)
  let gmst = (280.46061837 + 360.98564736629 * d) % 360;
  if (gmst < 0) gmst += 360;

  // 지역 경도를 더해 지방항성시(LST) 계산
  let lst = (gmst + lon) % 360;
  if (lst < 0) lst += 360;

  return lst;
}

// 남향 뷰(지평선 아래 피벗) 기준: LST 증가 시 시계 방향(동->남->서)으로 일주운동
export function getStarRotation(lst: number): number {
  return ((lst + 177) % 360 + 360) % 360;
}
