export type CloudGenera =
  | 'clear'
  | 'contrail'
  | 'cirrus'
  | 'cirrocumulus'
  | 'cirrostratus'
  | 'cumulus-humilis'
  | 'cumulus-mediocris'
  | 'altocumulus'
  | 'altostratus'
  | 'cumulus-congestus'
  | 'stratocumulus'
  | 'stratus'
  | 'nimbostratus'
  | 'cumulonimbus';

export interface CloudStageProfile {
  id: number; // 0 ~ 20
  name: string;
  nameEn: string;
  genera: CloudGenera;
  description: string;

  // WebGL 셰이더 파라미터
  coverage: number;       // 0 ~ 1.0 운량 컷오프
  density: number;        // 0 ~ 1.0 구름 층 농도
  cloudType: number;      // 0.0: 권운(새털) ~ 0.5: 뭉게구름(Cumulus) ~ 1.0: 층운/비구름
  puffiness: number;      // 0 ~ 1.0 뭉게구름 볼록도 (Worley 비중)
  darkBase: number;       // 0 ~ 1.0 밑면 음영 농도
  mieIntensity: number;   // 0 ~ 1.0 실버 라이닝(전방 산란) 강도
  haloStrength: number;   // 0 ~ 1.0 22° 무리(Halo) 효과 강도
  ambientDull: number;    // 0 ~ 1.0 흐린 날 무광택 회색조 감쇠

  // 천체 차폐율 (0 = 완전 투과, 1 = 완전 차단)
  sunOcclusion: number;
  moonOcclusion: number;
  starOcclusion: number;
}

export interface CloudLightingContext {
  sunAlt: number;
  sunDir: [number, number, number]; // 3D 정규화 벡터
  sunVisible: boolean;
  moonAlt: number;
  moonDir: [number, number, number]; // 3D 정규화 벡터
  moonVisible: boolean;
  moonPhaseAge: number; // 0 ~ 29.53
  zenithColor: [number, number, number]; // 0 ~ 1 RGB
  horizonColor: [number, number, number]; // 0 ~ 1 RGB
  ambientBrightness: number;
}
