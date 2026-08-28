import { createNotice, fetchNotices } from "../services/noticeService";
import { Post } from "../types/notice";
import { esc } from "../utils/escape";
import { $ } from "../utils/dom";

let boardPosts: Post[] = [];
let boardFilter = "전체";

export async function renderBoard(): Promise<void> {
  $("#content").innerHTML = `<div class="empty">공지를 불러오는 중입니다.</div>`;
  try {
    boardPosts = await fetchNotices();
    renderBoardList();
  } catch {
    $("#content").innerHTML = `<div class="empty">공지를 불러오지 못했습니다.</div>`;
  }
}

export function renderBoardList(): void {
  const categories = ["전체", "학사", "생활", "행사", "긴급"];
  const filteredPosts =
    boardFilter === "전체"
      ? boardPosts
      : boardPosts.filter((post) => (post.category || "학사") === boardFilter);

  $("#content").innerHTML = `
    <section class="board-wrap">
      <div class="board-head">
        <div class="board-brand">
          <div class="board-symbol">Q</div>
          <div>
            <h2>충곽 공지 게시판</h2>
            <p>전체 게시글 ${boardPosts.length}개</p>
          </div>
        </div>
        <button class="primary" id="write-post-btn">✎ 글쓰기</button>
      </div>

      <div class="board-filters">
        ${categories
          .map(
            (category) => `
              <button
                class="board-filter-btn ${boardFilter === category ? "active" : ""}"
                data-category="${category}"
              >
                ${category}
              </button>
            `
          )
          .join("")}
      </div>

      <div class="postlist">
        <div class="post-table-head">
          <span>번호</span>
          <span>제목</span>
          <span>작성자</span>
          <span>작성일</span>
          <span></span>
        </div>

        ${
          filteredPosts.length
            ? filteredPosts
                .map((post) => {
                  const originalIndex = boardPosts.indexOf(post);
                  const postNumber = boardPosts.length - originalIndex;
                  const date = post.createdAt
                    ? new Date(post.createdAt).toLocaleDateString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                      })
                    : "—";

                  return `
                    <button class="post-row post-detail-trigger" data-index="${originalIndex}">
                      <span class="post-index">${postNumber}</span>
                      <div class="post-title-line">
                        <span class="tag">${esc(post.category || "학사")}</span>
                        <h3>${esc(post.title)}</h3>
                      </div>
                      <span class="post-author">관리자</span>
                      <time class="post-date">${date}</time>
                      <b>›</b>
                    </button>
                  `;
                })
                .join("")
            : '<div class="empty">해당 분류에 등록된 공지가 없습니다.</div>'
        }
      </div>
    </section>
  `;

  $("#write-post-btn")?.addEventListener("click", () => renderWritePost());

  document.querySelectorAll<HTMLButtonElement>(".board-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      boardFilter = btn.dataset.category || "전체";
      renderBoardList();
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".post-detail-trigger").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      renderNoticeDetail(idx);
    });
  });
}

export function renderNoticeDetail(index: number): void {
  const post = boardPosts[index];
  if (!post) {
    renderBoardList();
    return;
  }

  $("#content").innerHTML = `
    <article class="panel detail">
      <button class="back" id="detail-back-btn">← 목록으로</button>
      <span class="tag">${esc(post.category || "학사")}</span>
      <h2>${esc(post.title)}</h2>
      <time>
        관리자 ·
        ${
          post.createdAt
            ? new Date(post.createdAt).toLocaleString("ko-KR")
            : "작성일 정보 없음"
        }
      </time>
      <div class="body">${esc(post.content)}</div>
    </article>
  `;

  $("#detail-back-btn")?.addEventListener("click", () => renderBoardList());
}

export function renderWritePost(): void {
  $("#content").innerHTML = `
    <article class="panel editor">
      <button class="back" id="editor-back-btn">← 목록으로</button>
      <span class="eyebrow">NEW SCHOOL NOTICE</span>
      <h2>공지 작성</h2>

      <label>
        분류
        <select id="post-category" class="editor-select">
          <option value="학사">학사</option>
          <option value="생활">생활</option>
          <option value="행사">행사</option>
          <option value="긴급">긴급</option>
        </select>
      </label>

      <label>
        제목
        <input
          id="post-title"
          maxlength="80"
          placeholder="제목을 입력하세요"
        />
      </label>

      <label>
        내용
        <textarea
          id="post-body"
          rows="12"
          placeholder="전교생에게 전달할 내용을 입력하세요"
        ></textarea>
      </label>

      <div class="actions">
        <button class="secondary" id="editor-cancel-btn">취소</button>
        <button class="primary" id="editor-submit-btn">등록하기</button>
      </div>
    </article>
  `;

  $("#editor-back-btn")?.addEventListener("click", () => renderBoardList());
  $("#editor-cancel-btn")?.addEventListener("click", () => renderBoardList());
  $("#editor-submit-btn")?.addEventListener("click", async () => {
    const category = ($("#post-category") as HTMLSelectElement).value;
    const title = ($("#post-title") as HTMLInputElement).value.trim();
    const content = ($("#post-body") as HTMLTextAreaElement).value.trim();

    if (!title || !content) {
      alert("제목과 내용을 모두 입력하세요.");
      return;
    }

    try {
      const ok = await createNotice(category, title, content);
      if (!ok) throw new Error("Creation returned false");
      await renderBoard();
    } catch {
      alert("공지 등록에 실패했습니다.");
    }
  });
}
