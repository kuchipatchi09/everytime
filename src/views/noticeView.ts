import { createNotice, fetchNotices } from "../services/noticeService";
import { NoticeCategory, Post } from "../types/notice";
import { esc } from "../utils/escape";
import { $, showToast } from "../utils/dom";
import { getSavedName } from "../utils/storage";

let boardPosts: Post[] = [];
let boardFilter: NoticeCategory = "전체";
const CATEGORIES: NoticeCategory[] = ["전체", "1학년", "2학년", "3학년"];

export async function renderBoard(): Promise<void> {
  const content = $("#content");
  if (!content) return;
  const loadingState = document.createElement("div");
  loadingState.className = "empty";
  loadingState.textContent = "공지를 불러오는 중입니다...";
  content.replaceChildren(loadingState);

  try {
    const posts = await fetchNotices();
    // Another tab (or a newer board render) has replaced this loading state.
    if (!content.contains(loadingState)) return;
    boardPosts = posts;
    renderBoardList();
  } catch (error) {
    console.error("renderBoard error:", error);
    if (!content.contains(loadingState)) return;
    content.innerHTML = `
      <div class="empty">
        <p style="margin-bottom: 12px;">공지를 불러오지 못했습니다.</p>
        <button class="primary btn-sm" id="retry-notice-btn">다시 시도</button>
      </div>
    `;
    $("#retry-notice-btn")?.addEventListener("click", () => renderBoard());
  }
}

export function renderBoardList(): void {
  const content = $("#content");
  if (!content) return;

  const filteredPosts = boardPosts.filter((post) => {
    const cat = String(post.category || "").trim();
    if (boardFilter === "전체") {
      return cat === "전체" || cat === "공통" || cat === "";
    }
    return cat === boardFilter || cat === boardFilter.replace("학년", "");
  });

  content.innerHTML = `
    <section class="board-wrap">
      <div class="board-head">
        <div class="board-brand">
          <div class="board-symbol">*</div>
          <div>
            <h2>충곽 공지 게시판</h2>
            <p>전체 공지 ${boardPosts.length}건 · ${boardFilter} 보기 (${filteredPosts.length}건)</p>
          </div>
        </div>
        <button class="primary" id="write-post-btn">✎ 공지 작성</button>
      </div>

      <!-- 학년별 필터 탭 (전체 / 1학년 / 2학년 / 3학년) -->
      <div class="board-filters">
        ${CATEGORIES.map(
          (cat) => `
            <button
              class="board-filter-btn ${boardFilter === cat ? "active" : ""}"
              data-category="${cat}"
            >
              ${cat}
            </button>
          `
        ).join("")}
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
                  const dateStr = formatPostDate(post.createdAt);
                  const author = post.author || "관리자";
                  const categoryTag = post.category || "전체";

                  return `
                    <button class="post-row post-detail-trigger" data-index="${originalIndex}">
                      <span class="post-index">${postNumber}</span>
                      <div class="post-title-line">
                        <span class="tag category-tag-${getCategoryClass(categoryTag)}">${esc(categoryTag)}</span>
                        <h3>${esc(post.title)}</h3>
                      </div>
                      <span class="post-author">${esc(author)}</span>
                      <time class="post-date">${dateStr}</time>
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
      boardFilter = (btn.dataset.category as NoticeCategory) || "전체";
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
  const content = $("#content");
  if (!content) return;

  const post = boardPosts[index];
  if (!post) {
    renderBoardList();
    return;
  }

  const categoryTag = post.category || "전체";
  const author = post.author || "관리자";
  const dateStr = post.createdAt ? new Date(post.createdAt).toLocaleString("ko-KR") : "작성일 정보 없음";

  content.innerHTML = `
    <article class="panel detail">
      <button class="back" id="detail-back-btn">← 목록으로</button>
      <div style="margin-bottom: 8px;">
        <span class="tag category-tag-${getCategoryClass(categoryTag)}">${esc(categoryTag)}</span>
      </div>
      <h2>${esc(post.title)}</h2>
      <time class="detail-meta">
        ${esc(author)} · ${dateStr}
      </time>
      <div class="body" style="white-space: pre-wrap; line-height: 1.7; margin-top: 20px;">${esc(post.content)}</div>
    </article>
  `;

  $("#detail-back-btn")?.addEventListener("click", () => renderBoardList());
}

export function renderWritePost(): void {
  const content = $("#content");
  if (!content) return;

  const savedName = getSavedName() || "관리자";

  content.innerHTML = `
    <article class="panel editor">
      <button class="back" id="editor-back-btn">← 목록으로</button>
      <span class="eyebrow">NEW NOTICE</span>
      <h2>공지 작성</h2>

      <label>
        대상 학년 분류
        <select id="post-category" class="editor-select">
          <option value="전체">전체 (전교생)</option>
          <option value="1학년">1학년</option>
          <option value="2학년">2학년</option>
          <option value="3학년">3학년</option>
        </select>
      </label>

      <label>
        작성자 이름 / 직책
        <input
          id="post-author"
          maxlength="20"
          value="${esc(savedName)}"
          placeholder="작성자 입력"
        />
      </label>

      <label>
        제목
        <input
          id="post-title"
          maxlength="80"
          placeholder="공지 제목을 입력하세요"
          required
        />
      </label>

      <label>
        내용
        <textarea
          id="post-body"
          rows="10"
          placeholder="공지 내용을 입력하세요"
          required
        ></textarea>
      </label>

      <div class="actions" style="display: flex; gap: 10px; margin-top: 16px;">
        <button class="secondary" id="editor-cancel-btn">취소</button>
        <button class="primary" id="editor-submit-btn">공지 등록하기</button>
      </div>
    </article>
  `;

  $("#editor-back-btn")?.addEventListener("click", () => renderBoardList());
  $("#editor-cancel-btn")?.addEventListener("click", () => renderBoardList());

  const submitBtn = $<HTMLButtonElement>("#editor-submit-btn");
  submitBtn?.addEventListener("click", async () => {
    const categorySelect = $<HTMLSelectElement>("#post-category");
    const authorInput = $<HTMLInputElement>("#post-author");
    const titleInput = $<HTMLInputElement>("#post-title");
    const bodyInput = $<HTMLTextAreaElement>("#post-body");

    const category = categorySelect.value;
    const author = authorInput.value.trim() || "관리자";
    const title = titleInput.value.trim();
    const bodyContent = bodyInput.value.trim();

    if (!title) {
      alert("제목을 입력하세요.");
      titleInput.focus();
      return;
    }
    if (!bodyContent) {
      alert("내용을 입력하세요.");
      bodyInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "등록 중...";

    try {
      const success = await createNotice(category, title, bodyContent, author);
      if (!success) {
        throw new Error("Creation returned false");
      }
      showToast("공지가 성공적으로 등록되었습니다.");
      await renderBoard();
    } catch (err) {
      console.error("Post creation error:", err);
      alert("공지 등록 중 오류가 발생했습니다. 구글 앱스크립트 설정을 확인해주세요.");
      submitBtn.disabled = false;
      submitBtn.textContent = "공지 등록하기";
    }
  });
}

function formatPostDate(createdAt?: string | number): string {
  if (!createdAt) return "—";
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return String(createdAt);
    return d.toLocaleDateString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "—";
  }
}

function getCategoryClass(category: string): string {
  if (category.includes("1")) return "1";
  if (category.includes("2")) return "2";
  if (category.includes("3")) return "3";
  return "all";
}
