/* ============================================================
 * IMPULSE VAULT — utils/analysis.js
 * ------------------------------------------------------------
 * "Cold Purchase Analysis (냉정한 구매 분석)" — a FAIR, neutral,
 * grounded pros/cons scorecard + rational reflection points.
 *
 * Philosophy: force clear thinking, NOT shame. Present both sides
 * fairly. Never invent specs/defects — every concrete claim is
 * grounded in (1) the product page data the content script scraped,
 * or (2) the user's own logged signals. Rule-based, free, offline,
 * no AI required. Optional BYOK AI enrichment happens elsewhere.
 *
 * Pure functions only (no DOM, no storage, no network). Loaded as a
 * classic script in the service worker and pages → window/self.IVAnalysis.
 * ============================================================ */

(function (global) {
  'use strict';

  // Negative cues we look for in real review snippets (Korean + English).
  // We only ever quote what's actually on the page — never fabricate.
  const NEG_CUES = [
    '별로', '실망', '고장', '불편', '후회', '반품', '환불', '단점', '아쉽',
    '무겁', '시끄', '약하', '비싸', '느리', '발열', '버벅', '작아', '작음',
    'cheap', 'broke', 'broken', 'disappoint', 'return', 'refund', 'noisy',
    'slow', 'heavy', 'flimsy', 'poor', 'defect', 'overpriced',
  ];
  const POS_CUES = [
    '만족', '좋아요', '좋음', '튼튼', '가성비', '추천', '예쁘', '편하', '빠르',
    'great', 'love', 'excellent', 'sturdy', 'recommend', 'worth', 'comfortable',
  ];

  function fmtKRW(n) {
    try { return '₩' + Math.round(n || 0).toLocaleString('ko-KR'); }
    catch (_) { return '₩' + Math.round(n || 0); }
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function snippetHasAny(text, cues) {
    const t = (text || '').toLowerCase();
    return cues.some((c) => t.indexOf(c) !== -1);
  }

  /**
   * Build the scorecard.
   * input = {
   *   name, price,
   *   rating, reviewCount, specs:[..], reviews:[..],   // from the page
   *   signals: { viewCount, similarSearches, category, ownsSimilar,
   *              hourlyWage, gamePrice, weeklyAllowance }
   * }
   */
  // Human label + alternative-search hint per item type.
  function typeInfo(itemType) {
    if (itemType === 'service') return { label: '서비스/구독', altWord: '대체 서비스' };
    if (itemType === 'software') return { label: '프로그램/소프트웨어', altWord: '대체 프로그램' };
    return { label: '상품', altWord: '대체 상품' };
  }

  function buildScorecard(input) {
    const d = input || {};
    const s = d.signals || {};
    const itemType = d.itemType || 'product';
    const ti = typeInfo(itemType);
    const price = Number(d.price) || 0;
    const gamePrice = Number(s.gamePrice) || 60000;
    const wage = Number(s.hourlyWage) || 0;
    const views = Number(s.viewCount) || 0;
    const sims = Number(s.similarSearches) || 0;

    const ratio = price > 0 ? price / gamePrice : 0;
    const highPrice = ratio >= 1.5;
    const cheapNecessity = ratio > 0 && ratio < 0.15 && views < 3 && sims < 3;
    const repeat = views >= 3 || sims >= 3;

    const pros = [];
    const cons = [];

    // ---- PROS (grounded) ----
    if (typeof d.rating === 'number' && d.rating >= 4.3 && (d.reviewCount || 0) >= 50) {
      pros.push({ text: `평점이 높아요 — ${d.rating.toFixed(1)}점 (${(d.reviewCount).toLocaleString('ko-KR')}개 리뷰)`, source: '리뷰' });
    }
    (d.specs || []).slice(0, 3).forEach((sp) => {
      const text = String(sp).trim().slice(0, 80);
      if (text) pros.push({ text, source: '상품정보' });
    });
    // a positive review snippet, quoted as-is
    const posReview = (d.reviews || []).find((r) => snippetHasAny(r, POS_CUES));
    if (posReview) pros.push({ text: `리뷰: "${String(posReview).trim().slice(0, 70)}"`, source: '리뷰' });
    if (cheapNecessity) pros.push({ text: '금액이 작은 편이라 부담이 크지 않아요', source: '가격' });

    // ---- CONS (grounded; stricter for high-price/repeat, lighter for cheap) ----
    if (typeof d.rating === 'number' && d.rating > 0 && d.rating < 3.8) {
      cons.push({ text: `평점이 낮은 편이에요 — ${d.rating.toFixed(1)}점`, source: '리뷰' });
    }
    const negReviews = (d.reviews || []).filter((r) => snippetHasAny(r, NEG_CUES)).slice(0, 2);
    negReviews.forEach((r) => {
      cons.push({ text: `리뷰에서 자주 지적된 점: "${String(r).trim().slice(0, 70)}"`, source: '리뷰' });
    });
    if (highPrice) {
      cons.push({ text: `예산 대비 큰 지출이에요 (아끼는 것 약 ${ratio.toFixed(1)}개 값)`, source: '내 기준' });
    }
    if (repeat) {
      const n = Math.max(views, sims);
      cons.push({ text: `이미 ${n}번이나 보거나 검색했어요 — 충동일 가능성`, source: '내 기록' });
    }
    if (s.ownsSimilar) {
      cons.push({ text: `'${s.category || '비슷한'}' 종류를 이미 본 적이 있어요 — 중복일 수 있어요`, source: '내 기록' });
    }
    // For high-price/repeat we add one extra strict prompt; for cheap we trim.
    if ((highPrice || repeat) && (d.reviewCount || 0) < 10 && typeof d.rating !== 'number') {
      cons.push({ text: '리뷰·평점 정보가 적어 품질을 확인하기 어려워요', source: '상품정보' });
    }
    if (cheapNecessity && cons.length > 1) cons.length = 1; // keep it light

    // ---- Extra grounded signals from the richer page scrape ----
    if (d.freeShipping) pros.push({ text: '무료 배송', source: '상품정보' });
    if (typeof d.discountPct === 'number' && d.discountPct >= 5) {
      pros.push({ text: `표시 할인 ${d.discountPct}%`, source: '상품정보' });
    }
    if (d.returnInfo && /불가/.test(d.returnInfo)) {
      cons.push({ text: '반품·환불이 제한될 수 있어요: ' + d.returnInfo, source: '상품정보' });
    }

    // Review sentiment (count grounded pos vs neg cues across snippets).
    let posN = 0, negN = 0;
    (d.reviews || []).forEach((r) => {
      if (snippetHasAny(r, NEG_CUES)) negN++;
      else if (snippetHasAny(r, POS_CUES)) posN++;
    });
    const sentN = posN + negN;
    const posRatio = sentN >= 3 ? posN / sentN : null; // null = not enough data

    // ---- Objective summary (neutral, grounded) ----
    const summary = buildSummary({ d, ratio, highPrice, cheapNecessity, repeat });

    // ---- Reflection points (ALWAYS; no AI needed) ----
    const reflections = [];
    const hours = wage > 0 && price > 0 ? (price / wage) : 0;
    const games = gamePrice > 0 && price > 0 ? (price / gamePrice) : 0;
    if (price > 0) {
      reflections.push({
        point: `기회비용 — 약 ${hours ? hours.toFixed(1) + '시간 노동' : '—'}${games ? ' · 아끼는 것 ' + games.toFixed(1) + '개' : ''}`,
        why: '돈은 결국 내 시간과 바꾼 거예요. 같은 돈으로 무엇을 포기하는지 보면 판단이 쉬워져요.',
      });
    }
    reflections.push({ point: '30일 뒤에도 이걸 쓰고 있을까?', why: '충동구매의 상당수는 한 달 안에 거의 안 쓰게 돼요.' });
    if (s.ownsSimilar) {
      reflections.push({ point: '이미 비슷한 걸 갖고 있지 않아?', why: `'${s.category || '같은 종류'}'를 최근에 봤어요. 중복 구매는 만족도가 낮아요.` });
    }
    // "Is this actually the best option?" — the core "better alternative" check.
    reflections.push({
      point: `이게 정말 최선이야? ${ti.altWord}을(를) 1~2개라도 비교했어?`,
      why: '비슷한 기능을 더 싸게/더 좋게 주는 선택지가 있는 경우가 많아요. 5분 비교가 후회를 막아요.',
    });
    if (itemType === 'service') {
      reflections.push({ point: '구독은 해지 전까지 계속 빠져나가요. 해지 방법·날짜를 정했나?', why: '안 쓰면서 내는 구독료가 가장 흔한 새는 돈이에요. 무료 대안이 충분한 경우도 많아요.' });
    } else if (itemType === 'software') {
      reflections.push({ point: '무료·오픈소스·기존에 가진 도구로 대체되진 않아?', why: '많은 유료 프로그램은 무료 대안으로 80%는 해결돼요. 정말 그 차이가 필요한지 확인해요.' });
    } else {
      reflections.push({ point: '반품·환불 조건을 확인했나요?', why: '막상 반품은 절차가 번거롭고 배송비가 들 때가 많아요. 미리 알면 후회가 줄어요.' });
    }
    reflections.push({ point: '지금의 설렘은 보통 며칠이면 사라져요.', why: '새것의 만족감은 빠르게 평범해져요 — 쾌락 적응(hedonic adaptation).' });
    if (repeat || highPrice) {
      reflections.push({
        point: `이번 달 예산·목표에 주는 영향을 봤나요?`,
        why: highPrice ? '큰 지출 하나가 한 달 계획 전체를 흔들 수 있어요.' : '작아 보여도 반복되면 합계는 커져요.',
      });
    }

    // Persuasion-tactic awareness (grounded in what the page shows).
    if (d.lowStock) {
      reflections.push({ point: "'품절 임박'·'마감 임박' 표시를 봤나요?", why: '재고/시간 압박은 급하게 사게 만드는 흔한 장치예요. 진짜 마지막 기회인 경우는 드물어요.' });
    }
    if (typeof d.discountPct === 'number' && d.discountPct >= 20) {
      reflections.push({ point: `'${d.discountPct}% 할인'은 정말 싼 걸까, 원래 비싼 걸까?`, why: '할인율은 정가를 높여 만든 착시인 경우가 많아요. 할인폭이 아니라 최종 가격을 다른 곳과 비교해요.' });
    }

    // ---- Evidence-backed verdict (persuasive, but grounded + transparent) ----
    // Score the case 0..100 where higher = more reason it's a sound buy.
    let caseScore = 50;
    if (typeof d.rating === 'number') caseScore += (d.rating - 3.8) * 18; // ~ -14..+22
    if (posRatio !== null) caseScore += (posRatio - 0.5) * 40;            // review consensus
    caseScore -= clamp((ratio - 1) * 18, -10, 30);                       // price vs value
    if (repeat) caseScore -= 12;                                         // impulse signal
    if (s.ownsSimilar) caseScore -= 10;                                  // duplicate risk
    if (d.freeShipping) caseScore += 3;
    if (cheapNecessity) caseScore += 10;
    caseScore = Math.round(clamp(caseScore, 0, 100));

    let level, line;
    if (caseScore >= 66) {
      level = 'worth';
      line = '모은 근거상, 이건 합리적인 선택에 가까워요. 평가·가격 측면이 대체로 우호적이에요.';
    } else if (caseScore >= 45) {
      level = 'consider';
      line = '나쁘진 않지만 결정적이진 않아요. 핵심 한두 가지(가격·대안)를 5분만 더 확인하고 사도 늦지 않아요.';
    } else {
      level = 'hold';
      line = '근거상 지금 바로 사기엔 신중할 이유가 더 많아요. 대안을 한 번 비교한 뒤 결정하길 권해요.';
    }
    // Persuasive reasons = the strongest 2 grounded points behind the verdict.
    const reasons = [];
    if (typeof d.rating === 'number') reasons.push(`평점 ${d.rating.toFixed(1)}${d.reviewCount ? ' (' + d.reviewCount.toLocaleString('ko-KR') + '개)' : ''}`);
    if (posRatio !== null) reasons.push(`리뷰 ${Math.round(posRatio * 100)}%가 긍정적`);
    if (ratio > 0) reasons.push(price > 0 ? `가격은 아끼는 것 약 ${ratio.toFixed(1)}개 값` : '');
    if (repeat) reasons.push(`${Math.max(views, sims)}번 반복 조회(충동 신호)`);
    if (s.ownsSimilar) reasons.push('비슷한 품목 보유 가능성');
    const verdict = { level, line, strength: caseScore, reasons: reasons.filter(Boolean).slice(0, 3) };

    // ---- Neutral consideration meter (NOT a verdict) ----
    let meterVal = 0;
    meterVal += clamp(ratio * 34, 0, 50);
    if (repeat) meterVal += 22;
    if (s.ownsSimilar) meterVal += 12;
    if (typeof d.rating === 'number' && d.rating < 3.8) meterVal += 12;
    if (cheapNecessity) meterVal = Math.min(meterVal, 22);
    meterVal = Math.round(clamp(meterVal, 5, 100));
    const meterLabel = meterVal >= 70 ? '높음' : meterVal >= 45 ? '보통' : '낮음';

    // ---- Balance: make 단점 oppose 장점 evenly (equal counts) ----
    // Pad the lighter side with honest DECISION considerations (not invented
    // product facts) so the user always sees a fair, two-sided picture.
    const conPool = [
      '같은 돈으로 살 수 있는 다른 선택지를 아직 비교하지 않았어요',
      '지금 사지 않아도 당장 큰 문제는 없는 항목일 수 있어요',
      '반품·교환에는 시간과 비용(배송비)이 들 수 있어요',
      '새것의 만족감은 며칠이면 익숙해져요 (쾌락 적응)',
      '이 지출이 이번 달 예산·저축 목표를 갉아먹을 수 있어요',
    ];
    const proPool = [
      '정말 필요한 물건이라면 미루는 것도 비용이에요 (필요한 건 빨리 쓸수록 이득)',
      '평가·정보가 충분하다면 검증된 선택일 수 있어요',
      '지금 가격·조건이 나중보다 나을 수도 있어요',
    ];
    let ci = 0;
    while (cons.length < pros.length && ci < conPool.length) cons.push({ text: conPool[ci++], source: '판단' });
    let pj = 0;
    while (pros.length < cons.length && pj < proPool.length) pros.push({ text: proPool[pj++], source: '판단' });
    // Trim both to the same final length (max 5) so they stay visually balanced.
    const n = Math.min(5, Math.max(pros.length, cons.length));
    while (cons.length < n && ci < conPool.length) cons.push({ text: conPool[ci++], source: '판단' });
    while (pros.length < n && pj < proPool.length) pros.push({ text: proPool[pj++], source: '판단' });
    const finalN = Math.min(pros.length, cons.length, 5);

    return {
      note: '참고용',
      itemType: itemType,
      typeLabel: ti.label,
      altWord: ti.altWord,
      verdict: verdict,
      pros: pros.slice(0, finalN),
      cons: cons.slice(0, finalN),
      summary,
      reflections,
      meter: { value: meterVal, label: meterLabel },
      grounded: { hasPageData: !!(d.specs && d.specs.length) || typeof d.rating === 'number', reviewCount: d.reviewCount || 0 },
    };
  }

  function buildSummary(ctx) {
    const { d, ratio, highPrice, cheapNecessity, repeat } = ctx;
    const parts = [];
    if (typeof d.rating === 'number') {
      parts.push(d.rating >= 4.3 ? '리뷰 평가는 대체로 좋아요' : d.rating < 3.8 ? '리뷰 평가는 다소 갈려요' : '리뷰 평가는 무난해요');
    } else {
      parts.push('리뷰 데이터가 부족해 품질 판단은 보류가 안전해요');
    }
    if (highPrice) parts.push('다만 예산 대비 지출이 큰 편이라 비슷한 기능의 더 싼 대안을 비교해볼 만해요');
    else if (cheapNecessity) parts.push('금액이 작아 꼭 필요하다면 과한 고민은 불필요해요');
    if (repeat) parts.push('여러 번 본 물건이라 한 번 식혔다 결정하는 것도 방법이에요');
    return parts.join('. ') + '.';
  }

  // ---- The prompt sent to a BYOK model (grounded, balanced, safe) ----
  function buildAiPrompt(d, useWeb) {
    const ti = typeInfo(d.itemType || 'product');
    const lines = [];
    lines.push('You are a sharp, balanced purchase-analyst. Build a COMPELLING, evidence-grounded evaluation and a clear recommendation. Ground specific claims in the page data below AND in what you find by searching. Do NOT invent specs, prices, or defects; if unsure, say so and lower confidence.');
    if (useWeb) {
      lines.push('FIRST, SEARCH THE WEB for this exact item: external expert/user reviews, common complaints, reliability/defect reports, and better or cheaper alternatives. Pull in everything relevant and cite sources briefly (site name). Prefer recent, credible sources.');
    }
    lines.push('This is a ' + (d.itemType || 'product') + ' (' + ti.label + '). Decide if it is genuinely worth buying for a typical buyer, and whether a clearly BETTER or CHEAPER option exists (name real, well-known options).');
    lines.push('CRITICAL BALANCE RULE: give EXACTLY 4 장점 and EXACTLY 4 단점 — equal in number AND comparable in weight/specificity. Do NOT stack one side. Make the 단점 as strong and concrete as the 장점 (real risks, common complaints, overspend, better alternatives). Mark review/web-based points with their source.');
    lines.push('Answer in Korean, tight. Return EXACTLY: ① 결론 (한 문장 추천 + 확신도: 낮음/보통/높음) ② 장점 4개 ③ 단점 4개 ④ 더 나은/더 싼 대안 1~2개 (출처) ⑤ 한 줄 냉정한 요약.');
    lines.push('Persuade through evidence, not pressure.');
    lines.push('---DATA (scraped from the page) ---');
    lines.push('이름: ' + (d.name || '(unknown)'));
    if (d.brand) lines.push('브랜드: ' + d.brand);
    if (d.price) lines.push('가격: ' + fmtKRW(d.price));
    if (d.originalPrice) lines.push('정가(표시): ' + fmtKRW(d.originalPrice));
    if (typeof d.discountPct === 'number') lines.push('표시 할인율: ' + d.discountPct + '%');
    if (typeof d.rating === 'number') lines.push('평점: ' + d.rating + ' (리뷰 ' + (d.reviewCount || 0) + '개)');
    if (d.freeShipping) lines.push('배송: 무료배송 표기');
    if (d.returnInfo) lines.push('반품/환불: ' + d.returnInfo);
    if (d.lowStock) lines.push('재고: 품절/마감 임박 표기 있음');
    if (d.specs && d.specs.length) lines.push('스펙/특징 (' + d.specs.length + '개):\n- ' + d.specs.slice(0, 14).join('\n- '));
    if (d.reviews && d.reviews.length) lines.push('실제 리뷰 발췌 (' + d.reviews.length + '개):\n- ' + d.reviews.slice(0, 12).join('\n- '));
    lines.push('---END---');
    return lines.join('\n');
  }

  // Prompt for AI to SEARCH THE WEB and return real alternative products.
  function buildAltPrompt(d, kind) {
    const cheaper = kind === 'cheaper';
    const ti = typeInfo(d.itemType || 'product');
    const lines = [];
    lines.push('You are a shopping research assistant with live web search. SEARCH THE WEB NOW and find REAL, currently-available ' + (cheaper ? 'CHEAPER' : 'BETTER (or better-value)') + ' alternatives to the item below. Base everything on what you actually find — do NOT invent products or prices.');
    lines.push('Target ' + (d.itemType || 'product') + ' (' + ti.label + '):');
    lines.push('- 이름: ' + (d.name || '(unknown)'));
    if (d.brand) lines.push('- 브랜드: ' + d.brand);
    if (d.price) lines.push('- 현재 가격: ' + fmtKRW(d.price));
    if (d.specs && d.specs.length) lines.push('- 주요 스펙: ' + d.specs.slice(0, 6).join(' / '));
    lines.push('Return 2~3 concrete alternatives in Korean, each as one block:');
    lines.push('• 제품명 (브랜드) — 대략 가격 — 왜 ' + (cheaper ? '더 싼지/가성비 좋은지' : '더 좋은지') + ' 한 줄 — 출처(사이트명/링크)');
    lines.push('Then ONE 한 줄 결론 comparing them to the original. If you genuinely cannot find solid alternatives, say so plainly. Keep it tight.');
    return lines.join('\n');
  }

  global.IVAnalysis = {
    buildScorecard: buildScorecard,
    buildAiPrompt: buildAiPrompt,
    buildAltPrompt: buildAltPrompt,
    fmtKRW: fmtKRW,
  };
})(typeof self !== 'undefined' ? self : this);
