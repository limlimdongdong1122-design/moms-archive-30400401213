/* ============================================================
 * IMPULSE VAULT — test/run.js
 * A dependency-free Node harness for the PURE logic that decides
 * whether (and how strongly) the intervention appears. The browser
 * UI needs Chrome, but this validates the scoring + tier + scorecard
 * paths — exactly what governs "the prompt didn't appear".
 *
 * Run:  node test/run.js
 * ============================================================ */
'use strict';

// patterns.js / analysis.js attach to `self`; expose it as the global.
global.self = global;
// analysis.js localizes its display strings through IVI18n. Provide a shim so
// this pure-logic harness runs headless (no Chrome). Return the Korean variant
// so the existing string assertions below stay valid — the logic under test is
// language-agnostic.
global.IVI18n = { pick: (en, ko) => ko, current: 'ko', ready: Promise.resolve('ko') };
require('../utils/patterns.js');
require('../utils/analysis.js');
const P = global.IVPatterns;
const A = global.IVAnalysis;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '   <-- FAIL'); }
}

console.log('scoreSignal tiers:');
ok('cheap, first-time -> low',
  P.scoreSignal({ price: 5000, viewCount: 1, similarSearches: 0, hour: 14, strictness: 'balanced', gamePrice: 60000 }).tier === 'low');
ok('expensive -> not low',
  P.scoreSignal({ price: 150000, viewCount: 1, similarSearches: 0, hour: 14, strictness: 'balanced', gamePrice: 60000 }).tier !== 'low');
ok('repeat + late-night + price -> high',
  P.scoreSignal({ price: 90000, viewCount: 5, similarSearches: 3, hour: 1, strictness: 'balanced', gamePrice: 60000 }).tier === 'high');

console.log('\nfinalizeTier (the "always appears" fix):');
ok('alwaysAsk forces low -> medium', P.finalizeTier('low', { alwaysAsk: true }) === 'medium');
ok('alwaysAsk keeps high', P.finalizeTier('high', { alwaysAsk: true }) === 'high');
ok('no alwaysAsk: low stays low', P.finalizeTier('low', { alwaysAsk: false, recentCount: 0, freqCap: 3 }) === 'low');
ok('freq cap downgrades medium -> low', P.finalizeTier('medium', { alwaysAsk: false, recentCount: 5, freqCap: 3 }) === 'low');
ok('under cap keeps medium', P.finalizeTier('medium', { alwaysAsk: false, recentCount: 1, freqCap: 3 }) === 'medium');

console.log('\nclassifyBuyText (login false-positive fix):');
// STRONG: clearly spending money.
ok("'결제하기' -> strong", P.classifyBuyText('결제하기') === 'strong');
ok("'구매' -> strong", P.classifyBuyText('구매') === 'strong');
ok("'장바구니 담기' -> strong", P.classifyBuyText('장바구니 담기') === 'strong');
ok("'Buy now' -> strong", P.classifyBuyText('Buy now') === 'strong');
ok("'Add to cart' -> strong", P.classifyBuyText('Add to cart') === 'strong');
ok("'Proceed to checkout' -> strong", P.classifyBuyText('Proceed to checkout') === 'strong');
// EXCLUDE: login / signup / search / nav must NEVER intervene (the bug).
ok("'로그인' -> none", P.classifyBuyText('로그인') === 'none');
ok("'로그인하기' -> none", P.classifyBuyText('로그인하기') === 'none');
ok("'Log in' -> none", P.classifyBuyText('Log in') === 'none');
ok("'Sign in' -> none", P.classifyBuyText('Sign in') === 'none');
ok("'회원가입' -> none", P.classifyBuyText('회원가입') === 'none');
ok("'Sign up' -> none", P.classifyBuyText('Sign up') === 'none');
ok("'검색' -> none", P.classifyBuyText('검색') === 'none');
ok("'취소' -> none", P.classifyBuyText('취소') === 'none');
// Downloads / file & save actions must NEVER be a purchase (the bug).
ok("'다운로드' -> none", P.classifyBuyText('다운로드') === 'none');
ok("'Download' -> none", P.classifyBuyText('Download') === 'none');
ok("'무료 다운로드' -> none", P.classifyBuyText('무료 다운로드') === 'none');
ok("'다운받기' -> none", P.classifyBuyText('다운받기') === 'none');
ok("'PDF 저장' -> none", P.classifyBuyText('PDF 저장') === 'none');
ok("'Install' -> none", P.classifyBuyText('Install') === 'none');
// STRONG beats EXCLUDE when both present ("로그인 후 결제").
ok("'로그인 후 결제' -> strong", P.classifyBuyText('로그인 후 결제') === 'strong');
// A paid download still counts (결제 wins over 다운로드).
ok("'결제 후 다운로드' -> strong", P.classifyBuyText('결제 후 다운로드') === 'strong');
// WEAK: ambiguous → caller gates on a visible price.
ok("'구독하기' -> weak", P.classifyBuyText('구독하기') === 'weak');
ok("'Subscribe' -> weak", P.classifyBuyText('Subscribe') === 'weak');
ok("'시작하기' -> weak", P.classifyBuyText('시작하기') === 'weak');
// Empty / overly long blobs → none.
ok("'' -> none", P.classifyBuyText('') === 'none');
ok('long blob -> none', P.classifyBuyText('가'.repeat(60)) === 'none');

console.log('\nbuildScorecard (balanced pros/cons + verdict):');
const sc = A.buildScorecard({
  name: 'Test Headphones', price: 120000, itemType: 'product',
  rating: 4.6, reviewCount: 1200, specs: ['노이즈캔슬', '30시간 배터리', '블루투스 5.3'],
  reviews: ['음질 만족 추천', '배터리 별로 실망', '가격 비싸 후회'],
  signals: { viewCount: 4, similarSearches: 3, category: '이어폰', ownsSimilar: true, gamePrice: 60000, hourlyWage: 12000 },
});
ok('has verdict line + strength', !!sc.verdict && typeof sc.verdict.line === 'string' && typeof sc.verdict.strength === 'number');
ok('pros count == cons count (balanced)', sc.pros.length === sc.cons.length && sc.pros.length > 0);
ok('reflections present (>=3)', Array.isArray(sc.reflections) && sc.reflections.length >= 3);
ok('type-aware altWord/label', !!sc.altWord && !!sc.typeLabel);
ok('note is 참고용', sc.note === '참고용');

console.log('\nbuildScorecard for a subscription (service):');
const svc = A.buildScorecard({ name: '월 구독', price: 9900, itemType: 'service', signals: { gamePrice: 60000, hourlyWage: 12000 } });
ok('service balanced pros/cons', svc.pros.length === svc.cons.length);
ok('service altWord = 대체 서비스', svc.altWord === '대체 서비스');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
