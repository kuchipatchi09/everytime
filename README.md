<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/Concept-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="public/Concept.svg">
  <img alt="asterisk" src="public/Concept.svg" width="120">
</picture>

# cnsh.life

**충남과학고등학교 학교생활 정보 포털 — Part of the `asterisk*` Ecosystem**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?style=flat-square&logo=cloudflarepages&logoColor=white)](https://cnsh.life)
[![PWA](https://img.shields.io/badge/PWA-Installable-5a0fc8?style=flat-square&logo=pwa&logoColor=white)](#pwa-설치)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg?style=flat-square)](LICENSE)

[**cnsh.life**](https://cnsh.life)

</div>

---

## Brand Architecture

`asterisk*`는 충남과학고등학교의 디지털 학내 생태계를 아우르는 최상위 브랜드이며, `cnsh.life`는 그 산하에서 일상적인 학교생활 정보를 전담하는 코어 서비스입니다.

| Tier | Service | Role |
| :--- | :--- | :--- |
| **Umbrella Brand** | **asterisk (`*`)** | 교내 디지털 서비스 통합 브랜드 및 디자인·계정 생태계 |
| **Life Portal** | **`cnsh.life`** *(현재 리포지토리)* | 시간표, 급식, 공지사항, 방과후 등 학교생활 정보 제공 |
| **Community** | **`asterisk community`** | 재학생 소통 및 학내 커뮤니티 플랫폼 |

---

## Open Graph Preview

GitHub이나 메신저에서 링크 공유 시 아래 메타데이터가 렌더링됩니다.

| Property | Value |
| :--- | :--- |
| `og:title` | cnsh.life — asterisk |
| `og:description` | 시간표, 방과후, 급식, 공지까지 충곽의 하루를 한곳에서 확인하세요. |
| `og:image` | [`/asterisk-logo.png`](public/asterisk-logo.png) (1200px PNG) |
| `og:type` | website |
| `og:locale` | ko_KR |
| `twitter:card` | summary_large_image |

> 메타 태그 원본: [`index.html`](index.html) L9-L26

---

## Overview

**cnsh.life**는 `asterisk*` 프로젝트의 일환으로, 충남과학고등학교 학생들이 시간표, 급식, 공지사항, 방과후 수업 등 교내 정보를 단일 인터페이스에서 조회할 수 있도록 설계된 SPA 기반 웹 포털이다. 별도 백엔드 서버 없이 클라이언트 사이드에서 외부 API를 직접 호출하며, PWA로 설치하여 네이티브 앱과 동일한 UX를 제공한다.

---

## Features

| Module | Description | Data Source |
| :--- | :--- | :--- |
| Dashboard | 현재 교시, 남은 시간, 다음 일정 실시간 표시 | 로컬 시정표 상수 |
| Timetable | 학년/반별 교시 시간표, 수·금·일 특수 시정 반영 | NEIS Open API |
| Meal | 시간대 기반 아침/점심/저녁 식단 자동 전환 | NEIS Open API |
| Afterschool | 요일·반별 방과후 과목 및 담당 교사 주간 카드 | 정적 JSON (`afterschool.json`) |
| Notice | 학교 공지사항 목록 및 카테고리 필터 검색 | Google Apps Script Proxy |
| Weather | 학교 소재지 현재 기온, 체감온도, 습도 | OpenWeatherMap API |
| Market Ticker | KOSPI, KOSDAQ, NASDAQ, USD/KRW 실시간 지표 | Yahoo Finance (Vite proxy) |

---

## Architecture

```text
cnsh.life/
├── index.html                 # SPA 엔트리 + OG/Twitter 메타 태그
├── brand.html                 # asterisk 브랜드 스토리 페이지 엔트리 (index.html#brand로 리다이렉트)
├── vite.config.ts             # Vite 설정 + Yahoo Finance 프록시 미들웨어
├── tsconfig.json
├── package.json
│
├── public/
│   ├── manifest.webmanifest   # PWA 매니페스트
│   ├── afterschool.json       # 방과후 정적 데이터
│   ├── Concept.svg            # asterisk 로고 SVG
│   ├── Concept-dark.svg       # asterisk 로고 SVG (다크 모드용)
│   ├── asterisk-logo.png      # OG 이미지
│   ├── favicon.svg
│   └── CNAME                  # 커스텀 도메인 설정 (cnsh.life)
│
└── src/
    ├── main.ts                # 앱 부트스트랩, 라우팅, 이벤트 바인딩
    │
    ├── constants/
    │   ├── config.ts          # API 엔드포인트, 학교 코드
    │   ├── timetable.ts       # 교시별 시간 매핑
    │   ├── routines.ts        # 일과 시정표 (평일/수금/일요일)
    │   └── index.ts
    │
    ├── services/              # 외부 API 통신 계층
    │   ├── mealService.ts     # NEIS 급식 API
    │   ├── noticeService.ts   # GAS 공지 프록시
    │   ├── weatherService.ts  # OpenWeatherMap
    │   ├── marketService.ts   # Yahoo Finance (via Vite proxy)
    │   └── afterschoolService.ts
    │
    ├── views/                 # UI 렌더링 모듈
    │   ├── dashboardView.ts   # 메인 대시보드
    │   ├── timetableView.ts   # 시간표
    │   ├── mealView.ts        # 급식
    │   ├── afterschoolView.ts # 방과후
    │   ├── noticeView.ts      # 공지사항
    │   ├── tickerView.ts      # 시장 지표 티커
    │   └── brandView.tsx      # 브랜드 페이지 (React)
    │
    ├── types/                 # 전역 타입 정의
    │   ├── timetable.ts
    │   ├── meal.ts
    │   ├── notice.ts
    │   ├── afterschool.ts
    │   ├── weather.ts
    │   └── market.ts
    │
    ├── utils/                 # 공통 유틸리티
    │   ├── dom.ts             # DOM 조작 헬퍼
    │   ├── time.ts            # 시간 연산
    │   ├── escape.ts          # HTML 이스케이프
    │   └── storage.ts         # localStorage 래퍼
    │
    └── styles/                # 디자인 토큰 기반 스타일시트
```

---

## Tech Stack

| Layer | Technology | Note |
| :--- | :--- | :--- |
| Language | TypeScript 5.7+ | `src/types/`에서 전역 인터페이스 관리 |
| Bundler | Vite 6 | HMR dev server + Rollup production build |
| UI (Brand) | React 18 | `brandView.tsx` 단일 페이지에만 사용 |
| Charting | Chart.js 4 | 시장 지표 인트라데이 차트 |
| Font | Pretendard, Asta Sans | SIL OFL 1.1 (CDN 로드) |
| Hosting | Cloudflare Pages | 커스텀 도메인 `cnsh.life` |
| PWA | Web App Manifest + 홈 화면 설치 | `manifest.webmanifest` |

---

## Development

```bash
# 의존성 설치
npm install

# 개발 서버 (HMR, 시장 데이터 프록시 포함)
npm run dev

# 프로덕션 빌드 (tsc + vite build)
npm run build

# 빌드 결과 로컬 프리뷰
npm run preview
```

### 환경 요구사항

- Node.js 18+
- npm 9+

### 빌드 출력

`dist/` 디렉토리에 정적 파일이 생성되며, Cloudflare Pages로 배포된다.

---

## PWA 설치

별도 앱스토어 없이 브라우저에서 홈 화면에 추가하면 독립 앱으로 실행된다.

| Platform | Method |
| :--- | :--- |
| iOS Safari | 공유 - 홈 화면에 추가 |
| Android Chrome | 메뉴(⋮) - 홈 화면에 추가 / 앱 설치 |
| Desktop Chrome / Edge | 주소창 우측 설치 아이콘 클릭 |

---

## Brand Identity (`asterisk*`)

`*` (asterisk)는 ASCII 코드 `42`에 해당한다. 이 숫자는 《은하수를 여행하는 히치하이커를 위한 안내서》에서 "삶, 우주, 그리고 모든 것에 대한 궁극적 해답"으로 제시된 값이다. 동시에 SQL/정규식에서 모든 것을 매칭하는 와일드카드 기호이기도 하다. 

충남과학고등학교 학생들의 일상 정보(`cnsh.life`)부터 소통(`community`)까지 학교생활에 필요한 모든 경험을 하나의 생태계로 연결한다는 의미를 담았다.

---

## License

이 프로젝트의 소스코드는 **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)** 하에 공개되어 있습니다.

- **카피레프트 (Copyleft):** 이 프로젝트의 코드를 포크하거나 수정하여 배포하는 경우, 수정된 작업물 전체 역시 반드시 동일한 AGPL-3.0 라이선스로 소스코드를 공개해야 합니다.
- **네트워크 서비스 제공 의무 (Section 13):** 본 소프트웨어를 수정하여 웹 서버나 네트워크를 통해 서비스(SaaS) 형태로 호스팅하는 경우, 해당 서비스를 이용하는 사용자에게 수정된 전체 소스코드를 다운로드할 수 있는 수단을 무상으로 제공해야 합니다.
- **상표 및 고유 자산 제외:** "asterisk" 브랜드 명칭, 독자 로고 에셋(`public/Concept*.svg`, `public/asterisk-logo.png`), 그리고 학교 고유 정적 데이터셋(`public/afterschool.json`)에 대한 권리는 프로젝트 기여자들에게 귀속되며 AGPL-3.0 라이선스 범위에서 제외됩니다.
- **서체 라이선스 고지 (Font Licenses):**
  - **Asta Sans** — Copyright (c) 2024 The Asta Sans Project Authors ([42dot/Asta-Sans](https://github.com/42dot/Asta-Sans)), licensed under [SIL Open Font License 1.1](https://openfontlicense.org).
  - **Pretendard** — Copyright (c) 2021 Kil Hyung-jin ([orioncactus/pretendard](https://github.com/orioncactus/pretendard)), licensed under [SIL Open Font License 1.1](https://openfontlicense.org).

---

<div align="center">

**asterisk\*** · `cnsh.life` · 충남과학고등학교

</div>
