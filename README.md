# asterisk*

> **The Answer to Campus Life, and Everything.**  
> 충남과학고등학교 학생들을 위한 통합 학교생활 서비스

![Platform](https://img.shields.io/badge/Platform-Web%20%2F%20PWA-black?style=flat-square)
![Stack](https://img.shields.io/badge/Stack-TypeScript%20%7C%20Vite%20%7C%20React-blue?style=flat-square)
![Design](https://img.shields.io/badge/Theme-Absolute%20Ink%20Black-black?style=flat-square)
![Target](https://img.shields.io/badge/Target-충남과학고등학교-gray?style=flat-square)

---

## 충곽 생활의 궁극적인 답

여러 사이트와 공지방을 오가며 시간표, 급식, 공지를 일일이 찾던 번거로움은 이제 끝입니다. **asterisk***는 충남과학고에서의 하루를 단 하나의 화면에 명확하게 정리해 드립니다.

**왜 asterisk* 인가요?**
* **궁극의 답 (42):** 《은하수를 여행하는 히치하이커를 위한 안내서》에서 삶과 우주의 궁극적인 답인 `42`는 ASCII 코드로 별표 기호인 `*`(asterisk)입니다.
* **와일드카드 (*):** 모든 데이터를 불러오는 와일드카드 기호처럼, 학교생활에 필요한 모든 정보를 한곳에 모았습니다.
* **단 하나의 안내서:** 캠퍼스라는 작은 우주 속에서 매일 마주하는 질문에 가장 간결하고 정확한 답을 제시합니다.

---

## 기능 요약

| 기능 | 이용자 편의 요소 |
| :--- | :--- |
| **지금 일과** | 현재 진행 중인 수업/일과, 남은 시간, 다음 일정까지 실시간 타이머 표시 |
| **오늘의 급식** | 아침·점심·저녁 중 지금 필요한 식단을 자동으로 맞춤 안내 |
| **스마트 시간표** | 교시별 수업 정보와 함께 수·금·일 특수 일정이 반영된 시정표 제공 |
| **주간 방과후** | 요일 및 반별 방과후 과목과 담당 교사 정보를 주간 카드로 깔끔하게 정리 |
| **캠퍼스 날씨** | 학교 주변의 현재 날씨, 기온, 체감온도, 습도를 한눈에 파악 |
| **최신 공지사항** | 메인 화면에서 최신 공지 즉시 확인 및 분류 필터 검색 지원 |
| **시장 지표 전광판** | 코스피, 코스닥, 나스닥, 원/달러 실시간 지표 티커 제공 |
| **빠른 바로가기** | 상단 메뉴를 통해 학생 커뮤니티 및 공간 예약 서비스로 즉시 이동 |

---

## 기술 스택 및 구조

- **TypeScript (v5.7+)**: 전역 타입 정의 (`src/types/`)를 통한 높은 타입 안정성
- **Vite (v6+)**: 초고속 번들러 및 HMR 개발 서버
- **React 18**: 브랜드 스토리 및 디자인 시스템 페이지 (`src/brand.tsx`)
- **디렉토리 구조**:
  - `public/`: 정적 에셋 (아이콘, 매니페스트, CNAME, 방과후 JSON 데이터 등)
  - `src/constants/`: API 설정, 시간표 및 일과 시정표 상수
  - `src/services/`: 외부 API 통신 계층 (NEIS, OpenWeather, Google Apps Script, 시장 지표)
  - `src/views/`: 화면별 UI 렌더링 뷰 모듈
  - `src/utils/`: DOM 헬퍼, 시간 연산, 이스케이프, 로컬 스토리지 유틸
  - `src/styles/`: 디자인 토큰 기반 스타일시트

---

## 로컬 개발 및 빌드

```bash
# 의존성 설치
npm install

# 로컬 개발 서버 실행 (HMR 지원)
npm run dev

# 프로덕션 빌드 (TypeScript 컴파일 & 번들링)
npm run build

# 빌드 결과 미리보기
npm run preview
```

---

## 앱처럼 편리하게 사용하기 (PWA)

별도의 앱스토어 다운로드 없이, 사용 중인 브라우저에서 홈 화면에 추가하면 전용 앱처럼 빠르고 독립적으로 실행됩니다.

* **iPhone / iPad (Safari):** 공유 버튼 클릭 ➔ `홈 화면에 추가`
* **Android (Chrome):** 우측 상단 메뉴(`⋮`) 클릭 ➔ `홈 화면에 추가` 또는 `앱 설치`
* **PC (Chrome / Edge):** 주소창 우측 `설치` 아이콘 클릭

---

<div align="center">

**학교생활에 필요한 답을 찾기 위해 여러 곳을 헤매지 않도록.**  
**The Answer to Campus Life, and Everything.**

</div>
