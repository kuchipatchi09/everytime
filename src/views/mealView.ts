import { DAYS } from "../constants/timetable";
import { fetchWeeklyMeals } from "../services/mealService";
import { MealCode } from "../types/meal";
import { DayOfWeek } from "../types/timetable";
import { formatYmd, getMonday } from "../utils/time";
import { $ } from "../utils/dom";

let currentMealCode: MealCode = "2";

export function setMealCode(code: MealCode): void {
  currentMealCode = code;
}

export async function renderMeals(): Promise<void> {
  $("#content").innerHTML = `<div class="empty">급식 정보를 불러오는 중입니다.</div>`;
  const now = new Date();
  const monday = getMonday(now);
  const di = now.getDay() - 1;

  try {
    const rows = await fetchWeeklyMeals(now);
    const mealSegments: Array<[MealCode, string]> = [
      ["1", "조식"],
      ["2", "중식"],
      ["3", "석식"],
    ];

    $("#content").innerHTML = `
      <section>
        <div class="mealbar">
          <div>
            <span class="eyebrow">WEEKLY MEAL</span>
            <h2>이번 주 급식</h2>
          </div>
          <div class="segments">
            ${mealSegments
              .map(
                ([code, label]) =>
                  `<button class="meal-seg-btn ${currentMealCode === code ? "active" : ""}" data-code="${code}">${label}</button>`
              )
              .join("")}
          </div>
        </div>
        <div class="mealdays">
          ${DAYS.map((label: DayOfWeek, i: number) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const ymd = formatYmd(d);
            const r = rows.find(
              (v) => v.MLSV_YMD === ymd && v.MMEAL_SC_CODE === currentMealCode
            );
            const menu = r
              ? r.DDISH_NM.replace(/\([^)]*\)/g, "").replace(/<br\/>/g, "\n")
              : "예정된 급식이 없습니다.";
            return `
              <article class="panel mealday ${i === di ? "current" : ""}">
                <div class="mealdate">
                  <strong>${label}</strong>
                  <span>${d.getMonth() + 1}.${d.getDate()}</span>
                </div>
                <p>${menu}</p>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;

    document.querySelectorAll<HTMLButtonElement>(".meal-seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentMealCode = btn.dataset.code as MealCode;
        renderMeals();
      });
    });
  } catch {
    $("#content").innerHTML = `<div class="empty">급식 정보를 불러오지 못했습니다.</div>`;
  }
}
