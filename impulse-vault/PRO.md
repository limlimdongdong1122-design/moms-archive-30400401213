# IMPULSE VAULT — Free vs Pro (수익화 설계)

구독 수익화(ExtensionPay/Stripe) 설계 문서. **무료는 강력하게 유지**해서 입소문의
엔진으로 쓰고, **Pro는 "키 없이 켜지는 AI 분석"**을 핵심 가치로 판다.

> 핵심 프레임: 이 앱은 *돈을 아껴주는* 도구다. 그래서 "한 번만 충동구매를 참아도
> 본전"이라는 메시지가 가장 강력하다. 구독료(₩3,900)보다 더 아껴준다는 게 눈에 보이면 팔린다.

---

## 1. 기능 분리표

| 기능 | Free | Pro |
| --- | :---: | :---: |
| 결제 순간 부드러운 개입 (저항 모달) | ✅ | ✅ |
| 금고(쿨다운) · 아낀 돈 카운터 | ✅ | ✅ |
| 충동 프로필 (시간대·요일·키워드·사이트) | ✅ | ✅ |
| **규칙 기반** 냉정한 구매 분석(스코어카드) | ✅ | ✅ |
| AI 분석 — **본인 API 키(BYOK)** | ✅ | ✅ |
| **AI 분석 — 키 없이 바로 (관리형)** | — | ✅ |
| **웹검색 기반** 더 싼 대안·리뷰·known issue | — | ✅ |
| 그라운드 데이터 기반 더 똑똑한 AI 개입 | — | ✅ |
| 100% 로컬 데이터 · 내보내기 · 전체 삭제 | ✅ | ✅ |
| (예정) 월간 절약 리포트 · 목표 저축 | — | ✅ |
| (예정) 금고 상품 가격 추적 (PRICE SCOUT 엔진) | — | ✅ |

**왜 "관리형 AI"가 Pro의 핵심인가**
- 무료 사용자의 99%는 자기 API 키를 만들지 않는다 → AI를 못 쓴다.
- Pro는 그 마찰을 없앤다: 키 없이 그냥 켜진다(서버 프록시가 비용 부담).
- 당신에게 **매달 API 비용**이 나간다 = 매달 받는 구독료가 자연스럽게 정당화된다.
- 그리고 이 기능이 **실제로 돈을 더 아껴줘서** 결제 명분이 분명하다.

> 공정한 무료 티어: 규칙 기반 분석과 BYOK는 무료로 남긴다. "AI를 막았다"가 아니라
> "키 없이 편하게 + 웹검색까지"를 파는 것.

---

## 2. 가격

- **월 ₩3,900** (커피 한 잔 값 프레임)
- **연 ₩29,000** (≈ 38% 할인, 2개월 무료 효과)
- **7일 무료 체험** → 첫 분석의 "와" 경험을 먼저 주고 결제로 전환

`utils/pro.js`의 `PRICE / ANNUAL / TRIAL_DAYS` 한 곳에서 관리.

---

## 3. 아키텍처 (코드 어디에 무엇이)

```
utils/pro.js        IVPro — "이 사용자 Pro인가?"의 단일 진실 공급원.
                    ExtPay 결과를 chrome.storage.local(iv_pro)에 캐시.
lib/ExtPay.js       ExtensionPay 라이브러리. 지금은 안전한 STUB(전원 Free).
                    실제 파일로 교체하면 결제가 즉시 활성화.
background.js       ExtPay 초기화 + onPaid 리스너 → syncPro()로 캐시 갱신.
                    aiAvailability(): BYOK=무료, 관리형 프록시=Pro 규칙을 인코딩.
                    메시지: GET_PRO / REFRESH_PRO / OPEN_PAYMENT / OPEN_TRIAL / SET_DEV_PRO
dashboard/          'Pro 멤버십' 패널(블루) + 설정의 AI Pro-lock 안내 + 데모 토글.
```

게이팅은 **2중 방어**:
1. `aiAvailability()`가 메시지 핸들러(ANALYZE_AI / FIND_ALTERNATIVES)에서 먼저 막고,
2. `callAi()`의 관리형 프록시 분기 안에서도 `IVPro.isPro()`를 한 번 더 확인한다.

UI는 ExtPay를 직접 모른다 — 오직 `IVPro`에게 "Pro냐"만 묻는다. 그래서 결제
제공자를 바꿔도 UI는 그대로다.

---

## 4. 지금 상태 / 데모

- `lib/ExtPay.js`는 **STUB**이라 현재는 **전원 무료**다(결제 안 일어남, 앱은 완전 동작).
- 대시보드 **Pro 멤버십** 패널의 **데모 토글**로, 결제 연동 전에도 Pro 잠금 기능
  (키 없는 AI·웹검색)을 직접 체험할 수 있다. (이 기기에서만, 실제 결제 아님)

---

## 5. 실제 결제 켜기 (약 10분, 한 번만)

1. **https://extensionpay.com** 에서 확장 등록 → 공개 "extension id"를 받는다.
2. `utils/pro.js`의 `EXTPAY_ID = 'impulse-vault'`를 받은 id로 교체.
3. 공식 라이브러리로 `lib/ExtPay.js`를 **교체**:
   ```bash
   npm install extpay
   cp node_modules/extpay/dist/ExtPay.js impulse-vault/lib/ExtPay.js
   ```
   (또는 ExtPay 대시보드/GitHub `Glench/ExtPay`에서 받기)
4. `manifest.json`은 이미 준비됨:
   - `permissions: ["storage", …]` ✅
   - `host_permissions: ["https://extensionpay.com/*"]` ✅
5. ExtensionPay 대시보드에서 **요금제(월 ₩3,900 / 연 ₩29,000)와 7일 체험**을 설정하고
   Stripe 계정을 연결.
6. `chrome://extensions`에서 리로드 → 결제가 라이브된다. 코드 변경은 **이 두 곳뿐**
   (`EXTPAY_ID` + `lib/ExtPay.js` 파일 교체).

> 교체 후엔 데모 토글이 자동으로 숨겨지고(`__EXTPAY_STUB__`가 사라짐), 실제
> `getUser().paid` 값으로 Pro가 결정된다.

---

## 6. 로드맵 (Pro 가치 더 쌓기)

1. **월간 절약 리포트** — 이번 달 아낀 돈·패턴·연 환산 예상액·연속 기록(streak).
2. **목표 저축** — "보낸 돈"을 여행·비상금 목표로 시각화(게임화) → 해지율↓.
3. **금고 상품 가격 추적** — 방금 만든 PRICE SCOUT의 adapters·price 엔진을 흡수해
   "참길 잘했지(가격이 안 떨어졌어요)" 같은 사후 피드백 제공.
4. **가족·동반자 모드** — 통계 공유로 ARPU↑.
