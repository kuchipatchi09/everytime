import React, { useState } from "react";
import ReactDOM, { Root } from "react-dom/client";
import { $ } from "../utils/dom";
import "../styles/brand.css";

interface MonochromeToken {
  name: string;
  koreanName: string;
  hex: string;
  desc: string;
  isBase: boolean;
  contrastText: string;
}

const monochromeTokens: MonochromeToken[] = [
  {
    name: "Absolute Ink Black",
    koreanName: "앱솔루트 잉크 블랙",
    hex: "#000000",
    desc: "워드마크와 헤드라인, 고대비 반전 컴포넌트에 사용되는 칠흑색",
    isBase: true,
    contrastText: "#F7F6F2",
  },
  {
    name: "Carbon Steel",
    koreanName: "카본 스틸",
    hex: "#1C1C1E",
    desc: "솔리드 버튼 및 액티브 상태의 하우징 표면을 정의하는 깊은 암색",
    isBase: false,
    contrastText: "#F7F6F2",
  },
  {
    name: "Graphite Division",
    koreanName: "그라파이트 디비전",
    hex: "#48484A",
    desc: "1px 정밀 보더라인 및 데이터 그리드 축을 구분하는 기준선",
    isBase: false,
    contrastText: "#F7F6F2",
  },
  {
    name: "Muted Telemetry",
    koreanName: "뮤티드 텔레메트리",
    hex: "#8E8E93",
    desc: "인덱스 번호, 보조 메타데이터, 파라미터 수치 전용",
    isBase: false,
    contrastText: "#000000",
  },
  {
    name: "Silver Mist",
    koreanName: "실버 미스트",
    hex: "#D1D1D6",
    desc: "비활성 상태의 분할선 및 소프트 호버 인터랙션 라인",
    isBase: false,
    contrastText: "#000000",
  },
  {
    name: "Warm Vellum Plate",
    koreanName: "웜 벨럼 플레이트",
    hex: "#EBE9E1",
    desc: "기본 캔버스와 미세하게 대비되는 컨테이너 서피스 음영",
    isBase: false,
    contrastText: "#000000",
  },
  {
    name: "Base Paper White",
    koreanName: "베이스 페이퍼 화이트",
    hex: "#F7F6F2",
    desc: "물리적 인쇄 용지의 질감을 살린 asterisk* 메인 캔버스 배경색",
    isBase: true,
    contrastText: "#000000",
  },
];

const ArrowLeftIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
  </svg>
);

const ArrowUpRightIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 7h10v10" /><path d="M7 17 17 7" />
  </svg>
);

const CheckIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const CopyIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const BrandHeroCard: React.FC = () => (
  <div className="brand-hero-card">
    <div className="brand-hero-main-row">
      <div className="brand-hero-left">
        <h1>
          The Answer to<br />
          Campus Life,<br />
          and Everything.
        </h1>
      </div>

      <div className="brand-hero-right">
        <div className="brand-hero-wordmark">
          <div>aste</div>
          <div className="brand-hero-wordmark-bottom">
            <span>risk</span>
            <span className="brand-hero-asterisk">*</span>
          </div>
        </div>
      </div>
    </div>

    <div className="brand-hero-footer-bar">
      <div>Typography: Asta Sans × Pretendard</div>
      <div>Palette: #F7F6F2 & #000000</div>
    </div>
  </div>
);

