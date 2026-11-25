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

uniform float u_timeWarp;

// 심리스 Perlin-Worley 텍스처 LUT (R: Macro, G: Billow, B: Wispy, A: Curl)
uniform sampler2D u_noiseLut;

// 구름 파라미터 (사전 계산된 프레임 상수 포함)
uniform float u_density;
uniform float u_cloudType;
uniform float u_cloudThreshold;    // 0.79 - coverage * 0.44
uniform float u_macroRejectThresh; // 0.64 - coverage * 0.44
uniform float u_puffFactor;        // clamp(puffiness * 0.65, 0.0, 1.0)
uniform float u_mieIntensity;
uniform float u_haloStrength;
uniform float u_cirrusThresh;      // 0.70 - coverage * 0.28
uniform float u_cirrusScale;       // (1.0 - cloudType) * 0.55 * density
uniform float u_dullFactor;        // ambientDull > 0.02 ? clamp(ambientDull, 0.0, 0.26) : 0.0

// 광원 (CPU에서 프레임당 1회 사전 계산)
uniform vec3 u_normSunDir;
uniform vec3 u_activeLightDir;
uniform vec3 u_sunColor;
uniform float u_sunAlt;
uniform float u_sunIntensity;
uniform float u_sunsetFactor;
uniform vec3 u_sunRadiance;
uniform vec3 u_lightRadiance;
uniform float u_darkBaseScale;     // mix(1.0, 0.75, darkBase)
uniform float u_nightBaseScale;    // mix(0.70, 0.30, darkBase)
uniform vec3 u_stormBase;          // vec3(0.55, 0.58, 0.65) * max(0.08, sunIntensity)

// 대기 색상
uniform vec3 u_skyZenith;
uniform vec3 u_skyHorizon;

// 바람 이동 오프셋 (상층운 + 3슬라이스 전단 사전 결합)
uniform vec2 u_windOffsetHigh;
uniform vec2 u_windOffsetLow;
uniform vec2 u_shear1;
uniform vec2 u_shear2;
uniform vec2 u_shear3;

// 레이어 가시성
uniform float u_visibleHigh;

// ============================================================================
// 1. 위상 함수 (Henyey-Greenstein 4*PI 정규화 상수 상쇄)
// ============================================================================

float hg4Pi(float cosTheta, float oneMinusG2, float onePlusG2, float twoG) {
  float denom = max(0.01, onePlusG2 - twoG * cosTheta);
  return oneMinusG2 / (denom * sqrt(denom));
}

// ============================================================================
// 2. 유기적 도메인 워핑 & 바람 전단 프랙탈 엔진 (상한 기반 조기 스킵 포함)
// ============================================================================

float sampleCloudDensityOrganic(vec2 shearedP, float heightScale) {
  // 1. 비대칭 도메인 워핑
  vec2 warpUV = shearedP * 0.048 + vec2(u_timeWarp, 0.0);
  vec4 warpSample = texture2D(u_noiseLut, warpUV);
  vec2 warp = (warpSample.ba - 0.5) * 0.12 + (warpSample.rg - 0.5) * 0.05;

  // 2. 프랙탈 FBM 주도 형태
  vec2 macroUV = shearedP * 0.088 + warp;
  vec4 lut = texture2D(u_noiseLut, macroUV);

  float macroFBM = lut.r;
  float shape = macroFBM + u_puffFactor * 0.18 * (lut.g - macroFBM);

  // [무손실 상한 스킵] 이후 wispyErosion 감산은 항상 >= 0이므로 상한이 threshold 이하이면 0.0 확정
  if (shape * heightScale <= u_cloudThreshold) {
    return 0.0;
  }

  // 3. 고주파 솜털 및 잔물결 침식
  vec2 microUV = shearedP * 0.26 + warp * 0.6;
  float wispyErosion = texture2D(u_noiseLut, microUV).b;
  shape -= (1.0 - wispyErosion) * 0.16 * (1.0 - shape);
  shape *= heightScale;

  return smoothstep(u_cloudThreshold, u_cloudThreshold + 0.13, shape);
}

