import './styles/sky.css';
import './styles/planetarium.css';
import { PlanetariumEngine, type AstronomyTelemetry } from './planetarium';
import { DEFAULT_LAT, DEFAULT_LON } from './astronomy/constants';
import { CLOUD_STAGES } from './clouds/cloudStages';
import { getSunTimes } from './astronomy/sun';

// 1. 플라네타리움 엔진 초기화
const engine = new PlanetariumEngine();
const skyContainer = document.getElementById('sky-background');
engine.init(skyContainer);

// 2. DOM 요소 참조
const clockMain = document.getElementById('clockMain') as HTMLElement;
const clockSub = document.getElementById('clockSub') as HTMLElement;
const clockSpeedBadge = document.getElementById('clockSpeedBadge') as HTMLElement;
const fpsBadge = document.getElementById('fpsBadge') as HTMLElement;

const timelineSlider = document.getElementById('timelineSlider') as HTMLInputElement;
const timelineVal = document.getElementById('timelineVal') as HTMLElement;
const datePickerInput = document.getElementById('datePickerInput') as HTMLInputElement;

const btnPlayPause = document.getElementById('btnPlayPause') as HTMLButtonElement;
const iconPlay = document.getElementById('iconPlay') as HTMLElement;
const iconPause = document.getElementById('iconPause') as HTMLElement;

const btnSpeedChips = document.querySelectorAll<HTMLButtonElement>('.btn-speed');
const quickChips = document.querySelectorAll<HTMLButtonElement>('.quick-chip');

// 구름 UI DOM
const cloudSlider = document.getElementById('cloudSlider') as HTMLInputElement;
const cloudLevelBadge = document.getElementById('cloudLevelBadge') as HTMLElement;
const cloudDescText = document.getElementById('cloudDescText') as HTMLElement;
const cloudPresetsContainer = document.getElementById('cloudPresetsContainer') as HTMLElement;

const telCloudName = document.getElementById('telCloudName') as HTMLElement;
const telCloudCover = document.getElementById('telCloudCover') as HTMLElement;
const telSunOcc = document.getElementById('telSunOcc') as HTMLElement;
const telMoonOcc = document.getElementById('telMoonOcc') as HTMLElement;
const telStarOcc = document.getElementById('telStarOcc') as HTMLElement;

const windSpeedSlider = document.getElementById('windSpeedSlider') as HTMLInputElement;
const windSpeedVal = document.getElementById('windSpeedVal') as HTMLElement;
const windDirSelect = document.getElementById('windDirSelect') as HTMLSelectElement;

const toggleCloudsAll = document.getElementById('toggleCloudsAll') as HTMLInputElement;
const toggleCloudsHigh = document.getElementById('toggleCloudsHigh') as HTMLInputElement;
const toggleCloudsLow = document.getElementById('toggleCloudsLow') as HTMLInputElement;

// 텔레메트리 DOM
const telSunAlt = document.getElementById('telSunAlt') as HTMLElement;
const telSunTimes = document.getElementById('telSunTimes') as HTMLElement;
const telSunDecl = document.getElementById('telSunDecl') as HTMLElement;
const telSunMaxAlt = document.getElementById('telSunMaxAlt') as HTMLElement;

const telMoonPhase = document.getElementById('telMoonPhase') as HTMLElement;
const telMoonAge = document.getElementById('telMoonAge') as HTMLElement;
const telMoonAlt = document.getElementById('telMoonAlt') as HTMLElement;
const telMoonElong = document.getElementById('telMoonElong') as HTMLElement;

const telLst = document.getElementById('telLst') as HTMLElement;
const telStarRot = document.getElementById('telStarRot') as HTMLElement;
const telStarOpacity = document.getElementById('telStarOpacity') as HTMLElement;
const telSkyZenith = document.getElementById('telSkyZenith') as HTMLElement;
const telSkyHorizon = document.getElementById('telSkyHorizon') as HTMLElement;
const zenithColorChip = document.getElementById('zenithColorChip') as HTMLElement;
const horizonColorChip = document.getElementById('horizonColorChip') as HTMLElement;

