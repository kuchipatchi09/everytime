export type DayOfWeek = "월" | "화" | "수" | "목" | "금";

export type GradeNumber = "1" | "2" | "3";
export type ClassNumber = "1" | "2" | "3" | "4";

export interface ClassConfig {
  g: GradeNumber;
  c: ClassNumber;
}

export type WeeklyTimetable = Record<DayOfWeek, string[]>;

export type SchoolTimetable = Record<
  GradeNumber,
  Record<ClassNumber, WeeklyTimetable>
>;

export type RoutineItem = [startTime: string, endTime: string, title: string];
