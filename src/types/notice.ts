export type NoticeCategory = "전체" | "1학년" | "2학년" | "3학년";

export interface Post {
  id?: string | number;
  category: NoticeCategory | string;
  title: string;
  content: string;
  author?: string;
  createdAt?: string | number;
}

export interface NoticeResponse {
  posts?: Post[];
  success?: boolean;
  message?: string;
}
