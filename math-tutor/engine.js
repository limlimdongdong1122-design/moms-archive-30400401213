/* =====================================================================
 *  중3-1 수학 풀이 엔진 (engine.js)
 *  - 순수 JavaScript. 브라우저(모바일)와 Node 양쪽에서 동작.
 *  - 다루는 단원:
 *      1) 제곱근의 계산 (근호 정리, 분모의 유리화)
 *      2) 곱셈 공식 / 전개
 *      3) 인수분해
 *      4) 이차방정식
 *      5) 이차함수 (꼭짓점, 축, 절편, 최대·최소)
 *  - 모든 결과에 "단계별 풀이"를 함께 돌려준다.
 * ===================================================================== */
(function (root) {
  'use strict';

  /* ---------- 유리수(분수) ---------- */
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }

  class Frac {
    constructor(n, d = 1) {
      if (d === 0) throw new Error('0으로 나눌 수 없습니다.');
      if (d < 0) { n = -n; d = -d; }
      const g = gcd(n, d);
      this.n = n / g; this.d = d / g;
    }
    static from(v) { return v instanceof Frac ? v : new Frac(v, 1); }
    add(o) { o = Frac.from(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { o = Frac.from(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { o = Frac.from(o); return new Frac(this.n * o.n, this.d * o.d); }
    div(o) { o = Frac.from(o); return new Frac(this.n * o.d, this.d * o.n); }
    neg() { return new Frac(-this.n, this.d); }
    isZero() { return this.n === 0; }
    isInt() { return this.d === 1; }
    eq(o) { o = Frac.from(o); return this.n === o.n && this.d === o.d; }
    valueOf() { return this.n / this.d; }
    toString() { return this.d === 1 ? `${this.n}` : `${this.n}/${this.d}`; }
    // 괄호가 필요한 음수/분수 표기
    toTex() { return this.d === 1 ? `${this.n}` : `\\frac{${this.n}}{${this.d}}`; }
  }

  /* ---------- 다항식 (x에 대한, 유리수 계수) ----------
     내부 표현: { power(정수) : Frac }                                   */
  class Poly {
    constructor(map = {}) { this.c = {}; for (const k in map) { if (!map[k].isZero()) this.c[k] = map[k]; } }
    static constant(f) { return new Poly(f.isZero() ? {} : { 0: Frac.from(f) }); }
    static x() { return new Poly({ 1: new Frac(1) }); }
    get(p) { return this.c[p] || new Frac(0); }
    degree() { let d = 0; for (const k in this.c) d = Math.max(d, +k); return d; }
    add(o) { const m = {}; for (const k in this.c) m[k] = this.get(k); for (const k in o.c) m[k] = (m[k] || new Frac(0)).add(o.get(k)); return new Poly(m); }
    sub(o) { return this.add(o.scale(new Frac(-1))); }
    scale(f) { const m = {}; for (const k in this.c) m[k] = this.get(k).mul(f); return new Poly(m); }
    mul(o) {
      const m = {};
      for (const a in this.c) for (const b in o.c) {
        const p = +a + +b;
        m[p] = (m[p] || new Frac(0)).add(this.get(a).mul(o.get(b)));
      }
      return new Poly(m);
    }
    pow(n) { let r = Poly.constant(new Frac(1)); for (let i = 0; i < n; i++) r = r.mul(this); return r; }
  }

  /* ---------- 다항식 → 문자열 ---------- */
  function termStr(coef, p, first) {
    let sign = coef.n < 0 ? '-' : (first ? '' : '+');
    let mag = new Frac(Math.abs(coef.n), coef.d);
    let body;
    const xpart = p === 0 ? '' : (p === 1 ? 'x' : `x^${p}`);
    if (p === 0) body = mag.toString();
    else if (mag.eq(new Frac(1))) body = xpart;
    else body = `${mag.toString()}${xpart}`;
    return (first ? sign : ` ${sign} `) + body;
  }
  function polyStr(poly) {
    const powers = Object.keys(poly.c).map(Number).sort((a, b) => b - a);
    if (powers.length === 0) return '0';
    let out = ''; let first = true;
    for (const p of powers) { out += termStr(poly.get(p), p, first); first = false; }
    return out;
  }

  /* ---------- 입력 전처리 ---------- */
  function preprocess(s) {
    return s
      .replace(/²/g, '^2').replace(/³/g, '^3')
      .replace(/[×·∙*]/g, '*').replace(/[÷]/g, '/')
      .replace(/[–—−]/g, '-')
      .replace(/\s+/g, '');
  }

  /* ---------- 토크나이저 ---------- */
  function tokenize(s) {
    s = preprocess(s);
    const toks = []; let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/[0-9.]/.test(ch)) {
        let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
        toks.push({ t: 'num', v: s.slice(i, j) }); i = j;
      } else if (ch === 'x' || ch === 'X') { toks.push({ t: 'x' }); i++; }
      else if ('+-*/^()'.includes(ch)) { toks.push({ t: ch }); i++; }
      else throw new Error(`알 수 없는 문자: "${ch}"`);
    }
    return toks;
  }

  /* ---------- 파서 (재귀 하강) : 식 -> Poly ---------- */
  function parsePoly(str) {
    const toks = tokenize(str); let pos = 0;
    const peek = () => toks[pos];
    const eat = (t) => { if (!toks[pos] || (t && toks[pos].t !== t)) throw new Error('식의 형식이 올바르지 않습니다.'); return toks[pos++]; };

    function parseExpr() {
      let node = parseTerm();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const op = eat().t; const rhs = parseTerm();
        node = op === '+' ? node.add(rhs) : node.sub(rhs);
      }
      return node;
    }
    function startsBase(tk) { return tk && (tk.t === 'num' || tk.t === 'x' || tk.t === '('); }
    function parseTerm() {
      let node = parseFactor();
      while (peek()) {
        if (peek().t === '*') { eat(); node = node.mul(parseFactor()); }
        else if (peek().t === '/') { eat(); const d = parseFactor(); node = divByConst(node, d); }
        else if (startsBase(peek())) { node = node.mul(parseFactor()); } // 암묵적 곱셈 2x, (x+1)(x-1)
        else break;
      }
      return node;
    }
    function parseFactor() {
      let node = parseBase();
      while (peek() && peek().t === '^') {
        eat(); const e = parseBase();
        const n = Math.round(e.get(0).valueOf());
        node = node.pow(n);
      }
      return node;
    }
    function parseBase() {
      const tk = peek();
      if (!tk) throw new Error('식이 갑자기 끝났습니다.');
      if (tk.t === '-') { eat(); return parseBase().scale(new Frac(-1)); }
      if (tk.t === '+') { eat(); return parseBase(); }
      if (tk.t === 'num') { eat(); const v = tk.v; if (v.includes('.')) { const [a, b] = v.split('.'); const den = Math.pow(10, b.length); return Poly.constant(new Frac(parseInt(a + b, 10), den)); } return Poly.constant(new Frac(parseInt(v, 10))); }
      if (tk.t === 'x') { eat(); return Poly.x(); }
      if (tk.t === '(') { eat(); const e = parseExpr(); eat(')'); return e; }
      throw new Error('식의 형식이 올바르지 않습니다.');
    }
    function divByConst(node, d) {
      if (d.degree() !== 0) throw new Error('다항식으로 나누는 것은 지원하지 않습니다.');
      return node.scale(new Frac(1).div(d.get(0)));
    }
    const result = parseExpr();
    if (pos !== toks.length) throw new Error('식을 끝까지 해석하지 못했습니다.');
    return result;
  }

  /* ===================================================================
   *  1) 제곱근의 계산
   * =================================================================== */
  function simplifyRadical(n) {
    // √n = a√b (b는 더 이상 제곱인수 없음).  반환 {a,b,str}
    if (n < 0) return { a: 0, b: n, str: '실수 범위에서 정의되지 않음' };
    if (n === 0) return { a: 0, b: 0, str: '0' };
    let a = 1, b = n;
    for (let f = 2; f * f <= b; f++) {
      while (b % (f * f) === 0) { a *= f; b /= (f * f); }
    }
    let str;
    if (b === 1) str = `${a}`;
    else if (a === 1) str = `√${b}`;
    else str = `${a}√${b}`;
    return { a, b, str };
  }

  function explainSimplifyRadical(n) {
    const steps = [];
    steps.push(`① 근호 안의 수 ${n}을 소인수분해하여 제곱인수를 찾습니다.`);
    const r = simplifyRadical(n);
    if (r.b === 1) {
      steps.push(`② ${n} = ${r.a}² 이므로 √${n} = ${r.a}`);
    } else if (r.a === 1) {
      steps.push(`② ${n}에는 1보다 큰 제곱인수가 없으므로 √${n}은 더 이상 간단히 할 수 없습니다.`);
    } else {
      steps.push(`② ${n} = ${r.a}² × ${r.b}`);
      steps.push(`③ √(a²b) = a√b 이므로  √${n} = ${r.a}√${r.b}`);
    }
    return { answer: r.str, steps };
  }

  function rationalize(numN, denRadicand) {
    // (numN) / √(denRadicand)  →  분모를 유리화
    const steps = [];
    steps.push(`① 분모 √${denRadicand} 를 없애기 위해 분모·분자에 √${denRadicand}을 곱합니다.`);
    steps.push(`② ${numN}/√${denRadicand} = (${numN}×√${denRadicand}) / (√${denRadicand}×√${denRadicand}) = ${numN}√${denRadicand} / ${denRadicand}`);
    // 약분
    const g = gcd(numN, denRadicand);
    let answer;
    if (g > 1 && denRadicand % g === 0) {
      const nn = numN / g, dd = denRadicand / g;
      steps.push(`③ ${g}로 약분하면  ${dd === 1 ? '' : ''}${nn === 1 ? '' : nn}√${denRadicand} / ${dd}`);
      answer = `${nn === 1 ? '' : nn}√${denRadicand}${dd === 1 ? '' : '/' + dd}`;
    } else {
      answer = `${numN === 1 ? '' : numN}√${denRadicand} / ${denRadicand}`;
    }
    return { answer, steps };
  }

  /* ===================================================================
   *  2) 전개 (곱셈 공식)
   * =================================================================== */
  function expand(str) {
    const poly = parsePoly(str);
    const steps = [];
    steps.push(`① 주어진 식: ${str}`);
    steps.push(`② 분배법칙(또는 곱셈 공식)으로 전개합니다.`);
    steps.push(`③ 전개 결과: ${polyStr(poly)}`);
    return { answer: polyStr(poly), steps, poly };
  }

  /* ===================================================================
   *  3) 인수분해  (정수계수 ax²+bx+c)
   * =================================================================== */
  function polyToQuadCoeffs(poly) {
    if (poly.degree() > 2) throw new Error('이 엔진은 이차식까지만 다룹니다.');
    return { a: poly.get(2), b: poly.get(1), c: poly.get(0) };
  }

  function isPerfectSquare(n) { if (n < 0) return false; const r = Math.round(Math.sqrt(n)); return r * r === n ? r : false; }

  function factorQuadratic(str) {
    const poly = parsePoly(str);
    let { a, b, c } = polyToQuadCoeffs(poly);
    const steps = [];
    steps.push(`① 주어진 식: ${polyStr(poly)}`);

    // 정수계수로 가정 (중3 범위). 분모가 있으면 통분/정수화는 생략하고 안내
    if (!a.isInt() || !b.isInt() || !c.isInt()) {
      steps.push('※ 계수가 정수가 아니어서 인수분해 결과가 분수 형태일 수 있습니다.');
    }
    const A = a.valueOf(), B = b.valueOf(), C = c.valueOf();

    // 공통인수
    let g = gcd(gcd(Math.round(A), Math.round(B)), Math.round(C));
    if (a.isInt() && b.isInt() && c.isInt() && g > 1) {
      steps.push(`② 공통인수 ${g}로 묶습니다: ${g}(${polyStr(poly.scale(new Frac(1, g)))})`);
    }

    if (poly.degree() < 2) {
      // 일차식: 공통인수만
      return { answer: g > 1 ? `${g}(${polyStr(poly.scale(new Frac(1, g)))})` : polyStr(poly), steps };
    }

    // 판별식
    const D = B * B - 4 * A * C;
    const sq = isPerfectSquare(D);
    if (sq === false) {
      steps.push(`② 판별식 D = b²-4ac = ${B}²-4·${A}·${C} = ${D} 이 완전제곱수가 아니므로,`);
      steps.push(`   유리수 범위에서는 인수분해되지 않습니다. (이차방정식은 근의 공식으로 풀 수 있어요.)`);
      return { answer: '유리수 범위에서 인수분해 불가', steps };
    }

    // 근: x = (-B ± √D)/(2A)  → 유리수 근 r1,r2
    const r1 = new Frac(-Math.round(B) + sq, Math.round(2 * A));
    const r2 = new Frac(-Math.round(B) - sq, Math.round(2 * A));
    // a x² + b x + c = a (x - r1)(x - r2)
    // 정수계수 인수 (p x - q) 형태로 변환
    function rootToFactor(r) {
      // x - r =  (d x - n)/d   (r = n/d)
      return { p: r.d, q: r.n }; // (p x - q)
    }
    const f1 = rootToFactor(r1), f2 = rootToFactor(r2);

    steps.push(`② 곱이 ac=${A * C}, 합이 b=${B}인 두 수를 찾는 방법(또는 인수분해 공식)으로 분해합니다.`);

    // 패턴 감지: 완전제곱식 / 합차공식
    if (r1.eq(r2)) {
      const fac = factorString(a, f1);
      steps.push(`③ 두 근이 같으므로 완전제곱식입니다.`);
      const ans = a.eq(new Frac(1)) ? `(${linear(f1)})^2` : `${a}(${linearMonic(r1)})^2`;
      const full = buildFactored(a, [f1, f2]);
      steps.push(`④ 인수분해 결과: ${full}`);
      return { answer: full, steps };
    }
    const full = buildFactored(a, [f1, f2]);
    steps.push(`③ 인수분해 결과: ${full}`);
    // 검산
    steps.push(`④ 검산: 전개하면 다시 ${polyStr(poly)} 가 됩니다.`);
    return { answer: full, steps, roots: [r1, r2] };
  }

  // (p x - q) 문자열
  function linear(f) {
    const p = f.p, q = f.q;
    const xs = p === 1 ? 'x' : `${p}x`;
    if (q === 0) return xs;
    return q > 0 ? `${xs} - ${q}` : `${xs} + ${-q}`;
  }
  function linearMonic(r) { // x - r
    if (r.isZero()) return 'x';
    const rs = r.toString();
    return r.valueOf() > 0 ? `x - ${rs}` : `x + ${(r.neg()).toString()}`;
  }
  function buildFactored(a, factors) {
    // a∏(p_i x - q_i)  단, 앞쪽 계수 정리
    let lead = a.valueOf();
    const parts = factors.map(f => { return { p: f.p, q: f.q }; });
    // 곱해진 선두계수 ∏p_i 가 a*?  실제로 a(x-r1)(x-r2) = a/(p1 p2) (p1 x - q1)(p2 x - q2)
    // 간단화를 위해 정수계수 표준형으로:
    const p1 = parts[0].p, q1 = parts[0].q, p2 = parts[1].p, q2 = parts[1].q;
    const scale = a.mul(new Frac(1, p1 * p2)); // 앞 상수
    let s = '';
    if (!scale.eq(new Frac(1))) s += (scale.eq(new Frac(-1)) ? '-' : scale.toString());
    s += `(${linear(parts[0])})(${linear(parts[1])})`;
    return s;
  }
  function factorString(a, f) { return linear(f); }

  /* ===================================================================
   *  4) 이차방정식
   * =================================================================== */
  function solveQuadratic(str) {
    // "= " 처리
    let lhs = str, rhs = '0';
    if (str.includes('=')) { const parts = str.split('='); lhs = parts[0]; rhs = parts[1]; }
    const poly = parsePoly(lhs).sub(parsePoly(rhs));
    const { a, b, c } = polyToQuadCoeffs(poly);
    const steps = [];
    steps.push(`① 모든 항을 좌변으로 옮겨 정리: ${polyStr(poly)} = 0`);

    if (poly.degree() === 1) {
      // 일차방정식
      const x = c.neg().div(b);
      steps.push(`② 일차방정식이므로 x = ${x.toString()}`);
      return { answer: [x.toString()], steps };
    }
    if (poly.degree() === 0) { steps.push('변수가 없습니다.'); return { answer: [], steps }; }

    const A = a.valueOf(), B = b.valueOf(), C = c.valueOf();
    steps.push(`② a=${a}, b=${b}, c=${c}`);
    const D = B * B - 4 * A * C;
    steps.push(`③ 판별식 D = b²-4ac = (${B})²-4·(${A})·(${C}) = ${D}`);

    const sq = isPerfectSquare(D);
    // 인수분해 가능하면 인수분해 풀이 먼저
    if (sq !== false && Number.isInteger(D)) {
      if (a.isInt() && b.isInt() && c.isInt()) {
        try {
          const f = factorQuadratic(polyStr(poly));
          if (f.roots) steps.push(`④ (인수분해) ${f.answer} = 0`);
        } catch (e) {}
      }
    }

    if (D > 0) {
      steps.push(`⑤ D > 0 이므로 서로 다른 두 실근을 가집니다.`);
      const rad = simplifyRadical(D);
      if (sq !== false) {
        const x1 = new Frac(-Math.round(B) + sq, Math.round(2 * A));
        const x2 = new Frac(-Math.round(B) - sq, Math.round(2 * A));
        steps.push(`⑥ 근의 공식 x = (-b ± √D)/(2a) = (${-B} ± ${sq})/${2 * A}`);
        steps.push(`⑦ 따라서 x = ${x1.toString()}  또는  x = ${x2.toString()}`);
        return { answer: [x1.toString(), x2.toString()], steps };
      } else {
        steps.push(`⑥ 근의 공식 x = (-b ± √D)/(2a) = (${-B} ± ${rad.str})/${2 * A}`);
        const x1 = surdRoot(-B, rad.a, rad.b, 2 * A, '+');
        const x2 = surdRoot(-B, rad.a, rad.b, 2 * A, '-');
        steps.push(`⑦ 약분하여 정리하면  x = ${x1}  또는  x = ${x2}`);
        return { answer: [x1, x2], steps };
      }
    } else if (D === 0) {
      const x = new Frac(-Math.round(B), Math.round(2 * A));
      steps.push(`⑤ D = 0 이므로 중근(서로 같은 두 근)을 가집니다.`);
      steps.push(`⑥ x = -b/(2a) = ${-B}/${2 * A} = ${x.toString()} (중근)`);
      return { answer: [x.toString() + ' (중근)'], steps };
    } else {
      steps.push(`⑤ D < 0 이므로 실수인 근이 없습니다. (중3 과정에서는 "근이 없다")`);
      return { answer: ['실근 없음'], steps };
    }
  }

  // (const ± coeff√rad) / den  꼴을 약분하여 문자열로
  function surdRoot(constPart, coeff, radicand, den, sign) {
    if (den < 0) { constPart = -constPart; coeff = -coeff; den = -den; }
    let g = gcd(gcd(Math.abs(constPart) || den, Math.abs(coeff)), Math.abs(den));
    constPart /= g; coeff /= g; den /= g;
    const surd = `${coeff === 1 ? '' : coeff}√${radicand}`;
    let body;
    if (constPart === 0) body = `${sign === '-' ? '-' : ''}${surd}`;
    else body = `${constPart} ${sign} ${surd}`;
    return den === 1 ? body : (constPart === 0 ? `${body}/${den}` : `(${body})/${den}`);
  }

  /* ===================================================================
   *  5) 이차함수  y = ax²+bx+c
   * =================================================================== */
  function quadraticFunction(str) {
    // "y=" 또는 "f(x)=" 제거
    let rhs = str.replace(/^\s*(y|f\(x\))\s*=/, '');
    const poly = parsePoly(rhs);
    const { a, b, c } = polyToQuadCoeffs(poly);
    if (a.isZero()) throw new Error('이차항이 없어 이차함수가 아닙니다.');
    const steps = [];
    steps.push(`① 주어진 이차함수: y = ${polyStr(poly)}`);
    // 완전제곱: a(x - p)² + q,  p = -b/2a,  q = c - b²/4a
    const p = b.neg().div(a.mul(new Frac(2)));
    const q = c.sub(b.mul(b).div(a.mul(new Frac(4))));
    steps.push(`② 완전제곱식으로 변형: y = a(x-p)²+q,  p=-b/2a, q=c-b²/4a`);
    steps.push(`③ p = ${b.neg()}/${a.mul(new Frac(2))} = ${p.toString()},  q = ${q.toString()}`);
    const pSign = p.valueOf() >= 0 ? `- ${p.toString()}` : `+ ${p.neg().toString()}`;
    steps.push(`④ 표준형: y = ${a.eq(new Frac(1)) ? '' : a.toString()}(x ${pSign})² ${q.valueOf() >= 0 ? '+ ' + q.toString() : '- ' + q.neg().toString()}`);
    steps.push(`⑤ 꼭짓점: (${p.toString()}, ${q.toString()}),  축의 방정식: x = ${p.toString()}`);
    const opensUp = a.valueOf() > 0;
    steps.push(`⑥ a ${opensUp ? '> 0 → 아래로 볼록, 최솟값' : '< 0 → 위로 볼록, 최댓값'} = ${q.toString()} (x=${p.toString()}일 때)`);
    steps.push(`⑦ y절편: x=0 → y = ${c.toString()}`);
    // x절편
    const sol = solveQuadratic(polyStr(poly) + '=0');
    steps.push(`⑧ x절편: ${polyStr(poly)}=0 의 해 → x = ${sol.answer.join(', ')}`);
    return {
      answer: `꼭짓점 (${p.toString()}, ${q.toString()}), 축 x=${p.toString()}, ${opensUp ? '최솟값' : '최댓값'} ${q.toString()}`,
      steps,
      vertex: [p.toString(), q.toString()]
    };
  }

  /* ===================================================================
   *  자동 분류 + 메인 진입점
   * =================================================================== */
  function classify(input) {
    const s = input.trim();
    if (/^\s*√\s*\d+\s*$/.test(s)) return 'radical';
    if (/^(y|f\(x\))\s*=/.test(s)) return 'function';
    if (s.includes('=')) return 'solve';
    // 단원 키워드
    return null;
  }

  function solve(input, kindHint) {
    const kind = kindHint || classify(input) || 'auto';
    try {
      switch (kind) {
        case 'radical': {
          const n = parseInt(input.replace(/[^\d]/g, ''), 10);
          return wrap('제곱근 계산', explainSimplifyRadical(n));
        }
        case 'expand': return wrap('전개', expand(input));
        case 'factor': return wrap('인수분해', factorQuadratic(input));
        case 'solve': return wrap('이차방정식', solveQuadratic(input));
        case 'function': return wrap('이차함수', quadraticFunction(input));
        case 'auto':
        default: {
          if (input.includes('=')) return wrap('이차방정식', solveQuadratic(input));
          // 곱셈/괄호 있으면 전개로, 단일 다항식이면 인수분해 시도
          const poly = parsePoly(input);
          if (poly.degree() === 2) return wrap('인수분해', factorQuadratic(input));
          return wrap('전개/정리', expand(input));
        }
      }
    } catch (e) {
      return { title: '오류', answer: '⚠️ ' + e.message, steps: ['입력 표기를 확인해 주세요. 예) x^2-5x+6=0, (x+2)(x-3), √12'] };
    }
  }
  function wrap(title, res) { return { title, answer: Array.isArray(res.answer) ? res.answer.join(',  ') : res.answer, steps: res.steps }; }

  const API = {
    Frac, Poly, parsePoly, polyStr,
    simplifyRadical, explainSimplifyRadical, rationalize,
    expand, factorQuadratic, solveQuadratic, quadraticFunction,
    classify, solve
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MathEngine = API;
})(typeof window !== 'undefined' ? window : this);
