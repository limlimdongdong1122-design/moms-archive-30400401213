# IMPULSE VAULT — Site Upgrade Brief & Master Prompt
### 3D · 인터랙션 · 신규 기능 추가용 (AI 빌더/개발자에게 그대로 전달 가능)

> 이 문서는 두 부분입니다.
> **A. 그대로 붙여넣는 마스터 프롬프트** (v0 / Cursor / Claude / Lovable / 개발자용, 영어)
> **B. 한국어 보충 — 3D 요구사항 · 기능 우선순위 · 플러그인 · 디자인 가이드**

현재 사이트의 브랜드 토큰(반드시 유지):
- 배경 `#0a0a0c`, elev `#141519` / `#1b1d22`
- 액센트 `#6ea8ff` (glow `rgba(110,168,255,0.35)`), warn `#c2a98e`
- 텍스트 `#eceef3` / dim `#a6acb8` / faint `#868d99`
- 글래스: `rgba(255,255,255,0.045)` + border `rgba(255,255,255,0.09)` + `backdrop-filter: blur(20px)`
- 폰트: 디스플레이 **Space Grotesk**, 본문 **Inter**
- 라운드: 10 / 16 / 22 / 999px · 부드러운 ease, aurora drift 애니메이션
- 스택: 정적 사이트 + Cloudflare Pages `_worker.js` (빌드 무겁게 X), EN/KO i18n 이미 존재, 100% 프라이버시(서드파티 트래커 금지)

---

## A. MASTER PROMPT (copy-paste, English)

> **Role.** You are a senior creative front-end engineer. Upgrade the existing
> landing site for **IMPULSE VAULT** — a privacy-first browser extension that
> stops impulse buying. Make it feel *premium, distinctive, and alive* with real
> **3D (WebGL / Three.js)** and tasteful motion, WITHOUT breaking the current
> brand, performance, or privacy guarantees.
>
> **Keep the brand.** Dark theme, background `#0a0a0c`; accent `#6ea8ff` with a
> blue glow; Space Grotesk (display) + Inter (body); glassmorphism cards with
> `backdrop-filter: blur(20px)`; soft pill buttons with the existing gradient;
> rounded corners 10/16/22/999; aurora drift background. Reuse the existing CSS
> custom properties — do not invent a new palette.
>
> **Hard constraints.**
> 1. Stays a **static site deployable on Cloudflare Pages** (no SSR required). A
>    light client-side build (Vite) is OK, but the output must be static assets.
> 2. **Performance budget:** Largest Contentful Paint < 2.5s on mid-tier mobile;
>    total 3D payload (lib + assets) **≤ 350 KB gzip**, lazy-loaded and
>    code-split so it never blocks first paint.
> 3. **Accessibility & motion:** fully honor `prefers-reduced-motion` (swap every
>    3D/parallax animation for a static poster image); keep WCAG AA contrast;
>    keyboard-navigable; the 3D canvas is decorative (`aria-hidden`).
> 4. **Privacy:** no third-party trackers, no external fonts beyond what's
>    already used, no analytics that phone home. Self-host all assets.
> 5. **Graceful fallback:** if WebGL is unavailable or the device is low-power,
>    render the current CSS/SVG hero instead. Detect with a quick capability +
>    `deviceMemory`/`hardwareConcurrency` check.
> 6. **Bilingual:** every new string must work with the existing EN/KO i18n
>    (`data-ko` attributes + the language switch). Provide both languages.
>
> **The 3D hero (centerpiece).** Replace the CSS "vault dome" with a real
> Three.js scene: a softly glowing **3D vault/orb** (a faceted sphere or a stylized
> safe-door) floating in space, with:
> - subtle **bloom** post-processing (UnrealBloomPass) tuned low, ACES tone mapping;
> - a slow idle rotation + **pointer-parallax** (camera/orb tilts toward cursor,
>   damped); on scroll, the orb opens slightly / coins drift out to imply "saved money";
> - a thin particle field / floating "coins" in the accent color, instanced for perf;
> - environment lighting that matches the dark blue palette (no HDR file needed —
>   use a couple of point/area lights + a gradient backdrop).
> Provide a low-poly fallback and a static poster `hero-poster.webp`.
>
> **Add these sections/features** (build in this priority order; see list B):
> implement P0 fully, scaffold P1, leave clean TODO hooks for P2.
>
> **Deliverables.** (1) Updated `index.html` + modular JS/CSS (or a small Vite
> project) with the Three.js hero and new sections; (2) a `/3d/` module that is
> lazy-imported; (3) a poster image fallback; (4) updated `_worker.js` only if
> new routes are needed; (5) a short README on how to build/deploy to Cloudflare
> and how to swap the 3D model. Keep code commented and match the existing code
> style. Do not add a backend; do not add trackers.

---

## B. 한국어 보충 문서

### B-1. 3D 디자인 요구사항 (요구사항 정리)

**핵심 컨셉:** "금고(vault)에 돈이 쌓인다" — 절약을 시각적 보상으로.