void main() {
  if (v_uv.y < 0.02) {
    discard;
    return;
  }

  vec3 rayDir = normalize(v_viewRay);
  float planeDist = 1.0 / max(0.06, rayDir.y);
  vec2 baseDomeCoord = vec2(rayDir.x, rayDir.z) * planeDist * 0.65;

  // [무손실 조기 기각] 804 등 상층운 미표시/고운형 구간에서만 coarseUV 룩업 수행
  if (u_visibleHigh < 0.5 || u_cloudType >= 0.85) {
    vec2 coarseUV = (baseDomeCoord + u_windOffsetLow) * 0.088 + vec2(u_timeWarp, 0.0);
    if (texture2D(u_noiseLut, coarseUV).r < u_macroRejectThresh) {
      discard;
      return;
    }
  }

  vec2 rayDirXZ = vec2(rayDir.x, rayDir.z);

  // 지연 공유 조명 상태 (구름이 실제로 존재하는 픽셀에서만 최대 1회 계산)
  bool lightingReady = false;
  float cosSun = 0.0;
  float silverLiningFactor = 0.0;
  vec3 ambientSky = vec3(0.0);
  vec3 baseAmbient = vec3(0.0);
  vec3 sliceDirectLight = vec3(0.0);
  float lightFacing = 0.35;

  vec3 accumColor = vec3(0.0);
  float transmittance = 1.0;
  float totalDensity = 0.0;

  // Slice 1: 하단 밑면 (h = 0.20, heightScale = 1.25)
  {
    vec2 p = baseDomeCoord + u_shear1 + rayDirXZ * 0.030;
    float d = sampleCloudDensityOrganic(p, 1.25) * u_density;
    if (d > 0.005) {
      if (!lightingReady) {
        cosSun = dot(rayDir, u_normSunDir);
        float phaseSun = mix(hg4Pi(cosSun, 0.9424, 1.0576, -0.48), hg4Pi(cosSun, 0.2944, 1.7056, 1.68), 0.80);
        silverLiningFactor = clamp(phaseSun * u_mieIntensity * 0.38 * u_sunIntensity, 0.0, 2.4);
        if (u_haloStrength > 0.05) {
          float haloAngleSun = abs(acos(clamp(cosSun, -1.0, 1.0)) - 0.384);
          silverLiningFactor += smoothstep(0.065, 0.0, haloAngleSun) * u_haloStrength * 0.90 * u_sunIntensity;
        }
        ambientSky = mix(u_skyHorizon, u_skyZenith, clamp(v_uv.y * 1.25, 0.0, 1.0));
        vec3 standardDayShadow = mix(vec3(0.88, 0.93, 1.0), ambientSky, 0.22);
        vec3 dayShadowBase = mix(standardDayShadow, vec3(0.60, 0.48, 0.75), u_sunsetFactor * 0.65) * u_darkBaseScale;
        vec3 nightShadowBase = ambientSky * u_nightBaseScale;
        baseAmbient = mix(nightShadowBase, dayShadowBase, u_sunIntensity);
        lightFacing = clamp(dot(rayDirXZ, u_activeLightDir.xz) * 0.5 + 0.5, 0.35, 1.0);
        sliceDirectLight = u_lightRadiance * (1.0 + silverLiningFactor * max(0.0, cosSun));
        lightingReady = true;
      }
      float shadow = mix(0.55, 1.0, lightFacing * 0.20);
      vec3 col = baseAmbient * 0.74 + sliceDirectLight * shadow;
      float sliceD = d * 0.34;
      float st = exp2(-sliceD * 3.173928);
      accumColor += col * (transmittance * (1.0 - st));
      transmittance *= st;
      totalDensity += sliceD;
    }
  }

  // Slice 2: 중간 돔 코어 (h = 0.50, heightScale = 1.25)
  if (transmittance > 0.02) {
    vec2 p = baseDomeCoord + u_shear2 + rayDirXZ * 0.075;
    float d = sampleCloudDensityOrganic(p, 1.25) * u_density;
    if (d > 0.005) {
      if (!lightingReady) {
        cosSun = dot(rayDir, u_normSunDir);
        float phaseSun = mix(hg4Pi(cosSun, 0.9424, 1.0576, -0.48), hg4Pi(cosSun, 0.2944, 1.7056, 1.68), 0.80);
        silverLiningFactor = clamp(phaseSun * u_mieIntensity * 0.38 * u_sunIntensity, 0.0, 2.4);
        if (u_haloStrength > 0.05) {
          float haloAngleSun = abs(acos(clamp(cosSun, -1.0, 1.0)) - 0.384);
          silverLiningFactor += smoothstep(0.065, 0.0, haloAngleSun) * u_haloStrength * 0.90 * u_sunIntensity;
        }
        ambientSky = mix(u_skyHorizon, u_skyZenith, clamp(v_uv.y * 1.25, 0.0, 1.0));
        vec3 standardDayShadow = mix(vec3(0.88, 0.93, 1.0), ambientSky, 0.22);
        vec3 dayShadowBase = mix(standardDayShadow, vec3(0.60, 0.48, 0.75), u_sunsetFactor * 0.65) * u_darkBaseScale;
        vec3 nightShadowBase = ambientSky * u_nightBaseScale;
        baseAmbient = mix(nightShadowBase, dayShadowBase, u_sunIntensity);
        lightFacing = clamp(dot(rayDirXZ, u_activeLightDir.xz) * 0.5 + 0.5, 0.35, 1.0);
        sliceDirectLight = u_lightRadiance * (1.0 + silverLiningFactor * max(0.0, cosSun));
        lightingReady = true;
      }
      float shadow = mix(0.55, 1.0, lightFacing * 0.50);
      vec3 col = baseAmbient * 0.86 + sliceDirectLight * shadow;
      float sliceD = d * 0.34;
      float st = exp2(-sliceD * 3.173928);
      accumColor += col * (transmittance * (1.0 - st));
      transmittance *= st;
      totalDensity += sliceD;
    }
  }

  // Slice 3: 상단 봉우리 (h = 0.80, heightScale = 0.9966905)
  if (transmittance > 0.02) {
    vec2 p = baseDomeCoord + u_shear3 + rayDirXZ * 0.120;
    float d = sampleCloudDensityOrganic(p, 0.9966905) * u_density;
    if (d > 0.005) {
      if (!lightingReady) {
        cosSun = dot(rayDir, u_normSunDir);
        float phaseSun = mix(hg4Pi(cosSun, 0.9424, 1.0576, -0.48), hg4Pi(cosSun, 0.2944, 1.7056, 1.68), 0.80);
        silverLiningFactor = clamp(phaseSun * u_mieIntensity * 0.38 * u_sunIntensity, 0.0, 2.4);
        if (u_haloStrength > 0.05) {
          float haloAngleSun = abs(acos(clamp(cosSun, -1.0, 1.0)) - 0.384);
          silverLiningFactor += smoothstep(0.065, 0.0, haloAngleSun) * u_haloStrength * 0.90 * u_sunIntensity;
        }
        ambientSky = mix(u_skyHorizon, u_skyZenith, clamp(v_uv.y * 1.25, 0.0, 1.0));
        vec3 standardDayShadow = mix(vec3(0.88, 0.93, 1.0), ambientSky, 0.22);
        vec3 dayShadowBase = mix(standardDayShadow, vec3(0.60, 0.48, 0.75), u_sunsetFactor * 0.65) * u_darkBaseScale;
        vec3 nightShadowBase = ambientSky * u_nightBaseScale;
        baseAmbient = mix(nightShadowBase, dayShadowBase, u_sunIntensity);
        lightFacing = clamp(dot(rayDirXZ, u_activeLightDir.xz) * 0.5 + 0.5, 0.35, 1.0);
        sliceDirectLight = u_lightRadiance * (1.0 + silverLiningFactor * max(0.0, cosSun));
        lightingReady = true;
      }
      float shadow = mix(0.55, 1.0, lightFacing * 0.80);
      vec3 col = baseAmbient + sliceDirectLight * shadow;
      float sliceD = d * 0.34;
      float st = exp2(-sliceD * 3.173928);
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
    float cirrusDensity = smoothstep(u_cirrusThresh, u_cirrusThresh + 0.10, cirrusRaw) * u_cirrusScale;

    if (cirrusDensity > 0.005) {
      if (!lightingReady) {
        cosSun = dot(rayDir, u_normSunDir);
        float phaseSun = mix(hg4Pi(cosSun, 0.9424, 1.0576, -0.48), hg4Pi(cosSun, 0.2944, 1.7056, 1.68), 0.80);
        silverLiningFactor = clamp(phaseSun * u_mieIntensity * 0.38 * u_sunIntensity, 0.0, 2.4);
        if (u_haloStrength > 0.05) {
          float haloAngleSun = abs(acos(clamp(cosSun, -1.0, 1.0)) - 0.384);
          silverLiningFactor += smoothstep(0.065, 0.0, haloAngleSun) * u_haloStrength * 0.90 * u_sunIntensity;
        }
        ambientSky = mix(u_skyHorizon, u_skyZenith, clamp(v_uv.y * 1.25, 0.0, 1.0));
        vec3 standardDayShadow = mix(vec3(0.88, 0.93, 1.0), ambientSky, 0.22);
        vec3 dayShadowBase = mix(standardDayShadow, vec3(0.60, 0.48, 0.75), u_sunsetFactor * 0.65) * u_darkBaseScale;
        vec3 nightShadowBase = ambientSky * u_nightBaseScale;
        baseAmbient = mix(nightShadowBase, dayShadowBase, u_sunIntensity);
        lightingReady = true;
      }
      vec3 cirrusColor = mix(baseAmbient, u_sunRadiance * u_sunIntensity * (1.0 + silverLiningFactor * 0.6), 0.82);
      accumColor += cirrusColor * (transmittance * cirrusDensity);
      transmittance *= exp2(-cirrusDensity * 1.731234);
      totalDensity += cirrusDensity;
    }
  }

  // 지평선 원경 대기 페이딩 적용
  float horizonFade = smoothstep(0.02, 0.12, v_uv.y);
  accumColor *= horizonFade;
  totalDensity *= horizonFade;

  if (totalDensity <= 0.003) {
    discard;
    return;
  }

  // [D] 크레퍼스큘러 갓레이(Crepuscular God Rays)
  if (u_sunAlt > -4.0 && cosSun > 0.40) {
    float c2 = cosSun * cosSun;
    float godRayRadial = c2 * c2 * c2 * cosSun;
    float gapMask = smoothstep(0.08, 0.45, transmittance) * smoothstep(0.92, 0.40, transmittance);
    float godRayIntensity = godRayRadial * gapMask * u_sunIntensity * 0.60;
    accumColor += u_sunColor * godRayIntensity;
  }

  // [E] 지평선 대기 원근 안개
  float aerialHaze = 1.0 - smoothstep(0.02, 0.28, v_uv.y);
  accumColor = mix(accumColor, u_skyHorizon, aerialHaze * 0.38);

  // [F] 흐린 날(804) 폭풍우 틴팅
  if (u_dullFactor > 0.0) {
    vec3 stormTone = mix(ambientSky * 0.65, u_stormBase, 0.70);
    accumColor = mix(accumColor, stormTone, u_dullFactor);
  }

  // [G] Filmic Extended Reinhard 톤 매핑 (whitePoint = 1.75 => 1 / wp^2 = 0.32653061)
  accumColor = (accumColor * (vec3(1.0) + accumColor * 0.32653061)) / (vec3(1.0) + accumColor);
  accumColor = clamp(accumColor, 0.0, 1.0);

  float finalAlpha = clamp(1.0 - transmittance, 0.0, 1.0);

  gl_FragColor = vec4(accumColor, finalAlpha);
}
`;
