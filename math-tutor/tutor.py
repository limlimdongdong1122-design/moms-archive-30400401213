#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
수학 튜터 (Math Tutor)
======================

내가 모르는 수학 문제를 입력하면, sympy로 정답을 계산하고
단계별 풀이를 한국어로 아주 자세히 설명해 주는 프로그램.

사용법
------
1) 대화형 모드:
       python3 tutor.py

2) 한 문제 바로 풀기:
       python3 tutor.py "solve x^2 - 5x + 6 = 0"
       python3 tutor.py "diff sin(x)*x^2"
       python3 tutor.py "integrate x^2 + 3x"
       python3 tutor.py "factor x^2 - 9"

명령어 종류
-----------
  solve      방정식 풀기            예) solve 2x + 3 = 7
  system     연립방정식 풀기         예) system x+y=3; x-y=1
  diff       미분                  예) diff x^3 + sin(x)
  integrate  적분(부정적분)          예) integrate 1/x
  defint     정적분                예) defint x^2 from 0 to 2
  limit      극한                  예) limit sin(x)/x as x to 0
  factor     인수분해               예) factor x^2 - 5x + 6
  expand     전개                  예) expand (x+1)^3
  simplify   식 정리               예) simplify (x^2-1)/(x-1)
  evaluate   값 계산               예) evaluate 2^10 + sqrt(144)

명령어를 생략하면 자동으로 추측합니다.
  ('=' 가 있으면 solve, 그 외에는 simplify/evaluate 등)
