import type { CloudStageProfile } from './types';

/**
 * 5단계 기상 표준 (WMO / OpenWeatherMap Cloud Condition Code)
 * 800: 맑음 (Clear) - 운량 0%
 * 801: 구름 조금 (Few clouds) - 운량 11 ~ 25%
 * 802: 조각구름 (Scattered clouds) - 운량 25 ~ 50%
 * 803: 구름 많음 (Broken clouds) - 운량 51 ~ 84%
 * 804: 흐림 (Overcast clouds) - 운량 85 ~ 100%
 */
export const CLOUD_STAGES: CloudStageProfile[] = [
  {
    id: 800,
    name: '맑음 (구름 없음)',
    nameEn: 'Clear Sky',
    genera: 'clear',
    description: '구름이 전혀 없는 맑고 쾌청한 하늘. 별빛과 은하수가 100% 선명하게 보입니다 (운량 0%).',
    coverage: 0,
    density: 0,
    cloudType: 0,
    puffiness: 0,
    darkBase: 0,
    mieIntensity: 0,
    haloStrength: 0,
    ambientDull: 0,
    sunOcclusion: 0,
    moonOcclusion: 0,
    starOcclusion: 0,
  },
  {
    id: 801,
    name: '구름 조금 (새털/조각적운)',
    nameEn: 'Few Clouds',
    genera: 'cirrus',
    description: '맑은 하늘에 가늘게 흐르는 명주실 새털구름과 작은 조각 적운 (운량 11 ~ 25%).',
    coverage: 0.18,
    density: 0.65,
    cloudType: 0.18,
    puffiness: 0.50,
    darkBase: 0.15,
    mieIntensity: 0.80,
    haloStrength: 0.25,
    ambientDull: 0,
    sunOcclusion: 0.12,
    moonOcclusion: 0.08,
    starOcclusion: 0.18,
  },
  {
    id: 802,
    name: '조각구름 (전형적 뭉게구름)',
    nameEn: 'Scattered Clouds',
    genera: 'cumulus-mediocris',
    description: '푸른 하늘 아래 솜사탕처럼 피어오른 전형적인 볼륨감 넘치는 흰 뭉게구름 (운량 25 ~ 50%).',
    coverage: 0.38,
    density: 0.88,
    cloudType: 0.50,
    puffiness: 0.88,
    darkBase: 0.32,
    mieIntensity: 0.95,
    haloStrength: 0,
    ambientDull: 0,
    sunOcclusion: 0.38,
    moonOcclusion: 0.32,
    starOcclusion: 0.42,
  },
  {
    id: 803,
    name: '구름 많음 (웅대적운 성채)',
    nameEn: 'Broken Clouds',
    genera: 'cumulus-congestus',
    description: '하늘의 절반 이상을 덮는 웅장한 흰 구름 성채와 틈새로 비치는 푸른 하늘 (운량 51 ~ 84%).',
    coverage: 0.68,
    density: 0.94,
    cloudType: 0.68,
    puffiness: 0.95,
    darkBase: 0.48,
    mieIntensity: 1.15,
    haloStrength: 0,
    ambientDull: 0.06,
    sunOcclusion: 0.70,
    moonOcclusion: 0.65,
    starOcclusion: 0.78,
  },
  {
    id: 804,
    name: '흐림 (온통 흐린 층운)',
    nameEn: 'Overcast Clouds',
    genera: 'stratus',
    description: '천구를 뒤덮은 묵직한 구름 장막. 입체적인 파도 구름 굴곡과 은은한 태양 광륜이 살아있습니다 (운량 85 ~ 100%).',
    coverage: 0.95,
    density: 0.98,
    cloudType: 0.88,
    puffiness: 0.65,
    darkBase: 0.55,
    mieIntensity: 0.35,
    haloStrength: 0,
    ambientDull: 0.20,
    sunOcclusion: 0.98,
    moonOcclusion: 0.96,
    starOcclusion: 1.0,
  },
];

/**
 * 800 ~ 804 단계 간의 부드러운 연속 선형 보간 함수
 * (예: 801.5 입력 시 801과 802의 중간 물리 상태 계산)
 */
export function getInterpolatedCloudStage(level: number): CloudStageProfile {
  let norm = level;
  if (norm < 800) {
    if (norm <= 4) norm = norm + 800;
    else if (norm <= 20) norm = 800 + (norm / 20) * 4;
  }
  const clamped = Math.max(800, Math.min(804, norm));
  const offset = clamped - 800; // 0.0 ~ 4.0
  const baseIdx = Math.min(3, Math.floor(offset));
  const nextIdx = Math.min(4, baseIdx + 1);
  const t = offset - baseIdx;

  const s0 = CLOUD_STAGES[baseIdx];
  const s1 = CLOUD_STAGES[nextIdx];

  const lerp = (a: number, b: number) => a + (b - a) * t;

  return {
    id: Math.round(clamped * 100) / 100,
    name: t < 0.5 ? s0.name : s1.name,
    nameEn: t < 0.5 ? s0.nameEn : s1.nameEn,
    genera: t < 0.5 ? s0.genera : s1.genera,
    description: t < 0.5 ? s0.description : s1.description,
    coverage: lerp(s0.coverage, s1.coverage),
    density: lerp(s0.density, s1.density),
    cloudType: lerp(s0.cloudType, s1.cloudType),
    puffiness: lerp(s0.puffiness, s1.puffiness),
    darkBase: lerp(s0.darkBase, s1.darkBase),
    mieIntensity: lerp(s0.mieIntensity, s1.mieIntensity),
    haloStrength: lerp(s0.haloStrength, s1.haloStrength),
    ambientDull: lerp(s0.ambientDull, s1.ambientDull),
    sunOcclusion: lerp(s0.sunOcclusion, s1.sunOcclusion),
    moonOcclusion: lerp(s0.moonOcclusion, s1.moonOcclusion),
    starOcclusion: lerp(s0.starOcclusion, s1.starOcclusion),
  };
}
