// Dr. Jaskeet — scroll behaviour. No libraries.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Fade things in as they enter the screen.
  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(function (el) { revealObserver.observe(el); });

  // 2. Interlude: split the sentence into words that light up with the scroll.
  var line = document.getElementById('wordReveal');
  var words = [];
  if (line) {
    var text = line.textContent.trim().split(/\s+/);
    line.textContent = '';
    text.forEach(function (word, i) {
      var span = document.createElement('span');
      span.className = 'w';
      span.textContent = word;
      line.appendChild(span);
      if (i < text.length - 1) line.appendChild(document.createTextNode(' '));
      words.push(span);
    });
  }
  var interlude = document.getElementById('meaning');

  // 3. One scroll handler for the progress line, header, hero drift and word reveal.
  var bar = document.getElementById('progressBar');
  var header = document.getElementById('top');
  var drifters = document.querySelectorAll('[data-drift]');
  var ticking = false;

  function update() {
    ticking = false;
    var y = window.scrollY;
    var vh = window.innerHeight;
    var max = document.documentElement.scrollHeight - vh;

    if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(y / max, 1) : 0) + ')';
    if (header) header.classList.toggle('is-stuck', y > 24);

    if (!reduceMotion && y < vh * 1.2) {
      drifters.forEach(function (el) {
        el.style.setProperty('--dy', (y * Number(el.dataset.drift) * -1).toFixed(1) + 'px');
      });
    }

    if (interlude && words.length) {
      var rect = interlude.getBoundingClientRect();
      var travel = rect.height - vh;
      var p = travel > 0 ? Math.min(Math.max(-rect.top / travel, 0), 1) : 1;
      // Finish a little before the section ends so the full sentence can be read.
      var lit = Math.round(Math.min(p / 0.8, 1) * words.length);
      if (reduceMotion) lit = words.length;
      words.forEach(function (w, i) { w.classList.toggle('on', i < lit); });
    }
  }

  function onScroll() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  // 4. The doodle line.
  //    One hand-drawn thread runs between the elements marked data-stop, in page order.
  //    Each stretch ends behind the top of a picture and the next begins behind its
  //    bottom edge. The scroll position decides how much of it is drawn.
  var trail = document.getElementById('trail');
  var main = document.querySelector('main');
  if (!trail || !main) return;

  /* ---- Tunables ---- */
  var HEAD = 0.62;        // how far down the screen the drawing tip sits (0 = top, 1 = bottom)
  var INSET = 22;         // how far the line tucks in behind a picture's edge, px
  var LANE_OFFSET = 16;   // phones: distance of the line from the text column's edge, px
  var FOLLOW = 0.16;      // how quickly the tip catches up with the scroll (0–1 per frame)
  var SAMPLE = 8;         // px between measurements along the line

  var NS = 'http://www.w3.org/2000/svg';
  var stops = Array.prototype.slice.call(document.querySelectorAll('[data-stop]'));
  var segs = [];
  var mainTop = 0;
  var raf = 0;

  var dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('r', 5);
  dot.setAttribute('class', 'trail__dot');
  dot.style.opacity = 0;

  // Position of an element inside <main>, ignoring any tilt or entrance animation.
  function box(el) {
    var x = 0, y = 0, n = el;
    while (n && n !== main) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { l: x, t: y, r: x + el.offsetWidth, b: y + el.offsetHeight, w: el.offsetWidth, cx: x + el.offsetWidth / 2 };
  }

  // Repeatable randomness, so the line keeps its shape when the window is resized.
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A little loop-the-loop centred on m.
  function curl(m, r, dir) {
    return [
      { x: m.x - dir * r * 0.3, y: m.y - r },
      { x: m.x + dir * r, y: m.y - r * 0.1 },
      { x: m.x + dir * r * 0.1, y: m.y + r },
      { x: m.x - dir * r, y: m.y },
      { x: m.x - dir * r * 0.1, y: m.y - r * 0.95 },
      { x: m.x + dir * r * 1.3, y: m.y + r * 0.5 }
    ];
  }

  // Wide screens: text sits beside the picture, so the line can sweep across the gap.
  function routeAcross(S, E, rand) {
    var dx = E.x - S.x, dy = E.y - S.y;
    var dir = Math.abs(dx) < 40 ? (rand() < 0.5 ? 1 : -1) : (dx > 0 ? 1 : -1);
    var pts = [S, { x: S.x + (rand() - 0.5) * 30 - dir * 12, y: S.y + dy * 0.24 }];
    var mid = { x: S.x + dx * 0.5, y: S.y + dy * 0.5 };
    if (dy > 150) pts = pts.concat(curl(mid, Math.max(12, Math.min(26, dy * 0.1)), dir));
    else pts.push(mid);
    pts.push({ x: E.x + (rand() - 0.5) * 30 + dir * 12, y: E.y - dy * 0.24 }, E);
    return pts;
  }

  // Phones: text sits under the picture, so the line slips down a clear strip beside it.
  function routeLane(S, E, laneX, dir, rand) {
    var dy = E.y - S.y;
    if (dy < 240) return [S, { x: (S.x + E.x) / 2 + (rand() - 0.5) * 40, y: S.y + dy / 2 }, E];
    var y0 = S.y + 84, y1 = E.y - 100;
    var pts = [S, { x: S.x + (laneX - S.x) * 0.55, y: S.y + 38 }, { x: laneX, y: y0 }];
    var n = Math.max(1, Math.round((y1 - y0) / 120));
    var curlAt = (y1 - y0) > 260 ? Math.floor(n / 2) : -1;
    for (var k = 1; k < n; k++) {
      var y = y0 + (y1 - y0) * k / n;
      if (k === curlAt) pts = pts.concat(curl({ x: laneX, y: y }, 9, dir));
      else pts.push({ x: laneX + (rand() - 0.5) * 10, y: y });
    }
    pts.push({ x: laneX, y: y1 }, { x: laneX + (E.x - laneX) * 0.5, y: E.y - 46 }, E);
    return pts;
  }

  // Smooth curve through a list of points.
  function smooth(p) {
    var d = 'M' + p[0].x.toFixed(1) + ' ' + p[0].y.toFixed(1);
    for (var i = 0; i < p.length - 1; i++) {
      var a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      d += ' C' + (b.x + (c.x - a.x) / 6).toFixed(1) + ' ' + (b.y + (c.y - a.y) / 6).toFixed(1) +
           ' ' + (c.x - (e.x - b.x) / 6).toFixed(1) + ' ' + (c.y - (e.y - b.y) / 6).toFixed(1) +
           ' ' + c.x.toFixed(1) + ' ' + c.y.toFixed(1);
    }
    return d;
  }

  function sideOf(el) {
    var beat = el.closest('.beat');
    return el.dataset.side || (beat && beat.dataset.side) || 'left';
  }

  function build() {
    var W = main.offsetWidth, H = main.scrollHeight;
    trail.setAttribute('width', W);
    trail.setAttribute('height', H);
    trail.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    mainTop = main.getBoundingClientRect().top + window.scrollY;

    var wide = window.matchMedia('(min-width: 900px)').matches;
    var beats = document.querySelector('.beats');
    var gutter = beats ? box(beats).l : 20;

    for (var i = 0; i < stops.length - 1; i++) {
      var a = stops[i], b = stops[i + 1];
      var A = box(a), B = box(b), side = sideOf(a);
      var S = a.dataset.stop === 'start'
        ? { x: A.l + 22, y: A.b + 10 }
        : { x: wide ? A.cx : (side === 'left' ? A.l + A.w * 0.2 : A.r - A.w * 0.2), y: A.b - INSET };
      var E = b.dataset.stop === 'end'
        ? { x: W / 2, y: B.t + 30 }
        : { x: B.cx, y: B.t + INSET };

      var rand = rng(i * 7919 + 13);
      var laneX = side === 'left' ? gutter + LANE_OFFSET : W - gutter - LANE_OFFSET;
      var pts = wide ? routeAcross(S, E, rand) : routeLane(S, E, laneX, side === 'left' ? 1 : -1, rand);

      var seg = segs[i];
      if (!seg) {
        seg = segs[i] = { path: document.createElementNS(NS, 'path'), cur: 0, target: 0, done: false, to: b };
        trail.appendChild(seg.path);
      }
      seg.path.setAttribute('d', smooth(pts));
      seg.len = seg.path.getTotalLength();
      seg.startY = S.y;
      seg.endY = E.y;
      // Deepest point reached so far at each step along the line, for matching to the scroll.
      var n = Math.ceil(seg.len / SAMPLE), deepest = -Infinity;
      seg.depth = new Float32Array(n + 1);
      for (var k = 0; k <= n; k++) {
        deepest = Math.max(deepest, seg.path.getPointAtLength(Math.min(k * SAMPLE, seg.len)).y);
        seg.depth[k] = deepest;
      }
      seg.path.style.strokeDasharray = seg.len + ' ' + seg.len;
      if (seg.done || reduceMotion) seg.cur = seg.len;
      seg.cur = Math.min(seg.cur, seg.len);
    }
    trail.appendChild(dot);
    aim();
    paint();
    if (!raf && !reduceMotion) raf = window.requestAnimationFrame(tick);
  }

  // How much of each stretch should be drawn for the current scroll position.
  function aim() {
    var headY = window.scrollY + window.innerHeight * HEAD - mainTop;
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      if (reduceMotion || headY >= seg.endY) { seg.target = seg.len; continue; }
      if (headY <= seg.startY) { seg.target = 0; continue; }
      var lo = 0, hi = seg.depth.length - 1;
      while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (seg.depth[mid] <= headY) lo = mid; else hi = mid - 1;
      }
      seg.target = Math.min(lo * SAMPLE, seg.len);
    }
  }

  function paint() {
    var tip = null;
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      seg.path.style.strokeDashoffset = (seg.len - seg.cur).toFixed(1);
      seg.path.style.visibility = seg.cur < 0.5 ? 'hidden' : 'visible';
      var done = seg.cur >= seg.len - 1;
      if (done && !seg.done) seg.to.classList.add('is-reached');
      seg.done = done;
      if (seg.cur > 2 && !done) tip = seg;
    }
    if (tip && !reduceMotion) {
      var p = tip.path.getPointAtLength(tip.cur);
      dot.setAttribute('cx', p.x.toFixed(1));
      dot.setAttribute('cy', p.y.toFixed(1));
      dot.style.opacity = 1;
    } else {
      dot.style.opacity = 0;
    }
  }

  // Ease the drawn length toward its target, so loops are drawn rather than jumped.
  function tick() {
    raf = 0;
    var moving = false;
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i], gap = seg.target - seg.cur;
      if (Math.abs(gap) > 0.5) { seg.cur += gap * FOLLOW; moving = true; }
      else seg.cur = seg.target;
    }
    paint();
    if (moving) raf = window.requestAnimationFrame(tick);
  }

  function onTrailScroll() {
    aim();
    if (!raf) raf = window.requestAnimationFrame(tick);
  }

  var rebuildTimer = 0;
  function rebuildSoon() {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(build, 120);
  }

  build();
  window.addEventListener('load', build);
  window.addEventListener('resize', rebuildSoon);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  if (window.ResizeObserver) new ResizeObserver(rebuildSoon).observe(main);
  if (!reduceMotion) window.addEventListener('scroll', onTrailScroll, { passive: true });
})();
