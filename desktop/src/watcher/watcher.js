/* ============================================================
 * IMPULSE VAULT — watcher.js (hidden OCR renderer)
 * Captures the screen, OCRs frames on an interval, and reports
 * checkout/buy detections to main. Defensive: any failure just
 * means "no detection", never a crash.
 * ============================================================ */
'use strict';

var video, canvas, ctx;
var intervalMs = 5000;
var timer = null;
var busy = false;
var lastSig = '';

// Purchase cues across apps (Korean + English). Split the same way the
// browser extension classifies button text, so the desktop watcher does NOT
// fire on a login / signup screen (the bug we fixed in the extension):
//   STRONG → clearly spending money → report on sight.
//   WEAK   → ambiguous (구독/subscribe) → report ONLY if a price is visible.
// Login / signup / search words are deliberately absent (never reported).
var STRONG_KEYWORDS = [
  '결제', '결제하기', '구매', '구매하기', '바로구매', '주문', '주문하기', '장바구니',
  'checkout', 'buy now', 'place order', 'pay now', 'add to cart',
  'complete purchase', 'proceed to payment', 'confirm order', 'order now',
];
var WEAK_KEYWORDS = [
  '구독', '구독하기', '멤버십', '업그레이드', '플랜',
  'subscribe', 'upgrade', 'choose plan', 'select plan', 'membership',
];
// Words that mean the screen is NOT a purchase moment. If one of these is the
// only cue around, suppress (extra guard against login/account screens).
var EXCLUDE_KEYWORDS = [
  '로그인', '로그아웃', 'login', 'log in', 'sign in', 'sign up', 'signup',
  '회원가입', 'register', '아이디', '비밀번호', 'password',
  // downloads / file actions — not a purchase
  '다운로드', '내려받기', 'download', '설치', 'install', '저장', 'save',
];

window.ivwatch.onStart(async function (cfg) {
  intervalMs = (cfg && cfg.intervalMs) || 5000;
  try {
    var stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: cfg.sourceId,
          maxWidth: 1600,
          maxHeight: 1000,
        },
      },
    });
    video = document.getElementById('v');
    video.srcObject = stream;
    await video.play();
    canvas = document.getElementById('c');
    ctx = canvas.getContext('2d');
    timer = setInterval(tick, intervalMs);
  } catch (e) {
    console.warn('[IV watcher] capture failed:', e);
  }
});

async function tick() {
  if (busy || !video || !video.videoWidth || typeof Tesseract === 'undefined') return;
  busy = true;
  try {
    var scale = Math.min(1, 1280 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    var res = await Tesseract.recognize(canvas, 'eng+kor');
    var text = (res && res.data && res.data.text) ? res.data.text.replace(/\s+/g, ' ') : '';
    scan(text);
  } catch (e) {
    /* ignore a bad frame */
  }
  busy = false;
}

function hasAny(low, list) {
  for (var i = 0; i < list.length; i++) {
    if (low.indexOf(list[i].toLowerCase()) !== -1) return list[i];
  }
  return null;
}

function scan(text) {
  if (!text) return;
  var low = text.toLowerCase();

  // best-effort price somewhere on screen
  var m = text.match(/[₩$]\s?[\d,]{3,}|[\d,]{4,}\s?원/);
  var price = m ? parseInt(m[0].replace(/[^\d]/g, ''), 10) || 0 : 0;

  // STRONG cue → purchase moment. WEAK cue → only when a price is visible.
  var hit = hasAny(low, STRONG_KEYWORDS);
  if (!hit && price > 0) hit = hasAny(low, WEAK_KEYWORDS);
  if (!hit) return;

  // If the only thing on screen is a login/account cue with no strong spend
  // word, don't treat it as a purchase (defensive double-check).
  if (!hasAny(low, STRONG_KEYWORDS) && hasAny(low, EXCLUDE_KEYWORDS) && price === 0) {
    return;
  }

  var sig = hit + '|' + price;
  if (sig === lastSig) return; // same screen as last time → don't repeat
  lastSig = sig;
  window.ivwatch.detect({ keyword: hit, price: price, snippet: text.slice(0, 140) });
}
