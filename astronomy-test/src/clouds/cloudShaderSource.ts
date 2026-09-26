export const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;
varying vec3 v_viewRay;

uniform float u_aspect;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  vec2 ndc = a_position;
  ndc.x *= u_aspect;

  // 꼭짓점에서 시선 벡터 계산 (프래그먼트로 선형 보간하여 왜곡 100% 방지)
  float elevation = max(0.045, v_uv.y * 0.955 + 0.045);
  v_viewRay = vec3(ndc.x * 0.82, elevation, 1.15 - v_uv.y * 0.28);

  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER_SOURCE = `
precision highp float;

varying vec2 v_uv;
varying vec3 v_viewRay;

uniform float u_time;

// 심리스 Perlin-Worley 텍스처 LUT (R: Macro, G: Billow, B: Wispy, A: Curl)
uniform sampler2D u_noiseLut;

// 구름 파라미터 (800 ~ 804 5단계 연동)
uniform float u_coverage;       // 0 ~ 1.0 운량 임계치
uniform float u_density;        // 0 ~ 1.0 구름 농도
uniform float u_cloudType;      // 0.0: 권운, 0.5: 뭉게구름, 1.0: 층운
uniform float u_puffiness;      // 뭉게구름 볼록도
uniform float u_darkBase;       // 밑면 음영 농도
uniform float u_mieIntensity;   // 실버 라이닝(전방 산란) 강도
uniform float u_haloStrength;   // 22° 무리(Halo) 효과
uniform float u_ambientDull;    // 흐린 날 회색조 감쇠 (0 ~ 1.0)

// 광원 (태양 & 달)
uniform vec3 u_sunDir;          // 3D 천구 광원 벡터
uniform vec3 u_sunColor;
uniform float u_sunAlt;
uniform vec3 u_moonDir;
uniform vec3 u_moonColor;
uniform float u_moonAlt;
uniform float u_moonPhase;      // 0 ~ 1.0

// 대기 색상
uniform vec3 u_skyZenith;
uniform vec3 u_skyHorizon;

// 바람 이동 오프셋
uniform vec2 u_windOffsetHigh;
uniform vec2 u_windOffsetLow;

// 레이어 가시성
uniform float u_visibleHigh;
uniform float u_visibleLow;

// ============================================================================
// 1. 위상 함수 (Henyey-Greenstein Phase Functions)
// ============================================================================

float hgPhase(float cosTheta, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (pow(max(0.01, 1.0 + g2 - 2.0 * g * cosTheta), 1.5) * 12.56637);
}

float dualHg(float cosTheta, float forwardG, float backG, float weight) {
  return mix(hgPhase(cosTheta, backG), hgPhase(cosTheta, forwardG), weight);
}

// ============================================================================
// 2. [동글동글한 구체 100% 제거] 유기적 도메인 워핑 & 바람 전단 프랙탈 엔진
// ============================================================================

float sampleCloudDensityOrganic(vec2 p, float normHeight, float coverage, float puffiness, vec2 windDir) {
  // 1. [바람 전단 (Wind Shear)] 상공으로 갈수록 바람을 타고 비스듬히 흩날리는 유체 결
  vec2 shearedP = p + windDir * (normHeight * 0.28);

  // 2. [비대칭 도메인 워핑 (Domain Warping)] 원형 대칭성을 완전히 분쇄하는 2단계 유체 소용돌이
  vec2 warpUV = shearedP * 0.048 + vec2(u_time * 0.0012, 0.0);
  vec4 warpSample = texture2D(u_noiseLut, warpUV);
  vec2 warp = (warpSample.ba - 0.5) * 0.12 + (warpSample.rg - 0.5) * 0.05;

  // 3. [프랙탈 FBM 주도 형태] 거대하고 유기적인 자연 구름 윤곽
  vec2 macroUV = shearedP * 0.088 + warp;
  vec4 lut = texture2D(u_noiseLut, macroUV);

  float macroFBM = lut.r;
  float microBumps = lut.g;

  // [핵심] 인공적인 Worley 구체 가중치를 0.18로 낮추고, 유기적 FBM이 전체 형태를 주도
  // 동글동글한 알사탕/비눗방울 덩어리가 완전히 사라지고 실제 하늘 사진 같은 장엄한 결이 살아남
  float shape = mix(macroFBM, macroFBM * 0.82 + microBumps * 0.18, clamp(puffiness * 0.65, 0.0, 1.0));

  // 4. [고주파 솜털 및 잔물결 침식] 대기와 섞여 보슬보슬 흩날리는 미세 깃털 베일
  vec2 microUV = shearedP * 0.26 + warp * 0.6;
  vec4 microSample = texture2D(u_noiseLut, microUV);
  float wispyErosion = microSample.b;
  shape -= (1.0 - wispyErosion) * 0.16 * (1.0 - shape);

  // 5. 비대칭 고도 프로파일 (바람 부는 날 실제 적운: 하단 편평 + 상단 흩날림)
  float baseCut = smoothstep(0.03, 0.20, normHeight);
  float topFalloff = smoothstep(1.0, 0.62, normHeight);
  shape *= mix(0.70, 1.25, baseCut * topFalloff);

  // 6. 정밀 운량 임계치 (801/802 조각구름 쾌청한 푸른 하늘 보존)
  float threshold = 0.79 - coverage * 0.44;
  return smoothstep(threshold, threshold + 0.13, shape);
}

void main() {
  if (v_uv.y < 0.02) {
    discard;
    return;
  }

  // [원근 왜곡 100% 무왜곡 투영]
  vec3 rayDir = normalize(v_viewRay);
  float planeDist = 1.0 / max(0.06, rayDir.y);
  vec2 baseDomeCoord = vec2(rayDir.x, rayDir.z) * planeDist * 0.65;
  vec2 marchCoord = baseDomeCoord + u_windOffsetLow;

  // 바람 진행 방향 단위 벡터
  vec2 windDir = normalize(u_windOffsetLow + vec2(0.001, 0.001));

  // [초고속 조기 기각] 맑은 하늘 영역은 레이마칭 자체를 0ms로 스킵
  vec2 coarseUV = marchCoord * 0.088 + vec2(u_time * 0.0012, 0.0);
  vec4 macroSample = texture2D(u_noiseLut, coarseUV);
  float macroThreshold = 0.77 - u_coverage * 0.44;
  
  if (macroSample.r < macroThreshold - 0.13 && (u_visibleHigh < 0.5 || u_cloudType >= 0.85)) {
    discard;
    return;
  }

  // 지평선 원경 페이드
  float horizonFade = smoothstep(0.02, 0.12, v_uv.y);

  // [광원 및 조명 색상]
  vec3 normSunDir = normalize(u_sunDir);
  vec3 normMoonDir = normalize(u_moonDir);
  bool isSunActive = u_sunAlt > -4.5;
  vec3 activeLightDir = isSunActive ? normSunDir : normMoonDir;

  float sunIntensity = smoothstep(-6.0, 2.5, u_sunAlt);
  float moonIntensity = (1.0 - sunIntensity);

  // 위상 함수 (Mie Forward Scattering)
  float cosSun = dot(rayDir, normSunDir);
  float phaseSun = dualHg(cosSun, 0.84, -0.24, 0.80) * 12.56637;
  float silverLiningFactor = clamp(phaseSun * u_mieIntensity * 0.38 * sunIntensity, 0.0, 2.4);

  if (u_haloStrength > 0.05) {
    float haloAngleSun = abs(acos(clamp(cosSun, -1.0, 1.0)) - 0.384);
    silverLiningFactor += smoothstep(0.065, 0.0, haloAngleSun) * u_haloStrength * 0.90 * sunIntensity;
  }

  // 낮 구름 고반사 순백색 Albedo 및 맑은 파스텔 연하늘빛 그림자
  vec3 ambientSky = mix(u_skyHorizon, u_skyZenith, clamp(v_uv.y * 1.25, 0.0, 1.0));
  float sunsetFactor = smoothstep(14.0, -4.0, u_sunAlt) * smoothstep(-8.0, -1.0, u_sunAlt);
  vec3 sunsetShadowTint = vec3(0.60, 0.48, 0.75); // 라벤더/인디고
  vec3 standardDayShadow = mix(vec3(0.88, 0.93, 1.0), ambientSky, 0.22);
  vec3 dayShadowBase = mix(standardDayShadow, sunsetShadowTint, sunsetFactor * 0.65) * mix(1.0, 0.75, u_darkBase);
  vec3 nightShadowBase = ambientSky * mix(0.70, 0.30, u_darkBase);
  vec3 baseAmbient = mix(nightShadowBase, dayShadowBase, sunIntensity);

  // 눈부신 1.65배 순백색 직사광
  vec3 sunRadiance = u_sunColor * 1.65;
  vec3 moonRadiance = u_moonColor * 1.10;
  vec3 lightRadiance = mix(moonRadiance * moonIntensity, sunRadiance * sunIntensity, sunIntensity);

  // [실크 스무스 3단계 볼류메트릭 레이마칭]
  vec3 accumColor = vec3(0.0);
  float transmittance = 1.0;
  float totalDensity = 0.0;
  vec2 rayDirXZ = vec2(rayDir.x, rayDir.z);

  // Slice 1: 하단 밑면 (h = 0.20)
  {
    float h = 0.20;
    vec2 p = marchCoord + rayDirXZ * 0.030;
    float d = sampleCloudDensityOrganic(p, h, u_coverage, u_puffiness, windDir) * u_density;
    if (d > 0.005) {
      float lightFacing = clamp(dot(rayDirXZ, activeLightDir.xz) * 0.5 + 0.5, 0.35, 1.0);
      float shadow = mix(0.55, 1.0, lightFacing * h);
      vec3 col = baseAmbient * 0.74 + lightRadiance * (shadow * (1.0 + silverLiningFactor * max(0.0, cosSun)));
      float sliceD = d * 0.34;
      float st = exp(-sliceD * 2.2);
      accumColor += col * (transmittance * (1.0 - st));
      transmittance *= st;
      totalDensity += sliceD;
    }
  }

  // Slice 2: 중간 돔 코어 (h = 0.50)
  if (transmittance > 0.02) {
    float h = 0.50;
    vec2 p = marchCoord + rayDirXZ * 0.075;
    float d = sampleCloudDensityOrganic(p, h, u_coverage, u_puffiness, windDir) * u_density;
    if (d > 0.005) {
      float lightFacing = clamp(dot(rayDirXZ, activeLightDir.xz) * 0.5 + 0.5, 0.35, 1.0);
      float shadow = mix(0.55, 1.0, lightFacing * h);
      vec3 col = baseAmbient * 0.86 + lightRadiance * (shadow * (1.0 + silverLiningFactor * max(0.0, cosSun)));
      float sliceD = d * 0.34;
      float st = exp(-sliceD * 2.2);
      accumColor += col * (transmittance * (1.0 - st));
      transmittance *= st;
      totalDensity += sliceD;
    }
  }

  // Slice 3: 상단 봉우리 (h = 0.80)
  if (transmittance > 0.02) {
    float h = 0.80;
    vec2 p = marchCoord + rayDirXZ * 0.120;
    float d = sampleCloudDensityOrganic(p, h, u_coverage, u_puffiness, windDir) * u_density;
    if (d > 0.005) {
      float lightFacing = clamp(dot(rayDirXZ, activeLightDir.xz) * 0.5 + 0.5, 0.35, 1.0);
      float shadow = mix(0.55, 1.0, lightFacing * h);
      vec3 col = baseAmbient + lightRadiance * (shadow * (1.0 + silverLiningFactor * max(0.0, cosSun)));
      float sliceD = d * 0.34;
      float st = exp(-sliceD * 2.2);
      accumColor += col * (transmittance * (1.0 - st));
      transmittance *= st;
      totalDensity += sliceD;
    }
  }

  // 상층 제트기류 권운 (Layer 3: Cirrus)
  if (u_visibleHigh > 0.5 && u_cloudType < 0.85) {
    vec2 cirrusCoord = baseDomeCoord * 1.75 + u_windOffsetHigh * 0.12;
    vec4 cirrusSample = texture2D(u_noiseLut, cirrusCoord * 0.065);
    float cirrusRaw = cirrusSample.b * 0.70 + cirrusSample.r * 0.30;
    float cirrusThresh = 0.70 - u_coverage * 0.28;
    float cirrusDensity = smoothstep(cirrusThresh, cirrusThresh + 0.10, cirrusRaw) * (1.0 - u_cloudType) * 0.55 * u_density;

    if (cirrusDensity > 0.005) {
      vec3 cirrusColor = mix(baseAmbient, sunRadiance * sunIntensity * (1.0 + silverLiningFactor * 0.6), 0.82);
      accumColor += cirrusColor * (transmittance * cirrusDensity);
      transmittance *= exp(-cirrusDensity * 1.2);
      totalDensity += cirrusDensity;
    }
  }

  // 지평선 원경 대기 페이딩 적용
  accumColor *= horizonFade;
  totalDensity *= horizonFade;

  if (totalDensity <= 0.003) {
    discard;
    return;
  }

  // [D] 크레퍼스큘러 갓레이(Crepuscular God Rays)
  if (u_sunAlt > -4.0 && cosSun > 0.40) {
    float godRayRadial = pow(max(0.0, cosSun), 7.0);
    float gapMask = smoothstep(0.08, 0.45, transmittance) * smoothstep(0.92, 0.40, transmittance);
    float godRayIntensity = godRayRadial * gapMask * sunIntensity * 0.60;
    accumColor += u_sunColor * godRayIntensity;
  }

  // [E] 지평선 대기 원근 안개
  float aerialHaze = 1.0 - smoothstep(0.02, 0.28, v_uv.y);
  accumColor = mix(accumColor, u_skyHorizon, aerialHaze * 0.38);

  // [F] 흐린 날(804) 폭풍우 틴팅
  if (u_ambientDull > 0.02) {
    float dullFactor = clamp(u_ambientDull, 0.0, 0.26);
    vec3 stormTone = mix(ambientSky * 0.65, vec3(0.55, 0.58, 0.65) * max(0.08, sunIntensity), 0.70);
    accumColor = mix(accumColor, stormTone, dullFactor);
  }

  // [G] Filmic Extended Reinhard 톤 매핑
  float whitePoint = 1.75;
  accumColor = (accumColor * (vec3(1.0) + accumColor / (whitePoint * whitePoint))) / (vec3(1.0) + accumColor);
  accumColor = clamp(accumColor, 0.0, 1.0);

  float finalAlpha = clamp(1.0 - transmittance, 0.0, 1.0);

  gl_FragColor = vec4(accumColor, finalAlpha);
}
`;
