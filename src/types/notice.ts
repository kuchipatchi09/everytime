export interface Post {
  id?: string | number;
  category: "학사" | "생활" | "행사" | "긴급" | string;
  title: string;
  content: string;
  createdAt?: string | number;
}

export interface NoticeResponse {
  posts?: Post[];
  success?: boolean;
}
