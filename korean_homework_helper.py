#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
==========================================================================================
  국어 숙제 헬퍼 (Korean Homework Helper)
------------------------------------------------------------------------------------------
  EBS 일타 강사 + NLP 엔지니어 컨셉의 올인원 국어 학습 도우미 (CLI 버전)

  [구성된 4개 모듈]
    A. 비문학(독서) 지문 완전 분석기  : 3줄 요약 / 문단별 주제문 / 핵심 키워드 5개
    B. 맞춤법·띄어쓰기 교정 + 문법 과외 : 교정 문장 / 변경 비교 / 맞춤법 규정 설명
    C. 문학(시·소설) 감상 + 표현 기법 탐지 : 분위기·정서 / 표현 기법 / 주제·작가 의도
    D. 어휘력 향상 + 사자성어·어휘 퀴즈 : 단어 뜻·유의어·반의어 / 3문항 어휘 퀴즈

  [설계 철학]
    1) 확장성  : 기능을 함수/클래스로 모듈화해 두어 새 모듈 추가가 쉽다.
    2) 이식성  : 분석 로직(AnalysisEngine)과 화면 출력(CLI)을 분리 → 나중에 Streamlit으로
                 옮길 때 AnalysisEngine 만 그대로 import 해서 쓰면 된다.
    3) 견고함  : LLM API(고품질)와 오프라인 규칙 기반(무설치·무료)을 모두 지원한다.
                 API 키가 없거나 네트워크가 없어도 프로그램이 죽지 않고 동작한다.

  자세한 설치/실행/활용법은 같은 폴더의 README_KOREAN_HELPER.md 를 참고하세요.
