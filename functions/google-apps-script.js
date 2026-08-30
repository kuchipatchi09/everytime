/**
 * ==========================================================================
 * asterisk* 공지사항 백엔드 — Google Apps Script (Code.gs)
 * ==========================================================================
 * 
 * [배포 방법]
 * 1. Google Sheets(구글 스프레드시트)를 새로 생성합니다.
 * 2. 상단 메뉴에서 [확장 프로그램] > [Apps Script]를 클릭합니다.
 * 3. 기존 코드를 모두 지우고 이 코드를 그대로 붙여넣습니다.
 * 4. 상단 [배포] > [새 배포]를 클릭합니다.
 * 5. 유형 선택(톱니바퀴) > [웹 앱] 선택:
 *    - 설명: asterisk notice api
 *    - 다음 사용자로 실행: [나 (내 계정)]
 *    - 액세스 권한이 있는 사용자: [모든 사용자 (Anyone)] ★ 중요!
 * 6. [배포] 버튼을 누르고 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 복사합니다.
 */

const SHEET_NAME = "Notices";

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  
  // 헤더가 없으면 자동 생성
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["ID", "Category", "Title", "Content", "Author", "CreatedAt"]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#F3F3F3");
  }
  return sheet;
}

function doGet(e) {
  try {
    const action = e?.parameter?.action || "getPosts";

    if (action === "getPosts") {
      const sheet = getOrCreateSheet();
      const lastRow = sheet.getLastRow();
      
      if (lastRow <= 1) {
        return createJsonResponse({ success: true, posts: [] });
      }

      const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
      const posts = values.map((row, index) => {
        return {
          id: row[0] || (index + 1),
          category: String(row[1] || "전체"),
          title: String(row[2] || ""),
          content: String(row[3] || ""),
          author: String(row[4] || "관리자"),
          createdAt: row[5] ? new Date(row[5]).toISOString() : new Date().toISOString()
        };
      });

      // 최신순 정렬 (역순)
      posts.reverse();

      return createJsonResponse({ success: true, posts: posts });
    }

    // GET 요청으로 글 작성 (Fallback 지원)
    if (action === "addPost") {
      const category = e.parameter.category || "전체";
      const title = e.parameter.title || "";
      const content = e.parameter.content || "";
      const author = e.parameter.author || "관리자";

      if (!title || !content) {
        return createJsonResponse({ success: false, message: "제목과 내용이 필요합니다." });
      }

      const sheet = getOrCreateSheet();
      const id = Utilities.getUuid();
      const createdAt = new Date().toISOString();

      sheet.appendRow([id, category, title, content, author, createdAt]);

      return createJsonResponse({ success: true, message: "공지가 등록되었습니다." });
    }

    return createJsonResponse({ success: false, message: "알 수 없는 요청입니다." });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function doPost(e) {
  try {
    let payload = {};
    
    // JSON 본문 파싱 시도
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (err) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const category = payload.category || "전체";
    const title = payload.title || "";
    const content = payload.content || "";
    const author = payload.author || "관리자";

    if (!title || !content) {
      return createJsonResponse({ success: false, message: "제목과 내용이 필요합니다." });
    }

    const sheet = getOrCreateSheet();
    const id = Utilities.getUuid();
    const createdAt = new Date().toISOString();

    sheet.appendRow([id, category, title, content, author, createdAt]);

    return createJsonResponse({ success: true, message: "공지가 등록되었습니다." });
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
