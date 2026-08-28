import { AfterschoolData } from "../types/afterschool";

let cachedData: AfterschoolData | null = null;

export async function fetchAfterschoolData(): Promise<AfterschoolData> {
  if (cachedData) return cachedData;
  const res = await fetch("./afterschool.json?v=2", { cache: "no-store" });
  if (!res.ok) throw new Error("방과후 JSON 데이터를 불러오지 못했습니다.");
  cachedData = await res.json();
  return cachedData!;
}