==========================================================================================
"""

# --------------------------------------------------------------------------------------
# [표준 라이브러리 import]
#   - 외부 설치 없이 바로 쓸 수 있는 파이썬 기본 제공 모듈들이다.
#   - 오프라인(무료) 모드는 이 표준 라이브러리만으로 전부 동작한다.
# --------------------------------------------------------------------------------------
import os            # 환경 변수(API 키) 읽기, 화면 지우기 등 OS 기능에 사용
import re            # 정규식: 문장 분리, 단어 추출, 표현 기법 패턴 탐지에 사용
import sys           # 표준 입출력 제어 (여러 줄 입력 종료 처리 등)
import json          # LLM이 돌려준 JSON 형태의 답변을 파싱할 때 사용
import textwrap      # 긴 문장을 화면 너비에 맞게 예쁘게 줄바꿈할 때 사용
import difflib       # '틀린 부분 → 고친 부분'을 글자 단위로 비교/표시할 때 사용
from collections import Counter   # 단어 빈도 계산(키워드 추출)에 사용


# ======================================================================================
#  [환경 설정] - 프로그램 전역에서 공유하는 상수 모음
#  - 한 곳에 모아두면 나중에 모델 변경, 색상 변경 등이 매우 쉽다(확장성).
# ======================================================================================

# LLM(거대언어모델) API에 보낼 기본 모델 이름.
#  - 비용/속도 균형이 좋은 Sonnet 계열을 기본값으로 둔다.
#  - 더 높은 품질이 필요하면 "claude-opus-4-8" 등으로 바꿔도 된다.
DEFAULT_MODEL = "claude-sonnet-4-6"

# API 응답 길이 상한(토큰). 너무 작으면 답변이 잘리고, 너무 크면 비용이 오른다.
MAX_TOKENS = 2000


# ======================================================================================
#  [색상/꾸미기 유틸] - 터미널을 보기 좋게 만들어 학습 몰입도를 높인다.
#  - ANSI 색상 코드는 대부분의 터미널에서 동작한다.
# ======================================================================================
class C:
    """터미널 색상/스타일 코드 모음 (C는 Color의 약자)."""
    RESET = "\033[0m"      # 색상 원상복구
    BOLD = "\033[1m"       # 굵게
    DIM = "\033[2m"        # 흐리게
    RED = "\033[91m"       # 틀린 부분(삭제) 강조용 빨강
    GREEN = "\033[92m"     # 고친 부분(추가) 강조용 초록
    YELLOW = "\033[93m"    # 제목/주의 노랑
    BLUE = "\033[94m"      # 안내 파랑
    CYAN = "\033[96m"      # 메뉴/키워드 청록
    MAGENTA = "\033[95m"   # 강조 자홍


def title(text):
    """섹션 제목을 보기 좋게 박스로 감싸 출력한다 (가독성용 헬퍼)."""
    line = "═" * (len(text) + 4)               # 글자 길이에 맞춰 테두리 길이 계산
    print(f"\n{C.CYAN}{C.BOLD}╔{line}╗{C.RESET}")
    print(f"{C.CYAN}{C.BOLD}║  {text}  ║{C.RESET}")
    print(f"{C.CYAN}{C.BOLD}╚{line}╝{C.RESET}")


def wrap(text, indent="   "):
    """긴 문장을 터미널 너비(약 76자)에 맞춰 줄바꿈하여 가독성을 높인다."""
    # textwrap.fill: 단어 단위로 자동 줄바꿈해 주는 표준 함수
    return textwrap.fill(text, width=76, initial_indent=indent, subsequent_indent=indent)


def read_multiline(prompt_msg):
    """
    여러 줄짜리 긴 지문을 입력받기 위한 함수.
    - 사용자가 지문을 붙여넣은 뒤, 빈 줄에서 'END'(또는 'ㅂ')를 입력하면 입력을 종료한다.
    - 비문학 지문처럼 긴 텍스트를 통째로 받아야 하므로 별도 함수로 분리했다(재사용성).
    """
    print(f"{C.BLUE}{prompt_msg}{C.RESET}")
    print(f"{C.DIM}   (입력을 마치려면 새 줄에 'END' 만 입력하고 Enter를 누르세요){C.RESET}")
    lines = []                                  # 입력된 줄들을 차곡차곡 담을 리스트
    while True:                                 # 'END'가 나올 때까지 계속 받는다
        try:
            line = input()
        except EOFError:                        # Ctrl+D 등으로 입력이 끝난 경우
            break
        if line.strip().upper() == "END":       # 종료 키워드를 만나면 멈춘다
            break
        lines.append(line)                      # 일반 줄은 그대로 저장
    return "\n".join(lines).strip()             # 줄들을 합쳐 하나의 지문 문자열로 반환


# ======================================================================================
#  [LLM 엔진] - Anthropic Claude API를 호출하는 부분
#  - API 키와 라이브러리가 모두 준비되면 '고품질 AI 분석'을 수행한다.
#  - 준비되지 않으면 available=False 가 되어, 각 모듈은 자동으로 '오프라인 규칙 기반'으로
#    대체 동작한다. 덕분에 초보자도 아무 설정 없이 일단 프로그램을 돌려볼 수 있다.
# ======================================================================================
class LLMEngine:
    """Claude API 래퍼. (없으면 자동으로 비활성화되어 오프라인 모드로 빠진다.)"""

    def __init__(self):
        self.client = None          # 실제 API 클라이언트 객체 (없으면 None)
        self.available = False      # API 사용 가능 여부 플래그
        self._try_init()            # 생성과 동시에 초기화 시도

    def _try_init(self):
        """API 키와 anthropic 라이브러리가 있는지 점검하고 클라이언트를 만든다."""
        api_key = os.environ.get("ANTHROPIC_API_KEY")   # 환경 변수에서 키를 읽는다
        if not api_key:
            return                                       # 키가 없으면 조용히 오프라인 모드
        try:
            # anthropic 라이브러리는 'pip install anthropic'로 설치해야 한다.
            from anthropic import Anthropic
            self.client = Anthropic(api_key=api_key)
            self.available = True                        # 여기까지 오면 사용 준비 완료
        except ImportError:
            # 라이브러리가 설치되지 않은 경우 → 오프라인 모드로 동작
            self.available = False

    def ask(self, system_prompt, user_prompt, want_json=False):
        """
        실제로 Claude에게 질문하고 답변 텍스트를 돌려받는 함수.
        - system_prompt: AI에게 부여하는 역할/지침 (예: "너는 국어 강사다")
        - user_prompt  : 분석 대상 지문 등 실제 요청 내용
        - want_json    : True면 결과를 JSON으로 파싱해서 dict로 돌려준다
        - 실패 시 None 을 반환하여, 호출한 쪽이 오프라인 모드로 넘어갈 수 있게 한다.
        """
        if not self.available:
            return None                                  # 애초에 API를 못 쓰는 상태
        try:
            # Messages API 호출: 시스템 지침 + 사용자 메시지를 보낸다.
            resp = self.client.messages.create(
                model=DEFAULT_MODEL,
                max_tokens=MAX_TOKENS,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            text = resp.content[0].text                  # 응답 본문 텍스트 추출
            if want_json:
                return self._parse_json(text)            # JSON 요청이면 파싱해서 반환
            return text
        except Exception as e:
            # 네트워크 오류, 잔액 부족, 키 오류 등 무엇이든 잡아서 오프라인으로 폴백
            print(f"{C.DIM}   (AI 호출 실패 → 오프라인 모드로 전환: {e}){C.RESET}")
            return None

    @staticmethod
    def _parse_json(text):
        """AI 답변 속에서 JSON 부분만 안전하게 뽑아내 dict로 변환한다."""
        # AI가 ```json ... ``` 코드블록으로 감싸 주는 경우가 많아 먼저 그 안을 찾는다.
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


# ======================================================================================
#  [한국어 텍스트 처리용 기초 도구]
#  - 오프라인(무료) 모드에서 문장 분리, 단어 추출 등에 공통으로 쓰는 작은 도구들.
#  - KoNLPy 같은 형태소 분석기 없이도 동작하도록 정규식 기반으로 가볍게 구현했다.
# ======================================================================================

# 키워드 추출 시 제외할 의미 없는 단어(불용어) 목록.
#  - 조사/지시어/접속어 등은 핵심 키워드가 될 수 없으므로 걸러낸다.
STOPWORDS = {
    "그리고", "그러나", "하지만", "그래서", "또한", "이러한", "그러한", "이것",
    "그것", "저것", "때문", "위해", "통해", "대한", "있다", "없다", "한다",
    "된다", "수", "것", "등", "및", "의", "가", "이", "은", "는", "을", "를",
    "에", "에서", "으로", "로", "와", "과", "도", "만", "그", "더", "매우",
    "가장", "같은", "다른", "모든", "어떤", "이런", "저런",
}


def split_sentences(text):
    """텍스트를 문장 단위로 나눈다. (마침표/물음표/느낌표 기준)"""
    # 문장 종결 부호 뒤에서 자르되, 부호 자체는 살려둔다.
    parts = re.split(r"(?<=[.!?。])\s+|\n+", text)
    # 공백만 있는 빈 문장은 버리고, 양옆 공백을 정리해 반환한다.
    return [s.strip() for s in parts if s.strip()]


def split_paragraphs(text):
    """텍스트를 문단 단위로 나눈다. (빈 줄 기준, 없으면 전체를 한 문단으로 취급)"""
    paras = re.split(r"\n\s*\n", text.strip())   # 빈 줄(엔터 두 번)로 문단 구분
    paras = [p.strip() for p in paras if p.strip()]
    return paras if paras else [text.strip()]


# 단어 끝에 자주 붙는 조사 목록. 형태소 분석기(KoNLPy) 없이도 키워드를 깔끔하게
# 뽑기 위해, 단어 뒤의 이 조사들을 잘라내어 '인공지능은' → '인공지능'으로 정규화한다.
JOSA = ("으로서", "으로써", "이라고", "라고", "에서", "에게", "한테", "으로", "처럼",
        "보다", "까지", "부터", "마다", "조차", "마저", "이나", "이란", "은", "는",
        "이", "가", "을", "를", "에", "의", "와", "과", "도", "만", "로", "나", "란")


def strip_josa(word):
    """단어 끝에 붙은 조사를 제거해 핵심 어간만 남긴다. (간이 정규화)"""
    for j in JOSA:                                  # 긴 조사부터 검사(위 목록은 긴 것이 앞쪽)
        # 조사를 떼고도 2글자 이상 남을 때만 잘라낸다(과도한 절단 방지).
        if word.endswith(j) and len(word) - len(j) >= 2:
            return word[: -len(j)]
    return word


def extract_words(text):
    """한글 단어(2글자 이상)만 뽑아서 리스트로 반환한다. (불용어·조사 제거)"""
    # 한글이 2글자 이상 이어진 덩어리만 단어 후보로 본다.
    raw = re.findall(r"[가-힣]{2,}", text)
    words = [strip_josa(w) for w in raw]            # 조사를 떼어 어간 위주로 정규화
    return [w for w in words if w not in STOPWORDS and len(w) >= 2]


# ======================================================================================
#  [모듈 A] 비문학(독서) 지문 완전 분석기
#  - LLM이 있으면 고품질 분석, 없으면 규칙 기반으로 핵심을 뽑아준다.
# ======================================================================================
class NonfictionAnalyzer:
    """비문학 지문을 3줄 요약 + 문단 주제문 + 핵심 키워드로 분석하는 클래스."""

    def __init__(self, llm):
        self.llm = llm                  # LLM 엔진을 주입받아 사용(의존성 주입 → 테스트/교체 쉬움)

    def analyze(self, text):
        """지문을 분석해 결과 dict를 돌려준다. LLM 우선, 실패 시 오프라인."""
        result = self._analyze_with_llm(text)      # 1순위: AI 분석 시도
        if result:
            return result
        return self._analyze_offline(text)         # 2순위: 오프라인 규칙 기반

    def _analyze_with_llm(self, text):
        """Claude에게 비문학 분석을 요청한다 (JSON 형식으로 받기)."""
        system = (
            "너는 EBS 국어 영역 일타 강사이자 독서(비문학) 전문가다. "
            "학생이 준 지문을 분석해 반드시 아래 JSON 스키마로만 답하라.\n"
            '{"summary": ["요약1","요약2","요약3"], '
            '"topics": [{"para": 1, "sentence": "문단 주제문"}], '
            '"keywords": [{"word":"키워드","definition":"쉬운 용어 정의"}]}'
        )
        user = f"다음 비문학 지문을 분석하라. 요약은 정확히 3줄, 키워드는 5개로 하라.\n\n{text}"
        return self.llm.ask(system, user, want_json=True)

    def _analyze_offline(self, text):
        """[무료 대안] 통계 기반으로 요약/주제문/키워드를 추출한다."""
        sentences = split_sentences(text)
        paragraphs = split_paragraphs(text)
        words = extract_words(text)

        # (1) 핵심 키워드: 가장 자주 등장한 단어 상위 5개를 핵심어로 본다.
        freq = Counter(words)
        keywords = [
            {"word": w, "definition": "(오프라인 모드: 사전 정의는 모듈 D 또는 AI 모드에서 제공)"}
            for w, _ in freq.most_common(5)
        ]
        top_words = {w for w, _ in freq.most_common(8)}    # 요약 점수 계산용 상위 단어 집합

        # (2) 3줄 요약: 핵심 단어를 많이 포함한 '대표 문장' 3개를 점수순으로 고른다.
        scored = []
        for s in sentences:
            score = sum(1 for w in extract_words(s) if w in top_words)  # 핵심어 포함 개수
            scored.append((score, s))
        scored.sort(key=lambda x: x[0], reverse=True)      # 점수 높은 순 정렬
        summary = [s for _, s in scored[:3]] if scored else ["(요약할 문장이 부족합니다)"]

        # (3) 문단별 주제문: 각 문단의 첫 문장을 주제문으로 추정한다(두괄식 가정).
        topics = []
        for i, para in enumerate(paragraphs, start=1):
            first = split_sentences(para)
            topics.append({"para": i, "sentence": first[0] if first else para[:50]})

        return {"summary": summary, "topics": topics, "keywords": keywords}

    def render(self, result):
        """분석 결과(dict)를 화면에 보기 좋게 출력한다 (출력 전담 → 화면 로직 분리)."""
        if not result:
            print(f"{C.RED}   분석 결과를 만들지 못했습니다. 지문을 다시 확인해 주세요.{C.RESET}")
            return

        print(f"\n{C.YELLOW}{C.BOLD}📌 [3줄 핵심 요약]{C.RESET}")
        for i, line in enumerate(result.get("summary", []), start=1):
            print(wrap(f"{i}. {line}"))

        print(f"\n{C.YELLOW}{C.BOLD}📑 [문단별 주제문]{C.RESET}")
        for t in result.get("topics", []):
            print(wrap(f"[{t.get('para')}문단] {t.get('sentence')}"))

        print(f"\n{C.YELLOW}{C.BOLD}🔑 [핵심 키워드 5선]{C.RESET}")
        for k in result.get("keywords", []):
            print(f"{C.CYAN}   • {k.get('word')}{C.RESET} : {k.get('definition')}")


# ======================================================================================
#  [모듈 B] 맞춤법·띄어쓰기 교정 + 문법 과외
#  - LLM이 있으면 폭넓은 교정, 없으면 '자주 틀리는 맞춤법 사전'으로 기본 교정.
# ======================================================================================
class SpellChecker:
    """맞춤법/띄어쓰기를 교정하고 '왜 틀렸는지'까지 설명하는 클래스."""

    # [무료 대안용] 한국인이 자주 틀리는 맞춤법 규칙 사전.
    #   형식: 틀린표현 → (고친표현, 근거가 되는 규정/설명)
    #   필요할 때마다 여기에 항목을 추가하면 오프라인 성능이 좋아진다(확장성).
    COMMON_ERRORS = {
        "되요": ("돼요", "한글 맞춤법 제35항: '되어'의 준말은 '돼'. '되-' 뒤에 '요'가 바로 올 수 없습니다."),
        "안되": ("안 돼", "'안'은 부사로 띄어 쓰고, '되어'의 준말 '돼'로 적습니다."),
        "않되": ("안 돼", "'안'(부정 부사)과 '않-'(어간) 혼동. 여기서는 '안 돼'가 맞습니다."),
        "왠만": ("웬만", "'웬만하다'가 표준어입니다. '왠'은 '왠지'에만 씁니다."),
        "왠지": ("왠지", "'왠지'는 '왜인지'의 준말로 올바른 표기입니다.(이것은 맞는 표기)"),
        "웬지": ("왠지", "'왜인지'의 준말이므로 '왠지'가 맞습니다."),
        "되물림": ("대물림", "'대(代)를 물려준다'는 뜻이므로 '대물림'이 맞습니다."),
        "역활": ("역할", "표준어는 '역할(役割)'입니다. '역활'은 비표준어입니다."),
        "어떻해": ("어떻게 해", "'어떻게 해'의 잘못된 줄임. '어떡해'로도 적습니다."),
        "어떻게요": ("어떡해요", "'어떠하게 해요'의 준말은 '어떡해요'입니다."),
        "오랫만": ("오랜만", "'오래간만'의 준말은 '오랜만'입니다."),
        "할께": ("할게", "한글 맞춤법 제53항: 의도·약속의 어미는 '-(으)ㄹ게'로 적습니다."),
        "갈께": ("갈게", "한글 맞춤법 제53항: '-(으)ㄹ게'가 표준 표기입니다."),
        "몇일": ("며칠", "표준어는 '며칠'입니다. '몇 일'로 적지 않습니다."),
        "낳다": ("낫다", "'(병이) 낫다/(더) 낫다'와 '(아이를) 낳다'를 구분하세요. 문맥상 '낫다'일 수 있습니다."),
        "금새": ("금세", "'금시에'의 준말이므로 '금세'가 맞습니다."),
        "구지": ("굳이", "'구태여'의 뜻은 '굳이'로 적습니다."),
        "일일히": ("일일이", "부사 끝의 '이/히'는 '일일이'로 적습니다."),
        "깨끗히": ("깨끗이", "한글 맞춤법 제51항: '깨끗이'처럼 '이'로 적는 경우입니다."),
        "바램": ("바람", "'바라다'의 명사형은 '바람'입니다. '바램'은 비표준어입니다."),
        "설겆이": ("설거지", "표준어는 '설거지'입니다."),
        "느즈막": ("느지막", "표준어는 '느지막하다'입니다."),
    }

    def __init__(self, llm):
        self.llm = llm

    def check(self, text):
        """문장을 교정해 (교정문, [(원본,수정,설명),...]) 형태로 돌려준다."""
        result = self._check_with_llm(text)
        if result:
            return result
        return self._check_offline(text)

    def _check_with_llm(self, text):
        """Claude에게 맞춤법 교정과 규정 설명을 JSON으로 요청한다."""
        system = (
            "너는 국립국어원 어문 규범에 정통한 국어 교정 전문가다. "
            "학생 문장의 맞춤법·띄어쓰기 오류를 모두 교정하고, 반드시 아래 JSON으로만 답하라.\n"
            '{"corrected": "교정된 전체 문장", '
            '"changes": [{"wrong":"틀린부분","right":"고친부분",'
            '"reason":"한글 맞춤법/표준어 규정에 근거한 친절한 설명"}]}'
        )
        user = f"다음 문장을 교정하라:\n\n{text}"
        data = self.llm.ask(system, user, want_json=True)
        if not data:
            return None
        # dict 형식을 통일된 튜플 형태로 변환해 render가 한 가지 형식만 다루게 한다.
        changes = [(c.get("wrong"), c.get("right"), c.get("reason"))
                   for c in data.get("changes", [])]
        return data.get("corrected", text), changes

    def _check_offline(self, text):
        """[무료 대안] 자주 틀리는 맞춤법 사전으로 치환 교정한다."""
        corrected = text
        changes = []
        for wrong, (right, reason) in self.COMMON_ERRORS.items():
            if wrong in corrected and wrong != right:    # 틀린 표현이 실제로 들어 있으면
                corrected = corrected.replace(wrong, right)
                changes.append((wrong, right, reason))
        if not changes:
            # 사전에 걸리는 오류가 없을 때의 안내(완벽 보장이 아님을 명시).
            changes.append(("(검출된 오류 없음)", "(원문 유지)",
                            "오프라인 사전 기준으로는 오류가 없습니다. 더 정밀한 검사는 AI 모드를 권장합니다."))
        return corrected, changes

    def render(self, original, corrected, changes):
        """원본/교정문/변경 비교/규정 설명을 화면에 출력한다."""
        print(f"\n{C.YELLOW}{C.BOLD}✍️  [교정된 전체 문장]{C.RESET}")
        print(wrap(corrected))

        print(f"\n{C.YELLOW}{C.BOLD}🔍 [틀린 부분 → 고친 부분 비교]{C.RESET}")
        # difflib로 원문↔교정문을 글자 단위 비교하여 색으로 직관적으로 표시한다.
        self._render_diff(original, corrected)

        print(f"\n{C.YELLOW}{C.BOLD}📚 [왜 틀렸을까? - 문법 과외]{C.RESET}")
        for wrong, right, reason in changes:
            print(f"   {C.RED}{wrong}{C.RESET} → {C.GREEN}{right}{C.RESET}")
            print(wrap(f"↳ {reason}", indent="      "))

    @staticmethod
    def _render_diff(original, corrected):
        """원문과 교정문을 비교해 삭제(빨강)·추가(초록)를 한 줄로 보여준다."""
        sm = difflib.SequenceMatcher(None, original, corrected)
        out = []
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":                                   # 그대로인 부분
                out.append(original[i1:i2])
            elif tag == "delete":                                # 삭제된(틀린) 부분
                out.append(f"{C.RED}[-{original[i1:i2]}-]{C.RESET}")
            elif tag == "insert":                                # 새로 추가된(고친) 부분
                out.append(f"{C.GREEN}[+{corrected[j1:j2]}+]{C.RESET}")
            elif tag == "replace":                               # 교체(틀림→고침)된 부분
                out.append(f"{C.RED}[-{original[i1:i2]}-]{C.RESET}"
                           f"{C.GREEN}[+{corrected[j1:j2]}+]{C.RESET}")
        print(wrap("".join(out)))


# ======================================================================================
#  [모듈 C] 문학(시·소설) 감상 + 표현 기법 탐지기
#  - LLM이 있으면 깊이 있는 감상, 없으면 표현 기법을 패턴으로 탐지한다.
# ======================================================================================
class LiteratureAnalyzer:
    """시/소설 구절의 분위기·표현 기법·주제를 분석하는 클래스."""

    # [무료 대안용] 표현 기법 탐지 규칙: 기법명 → (정규식 패턴, 설명)
    #   완벽하진 않지만 대표적인 단서를 잡아 학습의 출발점을 만들어 준다.
    DEVICE_PATTERNS = {
        "직유법": (r"같[은이다]|처럼|듯[이ㅎ]|마냥", "'~같이/~처럼/~듯이'로 빗대어 표현하는 기법"),
        "의인법": (r"(꽃|바람|나무|별|산|강|바다|달)[은이가]\s?\S*(운다|웃는다|속삭|노래|손짓)",
                 "사람이 아닌 대상을 사람처럼 표현하는 기법"),
        "설의법": (r"[?？]$|던가|랴|리오|으랴", "의문 형식으로 의미를 강조하는 기법"),
        "반복법": (None, "같은 단어·구절을 반복하여 리듬과 의미를 강조하는 기법"),
        "영탄법": (r"아아|오오|아!|오!|구나|어라", "감탄사·감탄형 어미로 고조된 정서를 드러내는 기법"),
        "대구법": (None, "비슷한 구조의 구절을 나란히 배치하는 기법"),
    }

    # 분위기/정서 추정을 위한 감정 단어 사전 (오프라인 모드용).
    MOOD_WORDS = {
        "슬픔·애상": ["눈물", "슬픔", "이별", "그리움", "외로", "쓸쓸", "서러", "한(恨)", "아픔"],
        "기쁨·희망": ["기쁨", "희망", "빛", "봄", "꽃", "웃음", "설렘", "환희"],
        "그리움·향수": ["고향", "어머니", "추억", "옛", "떠난", "보고싶"],
        "경건·성찰": ["기도", "하늘", "별", "영혼", "참회", "묵상", "고요"],
    }

    def __init__(self, llm):
        self.llm = llm

    def analyze(self, text):
        result = self._analyze_with_llm(text)
        if result:
            return result
        return self._analyze_offline(text)

    def _analyze_with_llm(self, text):
        """Claude에게 문학 감상을 JSON으로 요청한다."""
        system = (
            "너는 문학 평론에 능한 EBS 국어 강사다. 학생이 준 시/소설 구절을 감상 분석해 "
            "반드시 아래 JSON으로만 답하라.\n"
            '{"mood": "분위기·어조·정서 분석", '
            '"devices": [{"name":"표현기법","line":"해당 구절","explain":"설명"}], '
            '"theme": "작품의 주제 및 작가의 의도 추론"}'
        )
        user = f"다음 문학 구절을 감상 분석하라:\n\n{text}"
        return self.llm.ask(system, user, want_json=True)

    def _analyze_offline(self, text):
        """[무료 대안] 감정 단어와 패턴으로 분위기·표현 기법을 추정한다."""
        # (1) 분위기: 감정 단어가 가장 많이 걸리는 정서를 대표 분위기로 본다.
        mood_scores = {}
        for mood, words in self.MOOD_WORDS.items():
            mood_scores[mood] = sum(text.count(w) for w in words)
        best_mood = max(mood_scores, key=mood_scores.get)
        if mood_scores[best_mood] == 0:
            best_mood = "중립적/판단 보류 (감정 단서가 뚜렷하지 않음)"

        # (2) 표현 기법: 패턴이 있는 기법은 정규식으로, 그 외는 구조로 탐지한다.
        devices = []
        lines = [l for l in text.split("\n") if l.strip()]
        for name, (pattern, explain) in self.DEVICE_PATTERNS.items():
            if pattern and re.search(pattern, text):
                matched = next((l for l in lines if re.search(pattern, l)), text[:30])
                devices.append({"name": name, "line": matched.strip(), "explain": explain})
        # 반복법: 같은 줄/단어가 두 번 이상 나오면 탐지
        word_counter = Counter(extract_words(text))
        repeated = [w for w, c in word_counter.items() if c >= 2]
        if repeated:
            devices.append({"name": "반복법", "line": ", ".join(repeated[:3]),
                            "explain": self.DEVICE_PATTERNS["반복법"][1]})

        if not devices:
            devices.append({"name": "(뚜렷한 기법 미검출)", "line": "-",
                            "explain": "오프라인 패턴으로는 못 찾았습니다. 정밀 분석은 AI 모드를 권장합니다."})

        theme = ("오프라인 모드에서는 주제를 단정하기 어렵습니다. "
                 f"감지된 정서('{best_mood}')와 표현 기법을 단서로 직접 추론해 보세요. "
                 "정밀한 주제·작가 의도 분석은 AI 모드에서 제공됩니다.")
        return {"mood": best_mood, "devices": devices, "theme": theme}

    def render(self, result):
        if not result:
            print(f"{C.RED}   분석 결과를 만들지 못했습니다.{C.RESET}")
            return
        print(f"\n{C.YELLOW}{C.BOLD}🎭 [작품의 분위기·어조·정서]{C.RESET}")
        print(wrap(result.get("mood", "-")))

        print(f"\n{C.YELLOW}{C.BOLD}🛠️  [사용된 표현 기법]{C.RESET}")
        for d in result.get("devices", []):
            print(f"{C.CYAN}   • {d.get('name')}{C.RESET}  →  「{d.get('line')}」")
            print(wrap(f"↳ {d.get('explain')}", indent="      "))

        print(f"\n{C.YELLOW}{C.BOLD}💡 [주제 및 작가의 의도]{C.RESET}")
        print(wrap(result.get("theme", "-")))


# ======================================================================================
#  [모듈 D] 어휘력 향상 + 어휘 퀴즈 생성기
#  - 단어 뜻/유의어/반의어 제공 + 지문 기반 3문항 퀴즈 출제.
# ======================================================================================
class VocabularyHelper:
    """단어 학습과 어휘 퀴즈를 담당하는 클래스."""

    # [무료 대안용] 소형 어휘 사전: 단어 → (뜻, 유의어, 반의어)
    #   자주 묻는 단어를 미리 넣어 두면 오프라인에서도 즉답이 가능하다(확장 가능).
    MINI_DICT = {
        "함의": ("말이나 글 속에 담긴 속뜻", ["내포", "속뜻"], ["명시"]),
        "추론": ("이미 아는 것을 바탕으로 미루어 생각해 결론을 내림", ["유추", "추정"], ["단정"]),
        "보편": ("모든 것에 두루 미치거나 통하는 성질", ["일반", "통상"], ["특수", "개별"]),
        "역설": ("겉으론 모순돼 보이나 그 속에 진리를 담은 표현", ["패러독스", "모순"], ["순리"]),
        "함축": ("겉으로 드러나지 않고 안에 간직함", ["내포", "암시"], ["명시", "노출"]),
        "고찰": ("어떤 것을 깊이 생각하고 살펴봄", ["성찰", "검토"], ["방관"]),
        "지양": ("어떤 것을 하지 않음/피함", ["회피", "배제"], ["지향", "추구"]),
        "지향": ("어떤 목표로 뜻이 쏠려 향함", ["추구", "겨냥"], ["지양"]),
    }

    # [무료 대안용] 사자성어 사전: 성어 → 뜻 (퀴즈 출제에 활용)
    IDIOMS = {
        "오리무중": "안개 속에서 길을 잃음. 일의 갈피를 잡을 수 없는 상태.",
        "주마간산": "말을 타고 달리며 산을 봄. 자세히 보지 못하고 대충 지나침.",
        "유비무환": "미리 준비가 되어 있으면 근심이 없음.",
        "타산지석": "남의 하찮은 언행도 자기를 갈고닦는 데 도움이 됨.",
        "온고지신": "옛것을 익히고 그것을 미루어 새것을 앎.",
        "괄목상대": "눈을 비비고 상대를 다시 봄. 실력이 크게 늚.",
    }

    def __init__(self, llm):
        self.llm = llm

    # ---------- (D-1) 단어 의미/유의어/반의어 조회 ----------
    def lookup(self, word):
        """단어 하나의 뜻·유의어·반의어를 dict로 돌려준다."""
        result = self._lookup_with_llm(word)
        if result:
            return result
        return self._lookup_offline(word)

    def _lookup_with_llm(self, word):
        system = (
            "너는 국어사전 편찬자다. 학생이 물어본 단어의 뜻과 유의어·반의어를 "
            "반드시 아래 JSON으로만 답하라.\n"
            '{"word":"단어","definition":"사전적 의미","synonyms":["유의어"],"antonyms":["반의어"]}'
        )
        return self.llm.ask(system, f"단어: {word}", want_json=True)

    def _lookup_offline(self, word):
        if word in self.MINI_DICT:
            meaning, syn, ant = self.MINI_DICT[word]
            return {"word": word, "definition": meaning, "synonyms": syn, "antonyms": ant}
        if word in self.IDIOMS:
            return {"word": word, "definition": self.IDIOMS[word], "synonyms": [], "antonyms": []}
        return {"word": word,
                "definition": "오프라인 사전에 없는 단어입니다. AI 모드를 켜면 어떤 단어든 풀이됩니다.",
                "synonyms": [], "antonyms": []}

    def render_lookup(self, data):
        print(f"\n{C.YELLOW}{C.BOLD}📖 [단어 풀이] {data.get('word')}{C.RESET}")
        print(wrap(f"뜻 : {data.get('definition')}"))
        syn = ", ".join(data.get("synonyms", [])) or "-"
        ant = ", ".join(data.get("antonyms", [])) or "-"
        print(f"{C.GREEN}   유의어:{C.RESET} {syn}")
        print(f"{C.RED}   반의어:{C.RESET} {ant}")

    # ---------- (D-2) 지문 기반 3문항 어휘 퀴즈 ----------
    def make_quiz(self, text):
        """지문에서 어휘 퀴즈 3문항을 생성한다. (LLM 우선)"""
        quiz = self._quiz_with_llm(text)
        if quiz:
            return quiz
        return self._quiz_offline(text)

    def _quiz_with_llm(self, text):
        system = (
            "너는 어휘 평가 문항 출제 전문가다. 주어진 지문의 핵심 어휘로 3문항 퀴즈를 만들어라. "
            "객관식 2문항(보기 4개)과 주관식 1문항을 섞고, 반드시 아래 JSON으로만 답하라.\n"
            '{"questions":[{"type":"객관식","q":"질문","choices":["①..","②..","③..","④.."],'
            '"answer":"정답","explain":"해설"},'
            '{"type":"주관식","q":"질문","answer":"정답","explain":"해설"}]}'
        )
        data = self.llm.ask(system, f"지문:\n{text}", want_json=True)
        return data.get("questions") if data else None

    def _quiz_offline(self, text):
        """[무료 대안] 지문 빈출 단어로 간단한 퀴즈 3문항을 자동 생성한다."""
        words = extract_words(text)
        freq = Counter(words)
        top = [w for w, _ in freq.most_common(5)]      # 지문에서 가장 자주 나온 단어들
        questions = []

        # 1번 문항(주관식): 가장 자주 나온 단어의 뜻을 직접 써 보게 한다.
        if top:
            w = top[0]
            meaning = self.MINI_DICT.get(w, (None,))[0]
            questions.append({
                "type": "주관식",
                "q": f"이 지문에 가장 자주 등장한 핵심어 '{w}'의 의미를 문맥에 맞게 한 문장으로 쓰시오.",
                "answer": meaning or f"'{w}'의 문맥적 의미(지문 근거로 서술)",
                "explain": "지문에서 그 단어가 쓰인 문장을 근거로 의미를 추론하는 연습입니다.",
            })

        # 2번 문항(객관식): 빈출 단어 중 '지문에 등장하지 않은 단어 고르기' 형태.
        if len(top) >= 2:
            distractor = "인공지능"                     # 지문과 무관할 가능성이 높은 오답 후보
            choices = top[:3] + [distractor]
            questions.append({
                "type": "객관식",
                "q": "다음 중 이 지문의 핵심 어휘로 보기 어려운 것은?",
                "choices": [f"{i+1}) {c}" for i, c in enumerate(choices)],
                "answer": f"4) {distractor}",
                "explain": f"'{distractor}'는 지문 빈출어 목록에 없습니다. 나머지는 지문 핵심어입니다.",
            })

        # 3번 문항(객관식): 사자성어 뜻 맞히기 (어휘 확장 학습용).
        idiom = next(iter(self.IDIOMS))
        all_meanings = list(self.IDIOMS.values())
        correct = self.IDIOMS[idiom]
        choices = [correct] + all_meanings[1:4]         # 정답 + 다른 성어 뜻 3개
        questions.append({
            "type": "객관식",
            "q": f"사자성어 '{idiom}'의 뜻으로 옳은 것은?",
            "choices": [f"{i+1}) {c}" for i, c in enumerate(choices)],
            "answer": f"1) {correct}",
            "explain": f"'{idiom}': {correct}",
        })
        return questions

    def render_quiz(self, questions):
        if not questions:
            print(f"{C.RED}   퀴즈를 만들지 못했습니다. 지문이 너무 짧을 수 있습니다.{C.RESET}")
            return
        print(f"\n{C.YELLOW}{C.BOLD}📝 [어휘 퀴즈 3문항]{C.RESET}")
        for i, q in enumerate(questions, start=1):
            print(f"\n{C.BOLD}{i}. ({q.get('type')}) {q.get('q')}{C.RESET}")
            for ch in q.get("choices", []):              # 객관식이면 보기 출력
                print(f"   {ch}")
            # 정답/해설은 학생이 먼저 풀어볼 수 있도록 Enter를 누른 뒤에 보여준다.
            input(f"{C.DIM}   (Enter를 누르면 정답·해설 보기){C.RESET}")
            print(f"   {C.GREEN}정답: {q.get('answer')}{C.RESET}")
            print(wrap(f"해설: {q.get('explain')}", indent="   "))


# ======================================================================================
#  [메인 애플리케이션] - 메뉴 루프와 사용자 상호작용을 담당
#  - 분석 로직(위 클래스들)과 화면 흐름을 여기서 연결한다.
#  - Streamlit으로 옮길 때는 이 App만 다시 쓰고, 위 클래스들은 그대로 재사용하면 된다.
# ======================================================================================
class HomeworkHelperApp:
    """전체 프로그램의 진입점이자 메뉴 컨트롤러."""

    def __init__(self):
        self.llm = LLMEngine()                          # LLM 엔진 1개를 만들어
        self.nonfiction = NonfictionAnalyzer(self.llm)  # 각 모듈에 공유 주입한다.
        self.speller = SpellChecker(self.llm)
        self.literature = LiteratureAnalyzer(self.llm)
        self.vocab = VocabularyHelper(self.llm)

    def banner(self):
        """프로그램 시작 시 한 번 보여주는 인사말 + 현재 동작 모드 안내."""
        title("국어 숙제 헬퍼 (Korean Homework Helper)")
        if self.llm.available:
            mode = f"{C.GREEN}AI 고품질 모드 (Claude API 연결됨){C.RESET}"
        else:
            mode = f"{C.YELLOW}오프라인 무료 모드 (API 키 없음 → 규칙 기반 분석){C.RESET}"
        print(f"   현재 동작 모드: {mode}")
        print(f"{C.DIM}   * AI 모드를 켜려면 환경변수 ANTHROPIC_API_KEY 설정 후 다시 실행하세요.{C.RESET}")

    def menu(self):
        """메인 메뉴를 출력하고 사용자의 선택 번호를 문자열로 반환한다."""
        print(f"\n{C.MAGENTA}{C.BOLD}─────────────── 메인 메뉴 ───────────────{C.RESET}")
        print(f"{C.CYAN}   1.{C.RESET} 비문학(독서) 지문 완전 분석")
        print(f"{C.CYAN}   2.{C.RESET} 맞춤법·띄어쓰기 검사 + 문법 과외")
        print(f"{C.CYAN}   3.{C.RESET} 문학(시·소설) 감상 + 표현 기법 탐지")
        print(f"{C.CYAN}   4.{C.RESET} 어휘 학습 + 어휘 퀴즈 생성")
        print(f"{C.CYAN}   5.{C.RESET} 종료")
        return input(f"{C.BOLD}   원하는 기능의 번호를 입력하세요 > {C.RESET}").strip()

    # ---------- 각 메뉴를 실제로 실행하는 핸들러들 ----------
    def run_nonfiction(self):
        title("모듈 A · 비문학 지문 분석기")
        text = read_multiline("분석할 비문학 지문을 붙여넣으세요:")
        if not text:
            print(f"{C.RED}   입력된 지문이 없습니다.{C.RESET}")
            return
        self.nonfiction.render(self.nonfiction.analyze(text))

    def run_spellcheck(self):
        title("모듈 B · 맞춤법/문법 교정")
        text = read_multiline("검사할 문장(에세이·서술형 답안 등)을 입력하세요:")
        if not text:
            print(f"{C.RED}   입력된 문장이 없습니다.{C.RESET}")
            return
        corrected, changes = self.speller.check(text)
        self.speller.render(text, corrected, changes)

    def run_literature(self):
        title("모듈 C · 문학 감상 분석기")
        text = read_multiline("감상할 시 또는 소설 구절을 입력하세요:")
        if not text:
            print(f"{C.RED}   입력된 작품이 없습니다.{C.RESET}")
            return
        self.literature.render(self.literature.analyze(text))

    def run_vocab(self):
        title("모듈 D · 어휘 학습 + 퀴즈")
        # 어휘 모듈은 두 가지 세부 기능을 가지므로 한 번 더 물어본다.
        print(f"   {C.CYAN}1){C.RESET} 단어 뜻·유의어·반의어 찾기")
        print(f"   {C.CYAN}2){C.RESET} 지문으로 어휘 퀴즈 만들기")
        sub = input(f"{C.BOLD}   선택 > {C.RESET}").strip()
        if sub == "1":
            word = input(f"{C.BLUE}   모르는 단어를 입력하세요 > {C.RESET}").strip()
            if word:
                self.vocab.render_lookup(self.vocab.lookup(word))
        elif sub == "2":
            text = read_multiline("퀴즈를 만들 지문을 붙여넣으세요:")
            if text:
                self.vocab.render_quiz(self.vocab.make_quiz(text))
        else:
            print(f"{C.RED}   1 또는 2를 선택해 주세요.{C.RESET}")

    def run(self):
        """프로그램 메인 루프: 사용자가 5(종료)를 누를 때까지 무한 반복한다."""
        self.banner()
        # 메뉴 번호 → 실행 함수를 딕셔너리로 연결해 if-elif 더미를 줄였다(확장성).
        actions = {
            "1": self.run_nonfiction,
            "2": self.run_spellcheck,
            "3": self.run_literature,
            "4": self.run_vocab,
        }
        while True:                                     # 무한 루프 (요구사항)
            choice = self.menu()
            if choice == "5":                           # 종료 조건
                print(f"\n{C.GREEN}   오늘도 국어 정복! 수고했어요. 👋{C.RESET}\n")
                break
            action = actions.get(choice)                # 선택에 맞는 함수 찾기
            if action:
                try:
                    action()                            # 해당 기능 실행
                except KeyboardInterrupt:               # Ctrl+C는 메뉴로 안전 복귀
                    print(f"\n{C.YELLOW}   작업을 취소하고 메뉴로 돌아갑니다.{C.RESET}")
            else:
                print(f"{C.RED}   1~5 사이의 번호를 입력해 주세요.{C.RESET}")


# --------------------------------------------------------------------------------------
#  [프로그램 시작점]
#  - 이 파일을 직접 실행했을 때만 main()이 돌아가도록 보호한다.
#    (다른 파일에서 import 해서 클래스만 재사용할 때는 자동 실행되지 않음 → 이식성)
# --------------------------------------------------------------------------------------
def main():
    try:
        HomeworkHelperApp().run()
    except (KeyboardInterrupt, EOFError):
        # Ctrl+C/Ctrl+D로 프로그램 전체를 종료할 때 깔끔하게 마무리한다.
        print(f"\n{C.GREEN}   프로그램을 종료합니다. 👋{C.RESET}\n")


if __name__ == "__main__":
    main()
