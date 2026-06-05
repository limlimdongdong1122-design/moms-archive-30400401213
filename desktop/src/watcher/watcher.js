/* ============================================================
 * IMPULSE VAULT — watcher.js (hidden OCR renderer)
 * Captures the screen, OCRs frames on an interval, and reports
 * checkout/buy detections to main. Defensive: any failure just
 * means "no detection", never a crash.
 *
 * It also reports STATUS back to the app (loading / ready / error /
 * heartbeat) so the user can actually see whether screen-watch is
 * working — the old version failed silently when OCR couldn't load.
 * ============================================================ */
'use strict';

var video, canvas, ctx;
var intervalMs = 5000;
var timer = null;
var busy = false;
var lastSig = '';
var worker = null;     // persistent Tesseract worker (reused every scan)
var scans = 0;

function status(state, info) {
  try { window.ivwatch.status({ state: state, info: info || '' }); } catch (_) {}
}

// Purchase cues across apps (Korean + English).
//   STRONG → clearly spending money → report on sight.
//   WEAK   → ambiguous (구독/subscribe) → report ONLY if a price is visible.
var STRONG_KEYWORDS = [
  '결제', '결제하기', '구매', '구매하기', '바로구매', '주문', '주문하기', '장바구니',
  'checkout', 'buy now', 'place order', 'pay now', 'add to cart',
  'complete purchase', 'proceed to payment', 'confirm order', 'order now',
];
var WEAK_KEYWORDS = [
  '구독', '구독하기', '멤버십', '업그레이드', '플랜',
  'subscribe', 'upgrade', 'choose plan', 'select plan', 'membership',
];
var EXCLUDE_KEYWORDS = [
  '로그인', '로그아웃', 'login', 'log in', 'sign in', 'sign up', 'signup',
  '회원가입', 'register', '아이디', '비밀번호', 'password',
  '다운로드', '내려받기', 'download', '설치', 'install', '저장', 'save',
];

window.ivwatch.onStart(async function (cfg) {
  intervalMs = (cfg && cfg.intervalMs) || 5000;

  // 1) Start screen capture.
  try {
    var stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: cfg.sourceId,
          maxWidth: 1920,
          maxHeight: 1200,
        },
      },
    });
    video = document.getElementById('v');
    video.srcObject = stream;
    await video.play();
    canvas = document.getElementById('c');
    ctx = canvas.getContext('2d');
  } catch (e) {
    status('error', '화면 캡처 권한이 없어요 (화면 녹화 허용 필요)');
    console.warn('[IV watcher] capture failed:', e);
    return;
  }

  // 2) Load the OCR engine (persistent worker). Needs internet the FIRST time
  //    to fetch the engine + language data (then cached).
  if (typeof Tesseract === 'undefined') {
    status('error', 'OCR 엔진을 못 불러왔어요 (인터넷/방화벽 확인)');
    return;
  }
  status('loading', 'OCR 엔진 불러오는 중… (처음엔 인터넷 필요)');
  try {
    worker = await Tesseract.createWorker(['eng', 'kor'], 1);
  } catch (e1) {
    // Korean data may be large/blocked — fall back to English-only.
    try {
      worker = await Tesseract.createWorker('eng', 1);
      status('ready', '감시 중 (영어만 인식 — 한글 데이터 로드 실패)');
    } catch (e2) {
      status('error', 'OCR 엔진 로드 실패 — 인터넷/방화벽을 확인하세요');
      console.warn('[IV watcher] OCR load failed:', e2);
      return;
    }
  }
  if (worker) status('ready', '감시 중 — 결제 화면을 찾고 있어요');

  // 3) Scan on an interval.
  timer = setInterval(tick, intervalMs);
  tick(); // and once right away
});

async function tick() {
  if (busy || !worker || !video || !video.videoWidth) return;
  busy = true;
  try {
    var scale = Math.min(1, 1600 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    var res = await worker.recognize(canvas);
    var text = (res && res.data && res.data.text) ? res.data.text.replace(/\s+/g, ' ') : '';
    scans++;
    // heartbeat so the user can see it's alive (chars read this frame)
    status('scan', '감시 중 · 방금 ' + text.length + '자 읽음 (스캔 ' + scans + '회)');
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

  var m = text.match(/[₩$]\s?[\d,]{3,}|[\d,]{4,}\s?원/);
  var price = m ? parseInt(m[0].replace(/[^\d]/g, ''), 10) || 0 : 0;

  var hit = hasAny(low, STRONG_KEYWORDS);
  if (!hit && price > 0) hit = hasAny(low, WEAK_KEYWORDS);
  if (!hit) return;

  if (!hasAny(low, STRONG_KEYWORDS) && hasAny(low, EXCLUDE_KEYWORDS) && price === 0) {
    return;
  }

  var sig = hit + '|' + price;
  if (sig === lastSig) return;
  lastSig = sig;
  window.ivwatch.detect({ keyword: hit, price: price, snippet: text.slice(0, 140) });
}