// 위치 인풋 & 프리셋
const inputLat = document.getElementById('inputLat') as HTMLInputElement;
const inputLon = document.getElementById('inputLon') as HTMLInputElement;
const btnApplyCoords = document.getElementById('btnApplyCoords') as HTMLButtonElement;
const locationChips = document.querySelectorAll<HTMLButtonElement>('.loc-chip');

// 레이어 토글 스위치
const toggleAtmosphere = document.getElementById('toggleAtmosphere') as HTMLInputElement;
const toggleStars = document.getElementById('toggleStars') as HTMLInputElement;
const toggleSun = document.getElementById('toggleSun') as HTMLInputElement;
const toggleMoon = document.getElementById('toggleMoon') as HTMLInputElement;
const toggleSatellites = document.getElementById('toggleSatellites') as HTMLInputElement;
const toggleFilmGrain = document.getElementById('toggleFilmGrain') as HTMLInputElement;
const togglePerfMode = document.getElementById('togglePerfMode') as HTMLInputElement;

// 액션 버튼
const btnSpawnSat = document.getElementById('btnSpawnSat') as HTMLButtonElement;
const btnSpawnStarlink = document.getElementById('btnSpawnStarlink') as HTMLButtonElement;
const btnToggleDrawer = document.getElementById('btnToggleDrawer') as HTMLButtonElement;
const btnCloseDrawer = document.getElementById('btnCloseDrawer') as HTMLButtonElement;
const sideDrawer = document.getElementById('sideDrawer') as HTMLElement;
const btnToggleZen = document.getElementById('btnToggleZen') as HTMLButtonElement;
const btnFullscreen = document.getElementById('btnFullscreen') as HTMLButtonElement;

// 날짜 조작
const btnPrevDay = document.getElementById('btnPrevDay') as HTMLButtonElement;
const btnNextDay = document.getElementById('btnNextDay') as HTMLButtonElement;
const datePresetSelect = document.getElementById('datePresetSelect') as HTMLSelectElement;

