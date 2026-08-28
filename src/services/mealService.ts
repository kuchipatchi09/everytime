import {
  NEIS_API_KEY,
  NEIS_OFFICE_CODE,
  NEIS_SCHOOL_CODE,
} from "../constants/config";
import { MealCode, NeisMealResponse, NeisMealRow } from "../types/meal";
import { formatYmd, getMonday } from "../utils/time";

export async function fetchDailyMeal(date: Date, mealCode: MealCode): Promise<string> {
  const ymd = formatYmd(date);
  const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=${NEIS_API_KEY}&Type=json&ATPT_OFCDC_SC_CODE=${NEIS_OFFICE_CODE}&SD_SCHUL_CODE=${NEIS_SCHOOL_CODE}&MLSV_YMD=${ymd}&MMEAL_SC_CODE=${mealCode}`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NEIS API error: ${res.status}`);
  const data: NeisMealResponse = await res.json();
  const row = data.mealServiceDietInfo?.[1]?.row?.[0];
  if (!row) return "오늘 등록된 급식이 없습니다.";
  return row.DDISH_NM.replace(/\([^)]*\)/g, "").replace(/<br\/>/g, " · ");
}

export async function fetchWeeklyMeals(date: Date): Promise<NeisMealRow[]> {
  const monday = getMonday(date);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const fromYmd = formatYmd(monday);
  const toYmd = formatYmd(friday);

  const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=${NEIS_API_KEY}&Type=json&ATPT_OFCDC_SC_CODE=${NEIS_OFFICE_CODE}&SD_SCHUL_CODE=${NEIS_SCHOOL_CODE}&MLSV_FROM_YMD=${fromYmd}&MLSV_TO_YMD=${toYmd}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`NEIS API error: ${res.status}`);
  const data: NeisMealResponse = await res.json();
  return data.mealServiceDietInfo?.[1]?.row || [];
}
