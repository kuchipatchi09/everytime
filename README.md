<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/Concept.svg">
  <source media="(prefers-color-scheme: light)" srcset="public/Concept.svg">
  <img alt="asterisk" src="public/Concept.svg" width="120">
</picture>

# asterisk\*

**충남과학고등학교 통합 학교생활 포털**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Deploy](https://img.shields.io/badge/Deploy-GitHub%20Pages-222?style=flat-square&logo=githubpages&logoColor=white)](https://asteris.kro.kr)
[![PWA](https://img.shields.io/badge/PWA-Installable-5a0fc8?style=flat-square&logo=pwa&logoColor=white)](#pwa-설치)

[**asteris.kro.kr**](https://asteris.kro.kr)

</div>

---

## Open Graph Preview

GitHub이나 메신저에서 링크 공유 시 아래 메타데이터가 렌더링됩니다.

| Property | Value |
| :--- | :--- |
| `og:title` | asterisk |
| `og:description` | 시간표, 방과후, 급식, 공지까지 충곽의 하루를 한곳에서 확인하세요. |
| `og:image` | [`/asterisk-logo.png`](public/asterisk-logo.png) (1200px PNG) |
| `og:type` | website |
| `og:locale` | ko_KR |
| `twitter:card` | summary_large_image |

> 메타 태그 원본: [`index.html`](index.html) L8-L25

---

## Overview

asterisk\*는 충남과학고등학교 학생들이 시간표, 급식, 공지사항, 방과후 수업 등 교내 정보를 단일 인터페이스에서 조회할 수 있도록 설계된 SPA 기반 웹 포털이다. 서버 없이 클라이언트 사이드에서 외부 API를 직접 호출하며, PWA로 설치하여 네이티브 앱과 동일한 UX를 제공한다.

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

```
asterisk/
├── index.html                 # SPA 엔트리 + OG/Twitter 메타 태그
├── brand.html                 # 브랜드 스토리 페이지 엔트리
├── vite.config.ts             # Vite 설정 + Yahoo Finance 프록시 미들웨어
├── tsconfig.json
├── package.json
│
├── public/
│   ├── manifest.webmanifest   # PWA 매니페스트
│   ├── afterschool.json       # 방과후 정적 데이터
│   ├── Concept.svg            # 로고 SVG
│   ├── asterisk-logo.png      # OG 이미지
│   ├── favicon.svg
│   └── CNAME                  # GitHub Pages 커스텀 도메인
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
| Font | Pretendard, Asta Sans | CDN 로드 |
| Hosting | GitHub Pages | 커스텀 도메인 `asteris.kro.kr` |
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

`dist/` 디렉토리에 정적 파일이 생성되며, GitHub Pages로 직접 배포 가능.

---

## PWA 설치

별도 앱스토어 없이 브라우저에서 홈 화면에 추가하면 독립 앱으로 실행된다.

| Platform | Method |
| :--- | :--- |
| iOS Safari | 공유 > 홈 화면에 추가 |
| Android Chrome | 메뉴(⋮) > 홈 화면에 추가 / 앱 설치 |
| Desktop Chrome / Edge | 주소창 우측 설치 아이콘 클릭 |

---

## Naming

`*` (asterisk)는 ASCII 코드 `42`에 해당한다. 이 숫자는 《은하수를 여행하는 히치하이커를 위한 안내서》에서 "삶, 우주, 그리고 모든 것에 대한 궁극적 해답"으로 제시된 값이다. 동시에 SQL/정규식에서 모든 것을 매칭하는 와일드카드 기호이기도 하다. 학교생활에 필요한 모든 정보를 하나로 모은다는 의미를 담았다.

---

<div align="center">

`asteris.kro.kr` · 충남과학고등학교

</div>