// 3. 5단계 WMO 날씨 구름 프리셋 칩 생성 (800 ~ 804) & 캐싱
const cachedCloudChips: { el: HTMLButtonElement; id: number }[] = [];
if (cloudPresetsContainer) {
  CLOUD_STAGES.forEach((stage) => {
    const chip = document.createElement('button');
    chip.className = 'cloud-chip' + (stage.id === 800 ? ' active' : '');
    chip.setAttribute('data-id', String(stage.id));
    const shortName = stage.name.replace(/\s*\(.*/, '');
    chip.textContent = `${stage.id} ${shortName}`;
    chip.title = `${stage.id} ${stage.name} (${Math.round(stage.coverage * 100)}%) — ${stage.description}`;
    chip.addEventListener('click', () => {
      if (cloudSlider) cloudSlider.value = String(stage.id);
      engine.setCloudLevel(stage.id);
    });
    cloudPresetsContainer.appendChild(chip);
    cachedCloudChips.push({ el: chip, id: stage.id });
  });
}

// 4. 실시간 FPS 카운터 모니터링 (가벼운 단일 루프)
let lastFpsTime = performance.now();
let frameCount = 0;
function measureFps(now: number) {
  frameCount++;
  if (now - lastFpsTime >= 500) {
    const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
    if (fpsBadge) {
      fpsBadge.textContent = `${fps} FPS`;
      fpsBadge.style.color = fps >= 55 ? '#69db7c' : (fps >= 30 ? '#fcc419' : '#ff6b6b');
    }
    frameCount = 0;
    lastFpsTime = now;
  }
  requestAnimationFrame(measureFps);
}
requestAnimationFrame(measureFps);

// 5. 텔레메트리 업데이트 수신 리스너 (사이드 드로어 닫힘 시 DOM 업데이트 80% 스킵 최적화)
let isDraggingSlider = false;
let lastCachedTelemetry: AstronomyTelemetry | null = null;

function updateDrawerTelemetry(data: AstronomyTelemetry) {
  // 태양 텔레메트리
  if (telSunAlt) {
    const alt = data.sunCoords.altitude;
    telSunAlt.textContent = `${alt >= 0 ? '+' : ''}${alt.toFixed(1)}° ${alt >= 0 ? '(지평선 위)' : '(지평선 아래)'}`;
  }
  if (telSunTimes) {
    const toHHMM = (m: number) => {
      const h = Math.floor(m / 60);
      const min = Math.floor(m % 60);
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    };
    telSunTimes.textContent = `${toHHMM(data.solar.sunrise)} / ${toHHMM(data.solar.sunset)}`;
  }
  if (telSunDecl) {
    telSunDecl.textContent = `${data.solar.declDeg >= 0 ? '+' : ''}${data.solar.declDeg.toFixed(1)}°`;
  }
  if (telSunMaxAlt) {
    telSunMaxAlt.textContent = `${data.solar.maxAlt.toFixed(1)}°`;
  }

  // 달 텔레메트리
  if (telMoonPhase) {
    telMoonPhase.textContent = `${data.moonPhase.icon} ${data.moonPhase.name} (${data.moonPhase.percent}%)`;
  }
  if (telMoonAge) {
    telMoonAge.textContent = `${data.moonAge.toFixed(1)}일 (29.5일 주기)`;
  }
  if (telMoonAlt) {
    const alt = data.moonCoords.altitude;
    telMoonAlt.textContent = `${alt >= 0 ? '+' : ''}${alt.toFixed(1)}°`;
  }
  if (telMoonElong) {
    telMoonElong.textContent = `${data.moonElongation.toFixed(1)}°`;
  }

  // 하늘 & 항성 텔레메트리
  if (telLst) {
    const lstDeg = data.lst;
    const lstHours = lstDeg / 15;
    const lh = Math.floor(lstHours);
    const lm = Math.floor((lstHours % 1) * 60);
    telLst.textContent = `${String(lh).padStart(2, '0')}h ${String(lm).padStart(2, '0')}m (${lstDeg.toFixed(1)}°)`;
  }
  if (telStarRot) {
    telStarRot.textContent = `${data.starRot.toFixed(1)}°`;
  }
  if (telStarOpacity) {
    telStarOpacity.textContent = `${Math.round(data.starOpacity * 100)}% (마스크: ${data.starMaskY.toFixed(0)}%)`;
  }
  if (telSkyZenith) {
    telSkyZenith.textContent = data.zenith;
  }
  if (zenithColorChip) {
    zenithColorChip.style.backgroundColor = data.zenith;
  }
  if (telSkyHorizon) {
    telSkyHorizon.textContent = data.horizon;
  }
  if (horizonColorChip) {
    horizonColorChip.style.backgroundColor = data.horizon;
  }
}

engine.onTelemetry((data: AstronomyTelemetry) => {
  lastCachedTelemetry = data;

  // 시계 & 슬라이더 갱신 (헤더 필수 UI)
  if (clockMain) clockMain.textContent = data.formattedTime;
  if (clockSub) clockSub.textContent = data.formattedDate;

  if (!isDraggingSlider && timelineSlider) {
    timelineSlider.value = String(Math.round(data.currentMinutes));
    if (timelineVal) timelineVal.textContent = data.formattedTime.substring(0, 5);
  }

  // 재생 / 일시정지 아이콘 상태
  if (data.isPlaying) {
    iconPlay.style.display = 'none';
    iconPause.style.display = 'block';
  } else {
    iconPlay.style.display = 'block';
    iconPause.style.display = 'none';
  }

  // 속도 뱃지
  if (clockSpeedBadge) {
    if (!data.isPlaying) {
      clockSpeedBadge.textContent = 'PAUSED';
      clockSpeedBadge.style.color = '#ff6b6b';
      clockSpeedBadge.style.borderColor = 'rgba(255, 107, 107, 0.4)';
      clockSpeedBadge.style.background = 'rgba(255, 107, 107, 0.15)';
    } else {
      clockSpeedBadge.textContent = `${data.speedMultiplier}x`;
      clockSpeedBadge.style.color = '#fcc419';
      clockSpeedBadge.style.borderColor = 'rgba(252, 196, 25, 0.4)';
      clockSpeedBadge.style.background = 'rgba(252, 196, 25, 0.18)';
    }
  }

  // 구름 요약 배지
  if (cloudLevelBadge) {
    const shortName = data.cloudProfile.name.replace(/\s*\(.*/, '');
    cloudLevelBadge.textContent = `${data.cloudLevel.toFixed(1)} (${shortName})`;
  }
  if (cloudDescText) {
    cloudDescText.textContent = data.cloudProfile.description;
  }

  // 프리셋 칩 활성 상태 하이라이트 (캐시된 배열로 고속 순회, querySelectorAll 0회)
  const activeId = Math.round(data.cloudLevel);
  for (let i = 0; i < cachedCloudChips.length; i++) {
    const item = cachedCloudChips[i];
    item.el.classList.toggle('active', item.id === activeId);
  }

  // [최적화 핵심] 사이드 드로어가 닫혀있으면 20여 개 상세 텔레메트리 DOM 조작 완전 스킵!
  const isDrawerOpen = sideDrawer && !sideDrawer.classList.contains('drawer-collapsed');
  if (isDrawerOpen) {
    if (telCloudName) telCloudName.textContent = `${data.cloudLevel.toFixed(1)} ${data.cloudProfile.name}`;
    if (telCloudCover) telCloudCover.textContent = `${Math.round(data.cloudProfile.coverage * 100)}% (${data.cloudProfile.nameEn})`;
    if (telSunOcc) telSunOcc.textContent = `${Math.round(data.sunOcclusion * 100)}%`;
    if (telMoonOcc) telMoonOcc.textContent = `${Math.round(data.moonOcclusion * 100)}%`;
    if (telStarOcc) telStarOcc.textContent = `${Math.round(data.starOcclusion * 100)}%`;

    updateDrawerTelemetry(data);
  }

  // 날짜 피커 값 동기화
  if (datePickerInput && document.activeElement !== datePickerInput) {
    const yyyy = data.simDate.getFullYear();
    const mm = String(data.simDate.getMonth() + 1).padStart(2, '0');
    const dd = String(data.simDate.getDate()).padStart(2, '0');
    datePickerInput.value = `${yyyy}-${mm}-${dd}`;
  }
});

// 6. 구름 슬라이더 이벤트 연결
cloudSlider?.addEventListener('input', () => {
  const lvl = Number(cloudSlider.value);
  engine.setCloudLevel(lvl);
});

// 7. 풍속 및 풍향 조절
windSpeedSlider?.addEventListener('input', () => {
  const spd = Number(windSpeedSlider.value);
  if (windSpeedVal) windSpeedVal.textContent = `${spd.toFixed(1)}x`;
  engine.setWind(spd, Number(windDirSelect.value));
});

windDirSelect?.addEventListener('change', () => {
  engine.setWind(Number(windSpeedSlider.value), Number(windDirSelect.value));
});

// 8. 구름 레이어 개별 제어 스위치
toggleCloudsAll?.addEventListener('change', () => {
  engine.setLayerVisibility('clouds', toggleCloudsAll.checked);
});

toggleCloudsHigh?.addEventListener('change', () => {
  engine.setCloudLayerVisibility(toggleCloudsHigh.checked, toggleCloudsLow.checked);
});

toggleCloudsLow?.addEventListener('change', () => {
  engine.setCloudLayerVisibility(toggleCloudsHigh.checked, toggleCloudsLow.checked);
});

// 9. 타임라인 슬라이더 이벤트 연결
timelineSlider?.addEventListener('input', () => {
  isDraggingSlider = true;
  const m = Number(timelineSlider.value);
  engine.setTime(m);
  const hh = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  if (timelineVal) timelineVal.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
});

timelineSlider?.addEventListener('change', () => {
  isDraggingSlider = false;
});

// 10. 재생 / 일시정지 토글
btnPlayPause?.addEventListener('click', () => {
  engine.togglePlay();
});

// 11. 시뮬레이션 배속 버튼들
btnSpeedChips.forEach((btn) => {
  btn.addEventListener('click', () => {
    const spd = Number(btn.getAttribute('data-speed'));
    engine.setSpeedMultiplier(spd);
    engine.setPlaying(true);
    btnSpeedChips.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// 12. 퀵 점프 버튼들
quickChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const target = chip.getAttribute('data-target');
    const date = engine.getDate();
    const { lat, lon } = engine.getLocation();
    const solar = getSunTimes(date, lat, lon);

    switch (target) {
      case 'dawn':
        engine.setTime(solar.sunrise - 45);
        break;
      case 'sunrise':
        engine.setTime(solar.sunrise);
        break;
      case 'noon':
        engine.setTime(solar.solarNoon);
        break;
      case 'sunset':
        engine.setTime(solar.sunset);
        break;
      case 'dusk':
        engine.setTime(solar.sunset + 30);
        break;
      case 'midnight':
        engine.setTime(0);
        break;
      case 'now':
        engine.syncWithRealTime();
        btnSpeedChips.forEach((b) => b.classList.remove('active'));
        document.querySelector('.btn-speed[data-speed="1"]')?.classList.add('active');
        break;
    }
  });
});

// 13. 날짜 조작
datePickerInput?.addEventListener('change', () => {
  const val = datePickerInput.value;
  if (val) {
    const [year, month, day] = val.split('-').map(Number);
    const currentDate = engine.getDate();
    currentDate.setFullYear(year, month - 1, day);
    engine.setDate(currentDate);
  }
});

btnPrevDay?.addEventListener('click', () => {
  const d = engine.getDate();
  d.setDate(d.getDate() - 1);
  engine.setDate(d);
});

btnNextDay?.addEventListener('click', () => {
  const d = engine.getDate();
  d.setDate(d.getDate() + 1);
  engine.setDate(d);
});

datePresetSelect?.addEventListener('change', () => {
  const val = datePresetSelect.value;
  const currentYear = new Date().getFullYear();
  let targetDate = new Date();

  switch (val) {
    case 'summer':
      targetDate = new Date(currentYear, 5, 21); // 하지 6월 21일
      break;
    case 'winter':
      targetDate = new Date(currentYear, 11, 21); // 동지 12월 21일
      break;
    case 'spring':
      targetDate = new Date(currentYear, 2, 20); // 춘분 3월 20일
      break;
    case 'autumn':
      targetDate = new Date(currentYear, 8, 23); // 추분 9월 23일
      break;
    case 'fullmoon':
      targetDate = new Date(2026, 8, 26);
      break;
    case 'newmoon':
      targetDate = new Date(2026, 8, 11);
      break;
    case 'today':
    default:
      targetDate = new Date();
      break;
  }

  engine.setDate(targetDate);
});

// 14. 위치 좌표 설정 & 프리셋
btnApplyCoords?.addEventListener('click', () => {
  const lat = parseFloat(inputLat.value);
  const lon = parseFloat(inputLon.value);
  if (!isNaN(lat) && !isNaN(lon)) {
    engine.setLocation(lat, lon);
  }
});

locationChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const lat = parseFloat(chip.getAttribute('data-lat') || '0');
    const lon = parseFloat(chip.getAttribute('data-lon') || '0');
    inputLat.value = lat.toFixed(4);
    inputLon.value = lon.toFixed(4);
    engine.setLocation(lat, lon);
  });
});

