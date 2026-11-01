# asterisk* 개인정보 처리방침 (Privacy Policy System)

이 디렉토리는 `asterisk*` 통합 학내 디지털 생태계(`cnsh.life` 및 `cnsh.space`)의 **개인정보 처리방침** 인터랙티브 뷰어 및 버전 아카이브를 관리합니다.

---

## 1. 개요 및 특징

* **인터랙티브 쉘 (`index.html`)**: ChatGPT / Gemini 스타일의 좌측 사이드바, 직각 모서리 모노크롬 디자인, `jsdiff` 기반의 **실시간 버전 간 차이점(Diff) 비교 기능** 내장.
* **최초 제정일**: 공고일자 2026년 11월 1일 / 시행일자 2026년 11월 1일
* **적용 범위 및 규정 준수**:
  * **Life Track (`cnsh.life`)**: 0초 무인증 학교생활 정보 포털 (서버 저장 없는 무인증 포털, 브라우저 LocalStorage에만 설정 보관)
  * **Space Track (`cnsh.space`)**: Knoblab SSO 재학생 기수 인증 커뮤니티, 8대 게시판, KaTeX 수식, 최대 45MB 미디어 스트리밍(HTTP 206), asterisk* AI (Jev 라우터)
  * **Google Cloud & Workspace API 준수**: [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) 및 Limited Use(제한적 사용) 요건 준수 (Classroom/Calendar 연동 학업 일정 동기화, AES-256-GCM 암호화 토큰 보관, AI/ML 학습 금지, 광고/판매 금지, 즉각 연동 해제 지원)

---

## 2. 디렉토리 구조

```text
privacy/
├── index.html            # 개인정보 처리방침 메인 인터랙티브 쉘 (모노크롬 에디토리얼 테마)
├── README.md             # 방침 관리 가이드
└── docs/
    └── 20261101.html     # 2026년 11월 1일 최초 제정 방침 원문 (HTML)
```

---

## 3. 향후 새 버전 개정 시 업데이트 절차

새로운 개인정보 처리방침이 개정될 경우(예: 2026년 12월 1일자 개정):

1. **새 원문 파일 생성**: `privacy/docs/20261201.html` 생성
2. **버전 배열 등록**: `privacy/index.html` 내 `versions` 배열에 버전 추가:
   ```javascript
   const versions = ['20261101', '20261201'];
   ```
3. 사용자가 웹에서 '이전 버전과 비교' 스위치를 켜면 `jsdiff`가 자동으로 두 버전 간 추가된 문구(`<ins>`)와 삭제된 문구(`<del>`)를 하이라이트하여 렌더링합니다.
