export type MealCode = "1" | "2" | "3"; // 1: 조식, 2: 중식, 3: 석식

export interface NeisMealRow {
  MLSV_YMD: string;
  MMEAL_SC_CODE: string;
  DDISH_NM: string;
  CAL_INFO?: string;
  NTR_INFO?: string;
}

export interface NeisMealResponse {
  mealServiceDietInfo?: [
    { head: unknown[] },
    { row: NeisMealRow[] }
  ];
}
