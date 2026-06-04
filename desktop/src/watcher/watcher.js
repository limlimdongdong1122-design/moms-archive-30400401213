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

// Purchase cues across apps (Korean + English).
var KEYWORDS = [
  '결제', '구매', '주문', '장바구니', '구독', '바로구매', '결제하기', '주문하기',
  'checkout', 'buy now', 'place order', 'pay now', 'add to cart', 'subscribe',
  'complete purchase', 'proceed to payment', 'confirm order',
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

function scan(text) {
  if (!text) return;
  var low = text.toLowerCase();
  var hit = null;
  for (var i = 0; i < KEYWORDS.length; i++) {
    if (low.indexOf(KEYWORDS[i].toLowerCase()) !== -1) { hit = KEYWORDS[i]; break; }
  }
  if (!hit) return;
  // best-effort price near the cue
  var m = text.match(/[₩$]\s?[\d,]{3,}|[\d,]{4,}\s?원/);
  var price = m ? parseInt(m[0].replace(/[^\d]/g, ''), 10) || 0 : 0;
  var sig = hit + '|' + price;
  if (sig === lastSig) return; // same screen as last time → don't repeat
  lastSig = sig;
  window.ivwatch.detect({ keyword: hit, price: price, snippet: text.slice(0, 140) });
}
