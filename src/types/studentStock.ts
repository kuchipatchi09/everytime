export interface StudentStockSubmission {
  grade: number;
  class_num: number;
  student_num: number;
  ticker_1: string;
  ticker_2: string;
  ticker_3: string;
}

export interface MyStockResponse {
  uid: string;
  grade: number;
  class_num: number;
  student_num: number;
  ticker_1: string;
  ticker_2: string;
  ticker_3: string;
  updated_at?: string;
  error?: string;
}
