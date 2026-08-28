export type ClassAfterschool = [subject: string, teacher: string];

export type DateAfterschoolSchedule = Record<string, ClassAfterschool>;

export type AfterschoolData = Record<
  string,
  Record<string, Record<string, ClassAfterschool>> | DateAfterschoolSchedule
>;
