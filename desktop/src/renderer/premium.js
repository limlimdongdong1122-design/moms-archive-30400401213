/* ============================================================
 * IMPULSE VAULT desktop — premium.js
 * Optional polish for the renderer: a cursor light, 3D tilt +
 * cursor-following sheen on glass cards, and magnetic buttons.
 * Matches the landing site. Skips when the user prefers reduced
 * motion; never interferes with app logic.
 * ============================================================ */
(function () {
  'use strict';
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  // ---- cursor light: soft glow + precise dot easing toward the pointer ----
  var glow = document.querySelector('.cursor-glow');
  var dot = document.querySelector('.cursor-dot');
  if (glow && dot && !reduce) {
    var tx = innerWidth / 2, ty = innerHeight / 2, gx = tx, gy = ty, dx = tx, dy = ty, raf = null;
    function render() {
      gx = lerp(gx, tx, 0.12); gy = lerp(gy, ty, 0.12);
      dx = lerp(dx, tx, 0.38); dy = lerp(dy, ty, 0.38);
      glow.style.transform = 'translate3d(' + gx + 'px,' + gy + 'px,0) translate(-50%,-50%)';
      dot.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0) translate(-50%,-50%)';
      raf = (Math.abs(gx - tx) > 0.5 || Math.abs(gy - ty) > 0.5 || Math.abs(dx - tx) > 0.5)
        ? requestAnimationFrame(render) : null;
    }
    addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY; document.body.classList.add('cursor-on');
      if (!raf) raf = requestAnimationFrame(render);
    }, { passive: true });
    var hot = 'button,a,[role="button"],input,.nav-link,.switch,.seg';
    addEventListener('mouseover', function (e) {
      if (e.target.closest && e.target.closest(hot)) dot.classList.add('hot');
    }, { passive: true });
    addEventListener('mouseout', function (e) {
      if (e.target.closest && e.target.closest(hot)) dot.classList.remove('hot');
    }, { passive: true });
  }

  if (!reduce) {
    // ---- 3D tilt + sheen on glass cards ----
    document.querySelectorAll('.glass').forEach(function (card) {
      // skip the big 3D vault stage (it has its own canvas motion)
      if (card.classList.contains('vault-stage')) return;
      var rect = null;
      card.addEventListener('mouseenter', function () { rect = card.getBoundingClientRect(); });
      card.addEventListener('mousemove', function (e) {
        if (!rect) rect = card.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width;
        var py = (e.clientY - rect.top) / rect.height;
        card.style.setProperty('--mx', (px * 100) + '%');
        card.style.setProperty('--my', (py * 100) + '%');
        card.style.transform =
          'perspective(900px) rotateX(' + (0.5 - py) * 5 + 'deg) rotateY(' + (px - 0.5) * 6 + 'deg) translateY(-3px)';
      });
      card.addEventListener('mouseleave', function () { rect = null; card.style.transform = ''; });
    });

    // ---- magnetic primary buttons ----
    document.querySelectorAll('.btn-primary').forEach(function (b) {
      b.addEventListener('mousemove', function (e) {
        var r = b.getBoundingClientRect();
        var mx = e.clientX - (r.left + r.width / 2);
        var my = e.clientY - (r.top + r.height / 2);
        b.style.transform = 'translate(' + mx * 0.2 + 'px,' + my * 0.28 + 'px) scale(1.05)';
      });
      b.addEventListener('mouseleave', function () { b.style.transform = ''; });
    });
  }
})();
