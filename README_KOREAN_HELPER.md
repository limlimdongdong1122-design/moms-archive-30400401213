# 📚 국어 숙제 헬퍼 (Korean Homework Helper)

지문 분석 · 맞춤법 검사 · 문학 감상 · 어휘 퀴즈를 한 번에 해결하는 **파이썬 기반 올인원 국어 학습 도우미**입니다.
EBS 일타 강사 + NLP 엔지니어 컨셉으로, **터미널(CLI)** 에서 바로 쓰고 나중에 **웹(Streamlit)** 으로도 확장할 수 있게 설계했습니다.

---

## ✨ 4개 모듈 한눈에 보기

| 메뉴 | 모듈 | 하는 일 |
|------|------|---------|
| 1 | **A. 비문학 분석기** | 3줄 핵심 요약 · 문단별 주제문 추출 · 핵심 키워드 5개 |
| 2 | **B. 맞춤법/문법 과외** | 교정 문장 출력 · `틀린부분→고친부분` 비교 · 맞춤법 규정 설명 |
| 3 | **C. 문학 감상 분석기** | 분위기·정서 분석 · 표현 기법 탐지 · 주제·작가 의도 추론 |
| 4 | **D. 어휘 + 퀴즈 생성기** | 단어 뜻·유의어·반의어 · 지문 기반 3문항 퀴즈(정답·해설 포함) |

---

## 🚀 1분 만에 실행하기 (설치 없이!)

```bash
python3 korean_homework_helper.py
```

> 외부 라이브러리를 **하나도 설치하지 않아도** `오프라인 무료 모드`로 모든 기능이 동작합니다.
> (규칙 기반 알고리즘 + 내장 맞춤법/어휘/사자성어 사전 사용)

실행하면 메인 메뉴가 **무한 루프**로 뜨고, `5`번을 누르면 종료됩니다.

---

## 🤖 AI 고품질 모드 켜기 (강력 추천)

오프라인 모드는 "맛보기"입니다. **진짜 똑똑한 분석**은 Claude API를 연결했을 때 나옵니다.

### 1단계 — 라이브러리 설치
```bash
pip install -r requirements_korean_helper.txt
# 또는: pip install anthropic
```

### 2단계 — API 키 발급
[Anthropic Console](https://console.anthropic.com/) 에서 API 키를 발급받습니다.

### 3단계 — 환경변수에 키 등록
```bash
# macOS / Linux
export ANTHROPIC_API_KEY="sk-ant-xxxxxxxx"

# Windows (PowerShell)
setx ANTHROPIC_API_KEY "sk-ant-xxxxxxxx"
```

### 4단계 — 다시 실행
```bash
python3 korean_homework_helper.py
```
상단에 `현재 동작 모드: AI 고품질 모드 (Claude API 연결됨)` 이 뜨면 성공입니다. 🎉

> 💡 키가 없거나 네트워크가 끊겨도 프로그램은 **죽지 않고** 자동으로 오프라인 모드로 전환됩니다.

---

## 🆓 무료로 더 똑똑하게 쓰는 대안

- **API 비용이 부담될 때** → 그냥 오프라인 모드를 쓰세요. 요약/주제문/맞춤법 사전/퀴즈가 전부 무료로 돕니다.
- **띄어쓰기를 더 정밀하게** → `PyKoSpacing`(주석 참고), **키워드 고도화** → `KoNLPy`(JDK 필요)를 설치해 확장할 수 있습니다.
- **내장 사전 키우기** → `korean_homework_helper.py` 안의 `COMMON_ERRORS`, `MINI_DICT`, `IDIOMS` 딕셔너리에 항목을 추가하면 오프라인 성능이 바로 좋아집니다.

---

## 💯 200% 활용하는 꿀팁

1. **지문 붙여넣기** → 입력을 마칠 땐 새 줄에 `END` 만 치고 Enter. (여러 줄/여러 문단 OK)
2. **숙제 루틴** → ① 모듈 A로 지문 뼈대 잡기 → ② 모듈 D로 모르는 단어 정리 → ③ 모듈 D 퀴즈로 자가 점검.
3. **서술형 답안 쓰고 나서** → 모듈 B에 붙여넣어 제출 전 맞춤법/문법 셀프 검토.
4. **시·소설 감상문** → 모듈 C로 표현 기법·주제를 먼저 잡고, 내 감상을 덧붙이면 완성도가 올라갑니다.
5. **퀴즈는 먼저 풀고** → 정답·해설은 Enter를 눌러야 나오니, 스스로 풀어본 뒤 확인하세요.

---

## 🧩 구조 & 확장성 (개발자용)

- 분석 로직(`NonfictionAnalyzer`, `SpellChecker`, `LiteratureAnalyzer`, `VocabularyHelper`)과
  화면 흐름(`HomeworkHelperApp`)이 **분리**되어 있습니다.
- **Streamlit 전환 시**: 위 분석 클래스들을 그대로 `import` 해서 버튼/입력창에 연결만 하면 됩니다.
  ```python
  from korean_homework_helper import LLMEngine, NonfictionAnalyzer
  ```
- 모든 모듈은 `LLM 우선 → 실패 시 오프라인 폴백` 구조라 어떤 환경에서도 끊김 없이 동작합니다.

---

> 만든 목적: 매번 하는 국어 숙제를 **분석·교정·감상·암기**까지 한 자리에서 끝내기. 오늘도 국어 정복! 💪
