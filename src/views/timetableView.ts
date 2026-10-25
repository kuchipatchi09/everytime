import { DAYS } from "../constants/timetable";
import { getRoutine } from "../constants/routines";
import { $, showToast } from "../utils/dom";
import { getSavedClass } from "../utils/storage";
import { DayOfWeek } from "../types/timetable";
import { fetchSchoolTimetable, getClassTimetableSync, TimetableResult } from "../services/timetableService";

let routineDay = Math.min(5, Math.max(1, new Date().getDay()));
let isRefreshing = false;

export function renderTimetable(forceFetch = false): void {
  const { g, c } = getSavedClass();
  const s = getClassTimetableSync(g, c);
  const di = new Date().getDay() - 1;
  const currentDayOfWeek: DayOfWeek | null = di >= 0 && di < 5 ? DAYS[di] : null;
  const today = currentDayOfWeek ? s[currentDayOfWeek] : [];

  $("#content").innerHTML = `
    <section class="grid timegrid">
      <article class="panel">
        <div class="panelhead">
          <div class="comci-sync-header">
            <div>
              <span class="eyebrow">WEEKLY</span>
              <h2>${g}학년 ${c}반 주간 시간표</h2>
            </div>
            <div class="comci-badge-wrap">
              <span class="comci-live-badge" id="comci-status-badge" title="실시간 학급 시간표 연동">
                <span class="comci-dot" id="comci-status-dot"></span>
                <span id="comci-status-text">시간표 동기화 중...</span>
              </span>
              <button type="button" class="comci-refresh-btn" id="comci-refresh-btn" aria-label="시간표 새로고침" title="실시간 시간표 새로고침">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="scroll">
          <table id="weekly-timetable-table">
            <thead>
              <tr>
                <th>교시</th>
                ${DAYS.map((d: DayOfWeek, i: number) => `<th class="${i === di ? "today" : ""}">${d}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${[0, 1, 2, 3, 4, 5, 6]
                .map(
                  (p) =>
                    `<tr><th>${p + 1}</th>${DAYS.map(
                      (d: DayOfWeek, i: number) =>
                        `<td class="${i === di ? "today" : ""}">${s[d][p] || "—"}</td>`
                    ).join("")}</tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </article>
      <aside class="panel todaycard">
        <span class="eyebrow">TODAY</span>
        <h2>${di >= 0 && di < 5 ? DAYS[di] + "요일 수업" : "주말"}</h2>
        <div class="todaylist" id="today-timetable-list">
          ${
            today.length
              ? today
                  .map((x: string, i: number) => `<div><span>${i + 1}</span><b>${x || "—"}</b></div>`)
                  .join("")
              : "오늘은 정규 수업이 없습니다."
          }
        </div>
      </aside>
    </section>
    ${renderRoutineTable()}
  `;

  bindRoutineTabs();
  bindRefreshButton();

  // 비동기 실시간 시간표 로드 및 UI 갱신
  loadLiveTimetable(forceFetch);
}

async function loadLiveTimetable(forceFetch = false): Promise<void> {
  const badgeText = document.getElementById("comci-status-text");
  const badgeDot = document.getElementById("comci-status-dot");
  const refreshBtn = document.getElementById("comci-refresh-btn");

  if (isRefreshing && refreshBtn) {
    refreshBtn.classList.add("spinning");
  }

  try {
    const res: TimetableResult = await fetchSchoolTimetable(forceFetch);
    const { g, c } = getSavedClass();
    const liveSchedule = res.timetable[g]?.[c] || getClassTimetableSync(g, c);
    const di = new Date().getDay() - 1;
    const currentDayOfWeek: DayOfWeek | null = di >= 0 && di < 5 ? DAYS[di] : null;
    const liveToday = currentDayOfWeek ? liveSchedule[currentDayOfWeek] : [];

    // 상태 배지 업데이트
    if (badgeText && badgeDot) {
      if (res.isLive) {
        badgeText.textContent = "실시간 연동됨";
        badgeDot.className = "comci-dot";
      } else if (res.isFallback) {
        badgeText.textContent = "기본 시간표 모드";
        badgeDot.className = "comci-dot is-fallback";
      }
    }

    // 주간 테이블 본문 업데이트
    const tbody = document.querySelector("#weekly-timetable-table tbody");
    if (tbody) {
      tbody.innerHTML = [0, 1, 2, 3, 4, 5, 6]
        .map(
          (p) =>
            `<tr><th>${p + 1}</th>${DAYS.map(
              (d: DayOfWeek, i: number) =>
                `<td class="${i === di ? "today" : ""}">${liveSchedule[d]?.[p] || "—"}</td>`
            ).join("")}</tr>`
        )
        .join("");
    }

    // 오늘의 수업 리스트 업데이트
    const todayList = document.getElementById("today-timetable-list");
    if (todayList) {
      todayList.innerHTML = liveToday.length
        ? liveToday
            .map((x: string, i: number) => `<div><span>${i + 1}</span><b>${x || "—"}</b></div>`)
            .join("")
        : "오늘은 정규 수업이 없습니다.";
    }
  } catch (err) {
    if (badgeText && badgeDot) {
      badgeText.textContent = "오프라인 시간표";
      badgeDot.className = "comci-dot is-fallback";
    }
  } finally {
    isRefreshing = false;
    refreshBtn?.classList.remove("spinning");
  }
}

function bindRefreshButton(): void {
  const btn = document.getElementById("comci-refresh-btn");
  btn?.addEventListener("click", async () => {
    if (isRefreshing) return;
    isRefreshing = true;
    btn.classList.add("spinning");
    showToast("최신 시간표를 동기화하는 중...");
    await loadLiveTimetable(true);
    showToast("시간표가 최신 상태로 갱신되었습니다.");
  });
}

function renderRoutineTable(): string {
  const labels = ["월", "화", "수", "목", "금"];
  const rows = getRoutine(routineDay).filter(
    (item) => item[2] !== "취침 및 등교 준비"
  );

  return `
    <section class="routine-board">
      <div class="routine-board-head">
        <div>
          <span class="eyebrow">DAILY ROUTINE</span>
          <h2>${labels[routineDay - 1]}요일 하루 일과 시정표</h2>
        </div>
        <div class="routine-tabs">
          ${labels
            .map(
              (label, index) =>
                `<button class="routine-tab-btn ${routineDay === index + 1 ? "active" : ""}" data-day="${index + 1}">${label}</button>`
            )
            .join("")}
        </div>
      </div>
      <div class="routine-rows">
        ${rows
          .map(
            (item) =>
              `<div><time>${item[0]}–${item[1]}</time><strong>${item[2]}</strong></div>`
          )
          .join("")}
      </div>
    </section>`;
}

function bindRoutineTabs(): void {
  document.querySelectorAll<HTMLButtonElement>(".routine-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      routineDay = Number(btn.dataset.day);
      renderTimetable();
    });
  });
}