"""

import sys
import re
import sympy as sp

x, y, z, t, n = sp.symbols('x y z t n')
DEFAULT_SYMS = {'x': x, 'y': y, 'z': z, 't': t, 'n': n}


# ---------------------------------------------------------------------------
# 입력 전처리: 사람이 쓰는 표기를 sympy가 이해하는 표기로 변환
# ---------------------------------------------------------------------------
def normalize(expr_str: str) -> str:
    """'^' -> '**', '2x' -> '2*x', '3(x+1)' -> '3*(x+1)' 등 보정."""
    s = expr_str.strip()
    s = s.replace('^', '**')
    # 숫자 뒤에 바로 변수/괄호가 오면 곱셈 기호 삽입: 2x -> 2*x, 3( -> 3*(
    s = re.sub(r'(\d)\s*([a-zA-Z(])', r'\1*\2', s)
    # 닫는 괄호 뒤에 변수/숫자/여는 괄호: )x -> )*x, )( -> )*(
    s = re.sub(r'(\))\s*([a-zA-Z0-9(])', r'\1*\2', s)
    # 변수 뒤에 바로 여는 괄호인데 함수가 아닌 경우는 위험하므로 건드리지 않음
    return s


def parse(expr_str: str):
    return sp.sympify(normalize(expr_str), locals=DEFAULT_SYMS)


def pretty(e) -> str:
    return sp.pretty(e, use_unicode=True)


def header(title: str) -> str:
    return f"\n{'=' * 60}\n  {title}\n{'=' * 60}"


# ---------------------------------------------------------------------------
# 각 풀이 함수: (정답, 단계별 풀이 문자열) 을 반환
# ---------------------------------------------------------------------------
def solve_equation(arg: str):
    steps = []
    if '=' in arg:
        left_s, right_s = arg.split('=', 1)
        left, right = parse(left_s), parse(right_s)
        steps.append(f"① 주어진 방정식:\n   {pretty(sp.Eq(left, right))}")
        eq = left - right
        steps.append(f"② 모든 항을 좌변으로 이항 (우변 = 0 꼴):\n   {pretty(eq)} = 0")
    else:
        eq = parse(arg)
        steps.append(f"① 식 = 0 으로 둡니다:\n   {pretty(eq)} = 0")

    syms = sorted(eq.free_symbols, key=lambda s: s.name)
    if not syms:
        return sp.simplify(eq), "\n\n".join(steps) + "\n\n변수가 없어 풀 수 없습니다."
    var = syms[0]

    # 다항식이면 인수분해 과정 보여주기
    poly = sp.Poly(eq, var) if eq.is_polynomial(var) else None
    if poly is not None:
        deg = poly.degree()
        steps.append(f"③ 이것은 {var}에 대한 {deg}차 방정식입니다.")
        factored = sp.factor(eq)
        if factored != eq:
            steps.append(f"④ 좌변을 인수분해:\n   {pretty(factored)} = 0")
            steps.append("⑤ 각 인수를 0으로 두고 풉니다 (AB=0 ⇒ A=0 또는 B=0).")
        if deg == 2:
            a, b, c = poly.all_coeffs() + [0] * (3 - len(poly.all_coeffs()))
            a, b, c = poly.all_coeffs()[0], (poly.all_coeffs()[1] if deg >= 1 else 0), (poly.all_coeffs()[2] if len(poly.all_coeffs()) > 2 else 0)
            disc = sp.simplify(b**2 - 4*a*c)
            steps.append(f"   (참고) 근의 공식 판별식 D = b²-4ac = {pretty(disc)}")

    sols = sp.solve(eq, var, dict=False)
    sols = [sp.nsimplify(s) if s.is_number else s for s in sols]
    steps.append(f"⑥ 따라서 해는:\n   " + ",  ".join(f"{var} = {pretty(s)}" for s in sols))

    # 검산
    check_lines = []
    for s in sols:
        val = sp.simplify(eq.subs(var, s))
        check_lines.append(f"   {var}={pretty(s)} 대입 → {pretty(val)} (={'0, OK' if val == 0 else '확인필요'})")
    steps.append("⑦ 검산:\n" + "\n".join(check_lines))
    return sols, "\n\n".join(steps)


def solve_system(arg: str):
    parts = re.split(r'[;,]', arg)
    eqs = []
    steps = ["① 주어진 연립방정식:"]
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if '=' in p:
            l, r = p.split('=', 1)
            e = sp.Eq(parse(l), parse(r))
        else:
            e = sp.Eq(parse(p), 0)
        eqs.append(e)
        steps.append(f"   {pretty(e)}")
    syms = sorted(set().union(*[e.free_symbols for e in eqs]), key=lambda s: s.name)
    steps.append(f"② 미지수: {', '.join(s.name for s in syms)}")
    sol = sp.solve(eqs, list(syms), dict=True)
    steps.append("③ 소거법/대입법으로 연립하여 풀면:")
    if sol:
        for d in sol:
            steps.append("   " + ",  ".join(f"{k} = {pretty(v)}" for k, v in d.items()))
    else:
        steps.append("   해가 없습니다.")
    return sol, "\n\n".join(steps)


def differentiate(arg: str):
    expr = parse(arg)
    var = sorted(expr.free_symbols, key=lambda s: s.name)[0] if expr.free_symbols else x
    steps = [f"① 미분할 함수: f({var}) = {pretty(expr)}",
             f"② {var}에 대해 미분합니다 (d/d{var})."]
    # 항별로 보여주기
    if expr.is_Add:
        steps.append("③ 합의 미분 = 각 항의 미분의 합:")
        for term in expr.as_ordered_terms():
            steps.append(f"   d/d{var}[{pretty(term)}] = {pretty(sp.diff(term, var))}")
    deriv = sp.diff(expr, var)
    steps.append(f"④ 정리한 도함수:\n   f'({var}) = {pretty(sp.simplify(deriv))}")
    return deriv, "\n\n".join(steps)


def integrate_indef(arg: str):
    expr = parse(arg)
    var = sorted(expr.free_symbols, key=lambda s: s.name)[0] if expr.free_symbols else x
    steps = [f"① 적분할 함수: {pretty(expr)}",
             f"② {var}에 대한 부정적분 ∫ ... d{var} 을 구합니다."]
    if expr.is_Add:
        steps.append("③ 합의 적분 = 각 항의 적분의 합:")
        for term in expr.as_ordered_terms():
            steps.append(f"   ∫ {pretty(term)} d{var} = {pretty(sp.integrate(term, var))}")
    res = sp.integrate(expr, var)
    steps.append(f"④ 따라서 (C는 적분상수):\n   ∫ {pretty(expr)} d{var} = {pretty(res)} + C")
    return res, "\n\n".join(steps)


def integrate_def(arg: str):
    m = re.search(r'(.+?)\s+from\s+(.+?)\s+to\s+(.+)$', arg, re.IGNORECASE)
    if not m:
        return None, "형식: defint <식> from <아래끝> to <위끝>"
    body, lo, hi = m.group(1), parse(m.group(2)), parse(m.group(3))
    expr = parse(body)
    var = sorted(expr.free_symbols, key=lambda s: s.name)[0] if expr.free_symbols else x
    F = sp.integrate(expr, var)
    val = sp.integrate(expr, (var, lo, hi))
    steps = [
        f"① 정적분: ∫[{pretty(lo)} → {pretty(hi)}] {pretty(expr)} d{var}",
        f"② 먼저 부정적분 F({var}) = {pretty(F)}",
        f"③ 미적분 기본정리로 F(위끝) - F(아래끝):",
        f"   F({pretty(hi)}) - F({pretty(lo)}) = {pretty(sp.simplify(F.subs(var, hi)))} - {pretty(sp.simplify(F.subs(var, lo)))}",
        f"④ 정답: {pretty(val)}  (≈ {sp.N(val, 6)})",
    ]
    return val, "\n\n".join(steps)


def do_limit(arg: str):
    m = re.search(r'(.+?)\s+as\s+(\w+)\s+to\s+(.+)$', arg, re.IGNORECASE)
    if m:
        body, vname, target = m.group(1), m.group(2), m.group(3)
    else:
        body, vname, target = arg, 'x', '0'
    expr = parse(body)
    var = DEFAULT_SYMS.get(vname, x)
    tgt = sp.oo if target.strip() in ('oo', 'inf', 'infinity', '∞') else parse(target)
    L = sp.limit(expr, var, tgt)
    steps = [
        f"① 극한: lim({var}→{pretty(tgt)}) {pretty(expr)}",
        f"② {var}에 {pretty(tgt)}를 직접 대입했을 때 부정형(0/0, ∞/∞ 등)인지 확인합니다.",
        f"③ 필요한 경우 인수분해/유리화/로피탈 정리를 적용합니다.",
        f"④ 극한값: {pretty(L)}",
    ]
    return L, "\n\n".join(steps)


def do_factor(arg: str):
    expr = parse(arg)
    res = sp.factor(expr)
    steps = [f"① 주어진 식: {pretty(expr)}",
             f"② 인수분해 결과:\n   {pretty(res)}"]
    return res, "\n\n".join(steps)


def do_expand(arg: str):
    expr = parse(arg)
    res = sp.expand(expr)
    steps = [f"① 주어진 식: {pretty(expr)}",
             f"② 전개 결과:\n   {pretty(res)}"]
    return res, "\n\n".join(steps)


def do_simplify(arg: str):
    expr = parse(arg)
    res = sp.simplify(expr)
    steps = [f"① 주어진 식: {pretty(expr)}",
             f"② 정리(약분/통분/정돈) 결과:\n   {pretty(res)}"]
    return res, "\n\n".join(steps)


def do_evaluate(arg: str):
    expr = parse(arg)
    exact = sp.simplify(expr)
    steps = [f"① 식: {pretty(expr)}",
             f"② 정확한 값: {pretty(exact)}"]
    try:
        steps.append(f"③ 근삿값: {sp.N(exact, 10)}")
    except Exception:
        pass
    return exact, "\n\n".join(steps)


# ---------------------------------------------------------------------------
# 디스패처
# ---------------------------------------------------------------------------
COMMANDS = {
    'solve': solve_equation,
    'system': solve_system,
    'diff': differentiate,
    'derivative': differentiate,
    'integrate': integrate_indef,
    'defint': integrate_def,
    'limit': do_limit,
    'factor': do_factor,
    'expand': do_expand,
    'simplify': do_simplify,
    'evaluate': do_evaluate,
    'eval': do_evaluate,
}

TITLES = {
    'solve': '방정식 풀이', 'system': '연립방정식 풀이', 'diff': '미분',
    'derivative': '미분', 'integrate': '부정적분', 'defint': '정적분',
    'limit': '극한', 'factor': '인수분해', 'expand': '전개',
    'simplify': '식 정리', 'evaluate': '값 계산', 'eval': '값 계산',
}


def guess_command(text: str) -> str:
    """명령어를 생략했을 때 자동 추측."""
    low = text.lower()
    if ';' in text and '=' in text:
        return 'system'
    if '=' in text:
        return 'solve'
    return 'evaluate' if not re.search(r'[a-zA-Z]', text) else 'simplify'


def run_one(line: str) -> str:
    line = line.strip()
    if not line:
        return ''
    parts = line.split(None, 1)
    cmd = parts[0].lower()
    if cmd in COMMANDS:
        arg = parts[1] if len(parts) > 1 else ''
    else:
        cmd = guess_command(line)
        arg = line
    try:
        answer, steps = COMMANDS[cmd](arg)
    except Exception as e:
        return f"⚠️  풀이 중 오류: {e}\n   입력 표기를 확인해 주세요. (예: x^2-5x+6=0)"
    out = header(TITLES.get(cmd, cmd))
    out += "\n\n" + steps
    out += "\n\n" + "-" * 60 + f"\n  ✅ 최종 정답: {answer}\n"
    return out


BANNER = """\
┌────────────────────────────────────────────┐
│           📐  수학 튜터 (Math Tutor)         │
│   문제를 입력하면 정답과 단계별 풀이를 알려줘요   │
│   도움말: help   /   종료: quit              │
└────────────────────────────────────────────┘"""


def interactive():
    print(BANNER)
    while True:
        try:
            line = input("\n문제 ▶ ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n안녕히 가세요!")
            break
        if line.lower() in ('quit', 'exit', 'q', '종료'):
            print("안녕히 가세요!")
            break
        if line.lower() in ('help', '도움말', '?'):
            print(__doc__)
            continue
        if line:
            print(run_one(line))


def main():
    if len(sys.argv) > 1:
        print(run_one(' '.join(sys.argv[1:])))
    else:
        interactive()


if __name__ == '__main__':
    main()