export function BrandComponent({ onReturnMain }: { onReturnMain: () => void }) {
  const [activeTab, setActiveTab] = useState<"story" | "design">("story");
  const [copiedInfo, setCopiedInfo] = useState<{ hex: string; name: string } | null>(null);
  const [selectedColor, setSelectedColor] = useState<MonochromeToken>(monochromeTokens[0]);

  const copyHex = (hex: string, name: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(hex);
    }
    setCopiedInfo({ hex, name });
    setTimeout(() => setCopiedInfo(null), 2000);
  };

  return (
    <div className="brand-view-wrap">
      {copiedInfo && (
        <div className="brand-toast">
          <div className="brand-toast-swatch" style={{ backgroundColor: copiedInfo.hex }}></div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <CheckIcon size={14} />
            <span>* COPIED: <strong>{copiedInfo.hex}</strong> ({copiedInfo.name})</span>
          </div>
        </div>
      )}

      {/* Top Tab Bar */}
      <div className="brand-nav-bar">
        <div className="brand-nav-buttons">
          <button
            onClick={() => setActiveTab("story")}
            className={`brand-nav-btn ${activeTab === "story" ? "active" : ""}`}
          >
            * BRAND STORY
          </button>
          <button
            onClick={() => setActiveTab("design")}
            className={`brand-nav-btn ${activeTab === "design" ? "active" : ""}`}
          >
            DESIGN SYSTEM
          </button>
        </div>

        <div className="brand-nav-badge">
          asterisk* IDENTITY
        </div>
      </div>

      {/* Tab: Story */}
      {activeTab === "story" && (
        <div style={{ marginBottom: "48px" }}>
          <BrandHeroCard />

          <div className="brand-story-title-row">
            <h2>The Story of asterisk*</h2>
          </div>

          <div className="brand-chapters-container">
            {/* Chapter 01 */}
            <div className="brand-chapter-block">
              <div className="brand-chapter-meta">CHAPTER 01</div>
              <div className="brand-chapter-content">
                <h3>은하계의 궁극적 해답에서 시작된 기호</h3>
                <div className="brand-quote-box">
                  "The Answer to the Ultimate Question of Life, the Universe, and Everything is... Forty-two."
                  <br />— Douglas Adams, 《The Hitchhiker's Guide to the Galaxy》
                </div>
                <div className="brand-prose-wrap">
                  <p className="brand-text-p">
                    SF 문학의 고전 《은하수를 여행하는 히치하이커를 위한 안내서》에서 슈퍼컴퓨터 '깊은 생각'이 750만 년 동안 연산한 끝에 내놓은 삶, 우주, 그리고 모든 것에 대한 궁극적 해답은 단지 <strong>'42'</strong>였습니다.
                  </p>
                  <p className="brand-text-p">
                    컴퓨터 과학의 초석인 ASCII 코드 테이블에서 42번째 자리를 확인하면, 바로 별 모양의 기호인 <strong>애스터리스크(*)</strong>가 자리잡고 있습니다.
                  </p>
                  <p className="brand-text-p">
                    우연처럼 맞물린 이 발견은 서비스의 모티브가 되었습니다. 수많은 포털 사이트, 분산된 강의실 공지, 흩어진 커뮤니티 속에서 혼란을 겪는 학생들에게 <code>asterisk*</code>는 캠퍼스라는 소우주 속에서 던져지는 모든 질문에 대한 명쾌한 기준점이자 해답이 되고자 합니다.
                  </p>
                </div>
              </div>
            </div>

            {/* Chapter 02 */}
            <div className="brand-chapter-block">
              <div className="brand-chapter-meta">CHAPTER 02</div>
              <div className="brand-chapter-content">
                <h3>모든 캠퍼스 데이터를 아우르는 와일드카드</h3>
                <div className="brand-prose-wrap">
                  <p className="brand-text-p">
                    프로그래밍 언어와 데이터베이스에서 <code>*</code> 기호는 모든 조건을 아우르는 <strong>와일드카드(Wildcard)</strong> 문자로서 <strong>‘모든 것(Everything)’</strong>을 의미합니다.
                  </p>
                  <ul className="brand-features-list">
                    <li><span>*</span> <span>TIMETABLE & CLASSROOMS (시간표 및 강의실 동선)</span></li>
                    <li><span>*</span> <span>CAFETERIA NUTRITION (일일 급식 및 식단 정보)</span></li>
                    <li><span>*</span> <span>ACADEMIC NOTICE & CALENDAR (학사 일정 및 주요 공지)</span></li>
                    <li><span>*</span> <span>CAMPUS FORUM & DIALOGUE (실시간 학생 커뮤니티)</span></li>
                  </ul>
                  <p className="brand-text-p">
                    <code>asterisk*</code>는 흩어져 있던 학교의 기능들을 단 하나의 정밀한 캔버스 위에 집약합니다. 학생들이 매일 생활하며 마주하는 모든 일상을 빈틈없이 불러와 가장 직관적인 형태로 렌더링합니다.
                  </p>
                </div>
              </div>
            </div>

            {/* Chapter 03 */}
            <div className="brand-chapter-block">
              <div className="brand-chapter-meta">CHAPTER 03</div>
              <div className="brand-chapter-content">
                <h3>결정적인 각주, 그리고 본질만을 남긴 흑백의 미학</h3>
                <div className="brand-prose-wrap">
                  <p className="brand-text-p">
                    문서 조판에서 <code>*</code>는 본문 아래 숨겨진 중요한 진실을 짚어주는 <strong>각주(Footnote)</strong> 기호입니다. 거대한 본문 속에서 정작 일상을 지탱하는 중요한 정보는 사소한 각주에 적혀 있듯, 수강신청 마감 시각, 강의실 긴급 변경, 식당 특식 메뉴 같은 작지만 결정적인 순간들을 선명하게 비춥니다.
                  </p>
                  <p className="brand-text-p">
                    이러한 정보를 가장 정확하게 전달하기 위해 우리는 화려한 시각적 장식을 배제했습니다. 실제 인쇄 용지의 감촉을 담은 <strong>Base Paper White (#F7F6F2)</strong>와 선명한 가독성을 보장하는 <strong>Absolute Ink Black (#000000)</strong>의 흑백 팔레트 위에 1px의 정밀한 그리드만을 설계했습니다.
                  </p>
                </div>
              </div>
            </div>

            {/* Epilogue */}
            <div className="brand-epilogue-box">
              <div className="brand-epilogue-header">DON'T PANIC</div>
              <div className="brand-epilogue-body">
                《히치하이커를 위한 안내서》 표지에 커다랗고 친절하게 적혀 있던 문구처럼, 낯선 시간표와 쏟아지는 과제 앞에서도 당황하지 마세요. 주머니 속의 <code>asterisk*</code>가 당신의 캠퍼스 라이프, 그리고 그 모든 것에 대한 가장 명쾌한 안내서가 되어줄 것입니다.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Design System */}
      {activeTab === "design" && (
        <div style={{ marginBottom: "48px" }}>
          <BrandHeroCard />

          {/* SECTION 01: COLOR SYSTEM */}
          <div style={{ marginBottom: "56px" }}>
            <div className="brand-section-head">
              <h2>Achromatic Color System</h2>
              <p>{copiedInfo ? `복사 완료: ${copiedInfo.hex}` : "색상 행을 클릭하여 상세 스펙 확인 및 HEX 복사"}</p>
            </div>

            <div className="brand-colors-grid">
              <div
                className="brand-color-main-card"
                style={{
                  backgroundColor: selectedColor.hex,
                  color: selectedColor.contrastText,
                }}
              >
                <div>
                  <h3>{selectedColor.name}</h3>
                  <div className="brand-color-korean-name">{selectedColor.koreanName}</div>
                  <p className="brand-color-desc">{selectedColor.desc}</p>
                </div>

                <div className="brand-color-bottom-bar">
                  <span>{selectedColor.hex}</span>
                  <button
                    onClick={() => copyHex(selectedColor.hex, selectedColor.name)}
                    className="brand-copy-action-btn"
                  >
                    {copiedInfo?.hex === selectedColor.hex ? (
                      <>
                        <CheckIcon size={14} />
                        <span>COPIED</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon size={14} />
                        <span>COPY HEX</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="brand-color-list-card">
                <div>
                  <div className="brand-color-list-title">COLOR TOKENS</div>
                  <div className="brand-color-items-stack" style={{ marginTop: "10px" }}>
                    {monochromeTokens.map((item, idx) => {
                      const isSelected = selectedColor.hex === item.hex;
                      return (
                        <div
                          key={idx}
                          onClick={() => setSelectedColor(item)}
                          className={`brand-color-row-item ${isSelected ? "active" : ""}`}
                        >
                          <div className="brand-color-row-left">
                            <span className="brand-chip-sq" style={{ backgroundColor: item.hex }}></span>
                            <span style={{ fontWeight: 500 }}>{item.name}</span>
                          </div>

                          <div className="brand-color-row-right">
                            <span style={{ opacity: 0.8 }}>{item.hex}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyHex(item.hex, item.name);
                              }}
                              className="brand-icon-btn"
                              title="Copy HEX"
                            >
                              {copiedInfo?.hex === item.hex ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-graphite)", paddingTop: "8px", borderTop: "1px solid var(--color-black)" }}>
                  <span>Canvas: #F7F6F2</span>
                  <span>Ink: #000000</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 02: TYPOGRAPHY */}
          <div style={{ marginBottom: "56px" }}>
            <div className="brand-section-head">
              <h2>Asta Sans & Pretendard System</h2>
            </div>

            <div className="brand-typo-section">
              {/* Wordmark & Display */}
              <div className="brand-typo-row">
                <div className="brand-typo-label">Wordmark & Display</div>
                <div className="brand-typo-body">
                  <div style={{ fontWeight: 300, letterSpacing: "-0.06em", lineHeight: 0.85, fontSize: "2.5rem" }}>
                    <div>aste</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                      <span>risk</span>
                      <span style={{ fontSize: "0.85em", fontWeight: 400 }}>*</span>
                    </div>
                  </div>

                  <div style={{ paddingTop: "12px", borderTop: "1px solid rgba(0,0,0,0.15)" }}>
                    <div style={{ fontSize: "1.3rem", fontWeight: 300, letterSpacing: "-0.03em" }}>
                      The Answer to Campus Life, and Everything.
                    </div>
                    <div style={{ fontSize: "12.5px", color: "var(--color-graphite)", marginTop: "4px" }}>
                      Every timetable, cafeteria menu, notice, and conversation in one place.
                    </div>
                  </div>
                </div>
              </div>

              {/* Latin: Asta Sans Weights */}
              <div className="brand-typo-row">
                <div className="brand-typo-label">Asta Sans (Latin)</div>
                <div className="brand-typo-body">
                  <div className="brand-weights-demo">
                    <div style={{ fontWeight: 300 }}>Light 300 — Asta Sans Extended Specimen</div>
                    <div style={{ fontWeight: 400 }}>Regular 400 — Asta Sans Extended Specimen</div>
                    <div style={{ fontWeight: 500 }}>Medium 500 — Asta Sans Extended Specimen</div>
                    <div style={{ fontWeight: 600 }}>SemiBold 600 — Asta Sans Extended Specimen</div>
                    <div style={{ fontWeight: 700 }}>Bold 700 — Asta Sans Extended Specimen</div>
                  </div>

                  <div className="brand-glyph-box">
                    <div>ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
                    <div>abcdefghijklmnopqrstuvwxyz</div>
                    <div>0 1 2 3 4 5 6 7 8 9</div>
                    <div style={{ color: "var(--color-graphite)" }}>
                      {"* # $ % & @ / \\ ( ) [ ] { } < > + - = _ ~ ^ ` ' \" : ; , . ? ! |"}
                    </div>
                  </div>

                  <div className="brand-pangram-text">
                    <div style={{ color: "var(--color-black)" }}>
                      The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.
                    </div>
                    <div style={{ fontSize: "11px", marginTop: "4px", opacity: 0.8 }}>
                      ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝßàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ
                    </div>
                  </div>
                </div>
              </div>

              {/* CJK: Pretendard */}
              <div className="brand-typo-row">
                <div className="brand-typo-label">Pretendard (CJK)</div>
                <div className="brand-typo-body">
                  <div className="brand-weights-demo">
                    <div style={{ fontWeight: 300 }}>Light 300 — 캠퍼스 라이프의 모든 해답</div>
                    <div style={{ fontWeight: 400 }}>Regular 400 — 캠퍼스 라이프의 모든 해답</div>
                    <div style={{ fontWeight: 500 }}>Medium 500 — 캠퍼스 라이프의 모든 해답</div>
                    <div style={{ fontWeight: 600 }}>SemiBold 600 — 캠퍼스 라이프의 모든 해답</div>
                    <div style={{ fontWeight: 700 }}>Bold 700 — 캠퍼스 라이프의 모든 해답</div>
                  </div>

                  <div className="brand-glyph-box">
                    <div>ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ / ㅏ ㅑ ㅓ ㅕ ㅗ ㅛ ㅜ ㅠ ㅡ ㅣ</div>
                    <div>가나다라마바사아자차카타파하 거너더러머버서어저처커터퍼허</div>
                  </div>

                  <div className="brand-pangram-text">
                    아스키코드 마흔둘, 애스터리스크는 고요한 우주 속을 유영하며 찬란한 이야기와 참된 해답을 품은 별빛 같다.
                  </div>
                </div>
              </div>

              {/* Achromatic Swatches */}
              <div className="brand-typo-row">
                <div className="brand-typo-label">Achromatic Swatches</div>
                <div className="brand-typo-body">
                  <div className="brand-swatches-grid">
                    {monochromeTokens.map((token, idx) => (
                      <div
                        key={idx}
                        className="brand-swatch-cell"
                        style={{
                          backgroundColor: token.hex,
                          color: token.contrastText,
                        }}
                      >
                        <div className="brand-swatch-cell-hex">{token.hex}</div>
                        <div className="brand-swatch-cell-name">{token.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Bar */}
      <div className="brand-bottom-bar">
        <button onClick={onReturnMain} className="brand-return-btn">
          <span style={{ fontWeight: 700, fontSize: "14px" }}>*</span>
          <ArrowLeftIcon size={14} />
          <span>RETURN TO MAIN OVERVIEW</span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--color-black)" }}>
            <span>asterisk* Docs</span>
            <ArrowUpRightIcon size={12} />
          </span>
          <span>asterisk*</span>
        </div>
      </div>
    </div>
  );
}

let brandRootInstance: Root | null = null;

export function renderBrand(onReturnMain: () => void): void {
  const contentEl = $("#content");
  if (!contentEl) return;

  contentEl.innerHTML = `<div id="brand-root-container"></div>`;
  const container = document.getElementById("brand-root-container");
  if (!container) return;

  if (brandRootInstance) {
    brandRootInstance.unmount();
    brandRootInstance = null;
  }

  brandRootInstance = ReactDOM.createRoot(container);
  brandRootInstance.render(<BrandComponent onReturnMain={onReturnMain} />);
}