// 15. 기본 천체 레이어 표시/숨김 토글
toggleAtmosphere?.addEventListener('change', () => {
  engine.setLayerVisibility('atmosphere', toggleAtmosphere.checked);
});

toggleStars?.addEventListener('change', () => {
  engine.setLayerVisibility('stars', toggleStars.checked);
});

toggleSun?.addEventListener('change', () => {
  engine.setLayerVisibility('sun', toggleSun.checked);
});

toggleMoon?.addEventListener('change', () => {
  engine.setLayerVisibility('moon', toggleMoon.checked);
});

toggleSatellites?.addEventListener('change', () => {
  engine.setLayerVisibility('satellites', toggleSatellites.checked);
});

toggleFilmGrain?.addEventListener('change', () => {
  engine.setLayerVisibility('filmGrain', toggleFilmGrain.checked);
});

togglePerfMode?.addEventListener('change', () => {
  engine.setPerfMode(togglePerfMode.checked);
});

// 16. 인공위성 발사 수동 트리거
btnSpawnSat?.addEventListener('click', () => {
  engine.spawnSatellite(false);
});

btnSpawnStarlink?.addEventListener('click', () => {
  engine.spawnSatellite(true);
});

// 17. 드로어 열기 / 닫기
btnToggleDrawer?.addEventListener('click', () => {
  sideDrawer.classList.toggle('drawer-collapsed');
  if (!sideDrawer.classList.contains('drawer-collapsed') && lastCachedTelemetry) {
    updateDrawerTelemetry(lastCachedTelemetry);
  }
});