| 항목 | 요구사항 |
|---|---|
| 엔진 | **Three.js** (또는 React면 @react-three/fiber + drei) |
| 히어로 오브젝트 | 빛나는 3D 금고/오브(faceted sphere or safe-door). 천천히 회전 + 커서 패럴랙스(damping) |
| 포스트프로세싱 | **UnrealBloomPass** (약하게), ACES Filmic tone mapping, `outputColorSpace = sRGB` |
| 파티클 | 액센트색 코인/입자 필드, **InstancedMesh**로 성능 확보 |
| 스크롤 인터랙션 | 스크롤 시 금고가 살짝 열리고 코인이 흘러나옴(= "saved money") |
| 조명 | HDR 없이 point/area light 2~3개 + 그라데이션 배경 (다크 블루 톤 일치) |
| 성능 예산 | 3D 총량 **≤ 350KB gzip**, lazy-load + code-split, 60fps 목표 |
| 폴백 | WebGL 불가/저사양 → 기존 CSS/SVG 히어로 + `hero-poster.webp` 정적 이미지 |
| 접근성 | `prefers-reduced-motion` 시 모든 3D/패럴랙스 → 정적 포스터, canvas는 `aria-hidden` |
| 모바일 | 저사양 감지(`deviceMemory`,`hardwareConcurrency`) → 저폴리 또는 정적 |

**금지:** 무거운 HDR/대용량 GLB(>1MB), 메인스레드 블로킹, 외부 CDN 폰트 추가, 트래커.

---

### B-2. 기능 추가 아이디어 (우선순위)

#### P0 — 전환율에 직접 영향 (먼저 구현)
1. **3D 히어로** (위 사양) — 첫인상·차별화의 핵심.
2. **인터랙티브 "절약 계산기"** — 슬라이더로 "한 달에 충동구매 몇 번 × 평균 금액" → 연간 절약액을 3D 코인 더미가 차오르며 카운트업. 강력한 설득 도구.
3. **라이브 오버레이 데모** — 실제 확장 개입 화면을 사이트 안에서 클릭 체험("Try it"). 가짜 상품 카드 → "Pause" 오버레이 → impulse score 애니메이션.
4. **애니메이션 통계 카운터** — 스크롤 진입 시 숫자 카운트업(절약액/저항 횟수/스트릭), `IntersectionObserver`.

#### P1 — 신뢰·완성도 (그다음)
5. **스크롤리텔링 "How it works"** — 단계별로 3D 오브가 변형되는 GSAP ScrollTrigger 시퀀스.
6. **가격 카드 3D 틸트 + 월/연 토글** — VanillaTilt, BEST VALUE 배지, PayPal 월/연 연결 유지.
7. **FAQ 아코디언** + **프라이버시 강조 섹션**(100% on-device 비주얼).
8. **대시보드/배지 미리보기** — 스트릭·세이빙 골·배지 캐러셀(이미 있는 v1.2 기능 노출).

#### P2 — 나중에 (훅만 남겨두기)
9. **"Regret Oracle" 미니 위젯** — 입력하면 후회확률 % 보여주는 인터랙티브(별도 프로젝트 재활용).
10. 공개 절약 리더보드 / 공유 가능한 스트릭 카드(OG 이미지 생성).
11. 라이트/다크 토글, 다국어 확장(현재 EN/KO).

---

### B-3. 플러그인 / 라이브러리 연동 (권장)

| 용도 | 추천 | 비고 |
|---|---|---|
| 3D | **three** (+ `examples/jsm` postprocessing) | React면 `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing` |
| 스크롤 애니메이션 | **GSAP + ScrollTrigger** | 스크롤리텔링·카운터 |
| 부드러운 스크롤 | **Lenis** | 선택, 모션 절제 |
| 파티클(경량) | **tsParticles** 또는 three InstancedMesh | 메인 히어로는 three로 통일 권장 |
| 카드 틸트 | **VanillaTilt.js** | 가벼움 |
| 마이크로 애니 | **Lottie** (lottie-web) | 아이콘 모션, 용량 주의 |
| 빌드 | **Vite** | 정적 출력 → Cloudflare Pages |

**연동 원칙:** 전부 **self-host**(npm 번들), 외부 CDN/트래커 금지. lazy-import로 초기 페인트 비차단. 라이선스 MIT/유사 확인.

---

### B-4. 디자인 가이드라인

- **색 사용:** 배경 다크 + 액센트 `#6ea8ff`는 "강조 1곳" 규칙(버튼/글로우/3D 림라이트). 남발 금지. warn `#c2a98e`는 경고/충동 맥락에만.
- **타이포:** 헤드라인 Space Grotesk(letter-spacing 음수, tight), 본문 Inter. 위계 명확히.
- **모션 원칙:** 빠르고 절제 있게(150~400ms, ease-out). 패럴랙스/3D는 "은은하게". 과한 흔들림·블러 전환 금지(이전 광고 피드백 반영).
- **글래스/깊이:** 카드 inner highlight + soft shadow 유지. 3D와 2D UI는 분리(텍스트는 항상 또렷).
- **간격 스케일:** 4의 배수(8/12/16/24/36/48). 섹션 상하 여백 넉넉히.
- **접근성:** 대비 WCAG AA, 포커스 링 유지, `prefers-reduced-motion` 필수 대응, 3D는 장식(aria-hidden).
- **성능:** LCP<2.5s, 3D ≤350KB gzip, 이미지 webp/avif, 폰트 preload, 자바스크립트 code-split.
- **프라이버시 일관성:** "100% on-device" 브랜드 약속과 모순되는 외부 분석/픽셀 절대 금지.

---

### 완료 체크리스트
- [x] 마스터 프롬프트 초안 (A) — 그대로 전달 가능
- [x] 3D 요소 요구사항 정리 (B-1)
- [x] 기능 아이디어 목록 + P0/P1/P2 우선순위 (B-2)
- [x] 플러그인 연동 + 디자인 가이드 문서화 (B-3, B-4)

**사용법:** A 섹션을 v0/Cursor/Claude 등에 붙여넣고, 필요하면 B의 우선순위표를 함께 첨부하세요. 단계적으로 "P0만 먼저" 요청 → 확인 후 P1 진행을 권장합니다.
