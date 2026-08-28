import { DAYS } from "../constants/timetable";
import { fetchAfterschoolData } from "../services/afterschoolService";
import { esc } from "../utils/escape";
import { formatDateKey, getMonday } from "../utils/time";
import { $ } from "../utils/dom";
import { getSavedClass } from "../utils/storage";
import { DayOfWeek } from "../types/timetable";

export async function renderAfterschool(): Promise<void> {
  const { g, c } = getSavedClass();
  const now = new Date();
  const monday = getMonday(now);
  const todayIndex = now.getDay() - 1;

  let schedules: any = {};
  try {
    schedules = await fetchAfterschoolData();
  } catch {
    $("#content").innerHTML =
      '<div class="empty">방과후 정보를 불러오지 못했습니다.<br>afterschool.json 파일을 확인해주세요.</div>';
    return;
  }

  const cards = DAYS.map((day: DayOfWeek, index: number) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);

    const key = formatDateKey(date);
    const schedule =
      schedules[g]?.[key]?.[c] ||
      schedules[key]?.[c] ||
      null;

    return `
      <article class="panel mealday afterday ${index === todayIndex ? "current" : ""}">
        <div class="mealdate">
          <strong>${day}</strong>
          <span>${date.getMonth() + 1}.${date.getDate()}</span>
        </div>
        ${
          schedule
            ? `
              <h3 class="after-subject">${esc(schedule[0])}</h3>
              <p class="after-teacher">${esc(schedule[1])} 선생님</p>
            `
            : `
              <p class="after-empty">
                등록된 방과후 일정이 없습니다.
              </p>
            `
        }
      </article>
    `;
  }).join("");

  $("#content").innerHTML = `
    <section>
      <div class="mealbar">
        <div>
          <span class="eyebrow">WEEKLY AFTER SCHOOL</span>
          <h2>${g}학년 ${c}반 이번 주 방과후</h2>
        </div>
      </div>
      <div class="mealdays">${cards}</div>
    </section>
  `;
}
