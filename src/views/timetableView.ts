import { DAYS, DEFAULT_TIMETABLE } from "../constants/timetable";
import { getRoutine } from "../constants/routines";
import { $ } from "../utils/dom";
import { getSavedClass } from "../utils/storage";
import { DayOfWeek } from "../types/timetable";

let routineDay = Math.min(5, Math.max(1, new Date().getDay()));

export function renderTimetable(): void {
  const { g, c } = getSavedClass();
  const s = DEFAULT_TIMETABLE[g][c];
  const di = new Date().getDay() - 1;
  const currentDayOfWeek: DayOfWeek | null = di >= 0 && di < 5 ? DAYS[di] : null;
  const today = currentDayOfWeek ? s[currentDayOfWeek] : [];

  $("#content").innerHTML = `
    <section class="grid timegrid">
      <article class="panel">
        <div class="panelhead">
          <span class="eyebrow">WEEKLY</span>
          <h2>${g}학년 ${c}반 주간 시간표</h2>
        </div>
        <div class="scroll">
          <table>
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
        <div class="todaylist">
          ${
            today.length
              ? today
                  .map((x: string, i: number) => `<div><span>${i + 1}</span><b>${x}</b></div>`)
                  .join("")
              : "오늘은 정규 수업이 없습니다."
          }
        </div>
      </aside>
    </section>
    ${renderRoutineTable()}
  `;

  bindRoutineTabs();
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