btnCloseDrawer?.addEventListener('click', () => {
  sideDrawer.classList.add('drawer-collapsed');
});

// 18. Zen 모드 (UI 숨김 / 월페이퍼 모드)
btnToggleZen?.addEventListener('click', () => {
  document.body.classList.toggle('zen-mode');
});

// 19. 전체화면 토글
btnFullscreen?.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// 20. 단축키 매핑 (키보드 조작)
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
    return;
  }

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      engine.togglePlay();
      break;
    case 'KeyH':
      document.body.classList.toggle('zen-mode');
      break;
    case 'KeyF':
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
      break;
    case 'KeyN':
      engine.syncWithRealTime();
      btnSpeedChips.forEach((b) => b.classList.remove('active'));
      document.querySelector('.btn-speed[data-speed="1"]')?.classList.add('active');
      break;
    case 'KeyS':
      engine.spawnSatellite(false);
      break;
    case 'KeyL':
      engine.spawnSatellite(true);
      break;
    case 'KeyC': {
      // 5단계 날씨 순환 (800 -> 801 -> 802 -> 803 -> 804 -> 800)
      const keyStages = [800, 801, 802, 803, 804];
      const curLvl = Math.round(engine.getCloudLevel());
      const nextLvl = keyStages.find((s) => s > curLvl) ?? keyStages[0];
      if (cloudSlider) cloudSlider.value = String(nextLvl);
      engine.setCloudLevel(nextLvl);
      break;
    }
    case 'ArrowUp': {
      e.preventDefault();
      const cur = Math.min(804, Math.round(engine.getCloudLevel()) + 1);
      if (cloudSlider) cloudSlider.value = String(cur);
      engine.setCloudLevel(cur);
      break;
    }
    case 'ArrowDown': {
      e.preventDefault();
      const cur = Math.max(800, Math.round(engine.getCloudLevel()) - 1);
      if (cloudSlider) cloudSlider.value = String(cur);
      engine.setCloudLevel(cur);
      break;
    }
    case 'BracketRight': {
      const speeds = [1, 10, 60, 300, 1800];
      const cur = engine.getSpeedMultiplier();
      const next = speeds.find((s) => s > cur) || speeds[speeds.length - 1];
      engine.setSpeedMultiplier(next);
      engine.setPlaying(true);
      btnSpeedChips.forEach((b) => {
        b.classList.toggle('active', Number(b.getAttribute('data-speed')) === next);
      });
      break;
    }
    case 'BracketLeft': {
      const speeds = [1, 10, 60, 300, 1800];
      const cur = engine.getSpeedMultiplier();
      const prev = [...speeds].reverse().find((s) => s < cur) || speeds[0];
      engine.setSpeedMultiplier(prev);
      engine.setPlaying(true);
      btnSpeedChips.forEach((b) => {
        b.classList.toggle('active', Number(b.getAttribute('data-speed')) === prev);
      });
      break;
    }
  }
});
