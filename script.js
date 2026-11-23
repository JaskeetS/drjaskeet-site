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

  // 4. The line that leads through the story.
  //    It runs between the elements marked data-stop, in page order, and the scroll
  //    position decides how much of it is drawn. Four styles share this engine:
  //      thread – one looping line that passes behind every picture
  //      steps  – a trail of footprints walking from picture to picture
  //      spine  – a steady timeline with a dot and a branch at each picture
  //      pen    – an ink line that circles each picture when it arrives
  var trail = document.getElementById('trail');
  var main = document.querySelector('main');
  if (!trail || !main) return;

  /* ---- Tunables ---- */
  var HEAD = 0.62;        // how far down the screen the drawing tip sits (0 = top, 1 = bottom)
  var INSET = 22;         // how far the line tucks in behind a picture's edge, px
  var LANE_OFFSET = 16;   // phones: distance of the line from the text column's edge, px
  var FOLLOW = 0.16;      // how quickly the tip catches up with the scroll (0–1 per frame)
  var SAMPLE = 8;         // px between measurements along the line
  var STRIDE = 26;        // px between footprints

  var VARIANTS = ['thread', 'steps', 'spine', 'pen'];
  var NS = 'http://www.w3.org/2000/svg';
  var FOOT = 'M0 -8C3.2 -8 4 -4.5 3.6 -1.5C3.3 .8 2.2 1.6 0 1.6C-2.2 1.6 -3.3 .8 -3.6 -1.5C-4 -4.5 -3.2 -8 0 -8Z' +
             'M-2.3 5.4a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0Z';

  var root = document.documentElement;
  var stops = Array.prototype.slice.call(document.querySelectorAll('[data-stop]'));
  var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-line]'));
  var segs = [], nodes = [];
  var leadEl = null, builtAs = '';
  var mainTop = 0, raf = 0;

  var variant = 'thread';
  try {
    var asked = new URLSearchParams(window.location.search).get('line') || window.localStorage.getItem('line');
    if (VARIANTS.indexOf(asked) > -1) variant = asked;
  } catch (e) { /* private mode: keep the default */ }

  function el(tag, cls) {
    var node = document.createElementNS(NS, tag);
    if (cls) node.setAttribute('class', cls);
    return node;
  }
  var dot = el('circle', 'trail__dot');
  dot.setAttribute('r', 5);
  dot.style.opacity = 0;

  // Position of an element inside <main>, ignoring any tilt or entrance animation.
  function box(node) {
    var x = 0, y = 0, n = node;
    while (n && n !== main) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { l: x, t: y, r: x + node.offsetWidth, b: y + node.offsetHeight, w: node.offsetWidth,
             cx: x + node.offsetWidth / 2, cy: y + node.offsetHeight / 2 };
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
  function routeAcross(S, E, rand, loops) {
    var dx = E.x - S.x, dy = E.y - S.y;
    var dir = Math.abs(dx) < 40 ? (rand() < 0.5 ? 1 : -1) : (dx > 0 ? 1 : -1);
    var pts = [S, { x: S.x + (rand() - 0.5) * 30 - dir * 12, y: S.y + dy * 0.24 }];
    var mid = { x: S.x + dx * 0.5, y: S.y + dy * 0.5 };
    if (loops && dy > 150) pts = pts.concat(curl(mid, Math.max(12, Math.min(26, dy * 0.1)), dir));
    else pts.push(mid);
    pts.push({ x: E.x + (rand() - 0.5) * 30 + dir * 12, y: E.y - dy * 0.24 }, E);
    return pts;
  }

  // Phones: text sits under the picture, so the line slips down a clear strip beside it.
  function routeLane(S, E, laneX, dir, rand, loops) {
    var dy = E.y - S.y;
    if (dy < 240) return [S, { x: (S.x + E.x) / 2 + (rand() - 0.5) * 40, y: S.y + dy / 2 }, E];
    var y0 = S.y + 84, y1 = E.y - 100;
    var pts = [S, { x: S.x + (laneX - S.x) * 0.55, y: S.y + 38 }, { x: laneX, y: y0 }];
    var n = Math.max(1, Math.round((y1 - y0) / 120));
    var curlAt = loops && (y1 - y0) > 260 ? Math.floor(n / 2) : -1;
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

  function sideOf(node) {
    var beat = node.closest('.beat');
    return node.dataset.side || (beat && beat.dataset.side) || 'left';
  }

  // One stretch of line, plus the table that matches it to the scroll position.
  function makeSeg(pts, to, frac) {
    var path = el('path', 'seg');
    path.setAttribute('d', smooth(pts));
    trail.appendChild(path);
    var seg = { path: path, to: to, len: path.getTotalLength(), startY: pts[0].y, endY: pts[pts.length - 1].y,
                steps: [], shown: 0, lasso: null, done: false };
    var n = Math.ceil(seg.len / SAMPLE), deepest = -Infinity;
    seg.depth = new Float32Array(n + 1);   // deepest point reached so far at each step along the line
    for (var k = 0; k <= n; k++) {
      deepest = Math.max(deepest, path.getPointAtLength(Math.min(k * SAMPLE, seg.len)).y);
      seg.depth[k] = deepest;
    }
    path.style.strokeDasharray = seg.len + ' ' + seg.len;
    seg.cur = reduceMotion ? seg.len : (frac || 0) * seg.len;
    seg.target = seg.cur;
    segs.push(seg);
    return seg;
  }

  // Footprints along a stretch, alternating left and right of it.
  function addSteps(seg) {
    var foot = 1;
    for (var at = 16; at < seg.len - 6; at += STRIDE) {
      var p = seg.path.getPointAtLength(at), q = seg.path.getPointAtLength(Math.min(at + 2, seg.len));
      var ang = Math.atan2(q.y - p.y, q.x - p.x);
      var print = el('path', 'foot');
      print.setAttribute('d', FOOT);
      print.setAttribute('transform',
        'translate(' + (p.x - Math.sin(ang) * 5.5 * foot).toFixed(1) + ' ' + (p.y + Math.cos(ang) * 5.5 * foot).toFixed(1) +
        ') rotate(' + (ang * 180 / Math.PI + 90).toFixed(0) + ')');
      trail.appendChild(print);
      seg.steps.push({ el: print, at: at });
      foot = -foot;
    }
  }

  // A loose pen circle around a picture.
  function addLasso(seg, B, tilt, rand) {
    var hw = B.w / 2 + 14, hh = (B.b - B.t) / 2 + 14, pts = [];
    var turns = 1.12, count = 20, start = -Math.PI / 2 - 0.3;
    for (var k = 0; k <= count; k++) {
      var a = start + (Math.PI * 2 * turns) * k / count;
      var c = Math.cos(a), s = Math.sin(a);
      var grow = 1 + (rand() - 0.5) * 0.06 + 0.05 * k / count;   // drifts outward so the ends don't overlap
      pts.push({ x: B.cx + hw * grow * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 0.42),
                 y: B.cy + hh * grow * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 0.42) });
    }
    var path = el('path', 'lasso');
    path.setAttribute('d', smooth(pts));
    path.setAttribute('pathLength', 1);
    path.setAttribute('transform', 'rotate(' + tilt + ' ' + B.cx.toFixed(1) + ' ' + B.cy.toFixed(1) + ')');
    trail.appendChild(path);
    seg.lasso = path;
  }

  // thread, steps, pen: one stretch between each pair of stops.
  function buildPairs(W, wide, gutter, prev) {
    var loops = variant !== 'steps';
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
      var pts = wide ? routeAcross(S, E, rand, loops) : routeLane(S, E, laneX, side === 'left' ? 1 : -1, rand, loops);
      var seg = makeSeg(pts, b, prev[i]);
      if (variant === 'steps') addSteps(seg);
      if (variant === 'pen' && b.dataset.stop !== 'end') addLasso(seg, B, sideOf(b) === 'left' ? -2.5 : 2.5, rand);
    }
  }

  // spine: one steady line the whole way, with a dot and a branch at each picture.
  function buildSpine(W, wide, gutter, prev) {
    var A = box(stops[0]), Z = box(stops[stops.length - 1]);
    var x = wide ? W / 2 : gutter + 10;
    var S = { x: A.l + 22, y: A.b + 10 }, E = { x: x, y: Z.t + 30 };
    var rand = rng(4242);
    var pts = [S, { x: S.x + (x - S.x) * 0.5, y: S.y + 46 }, { x: x, y: S.y + 100 }];
    var anchors = [];
    for (var i = 1; i < stops.length - 1; i++) anchors.push({ stop: stops[i], B: box(stops[i]) });
    var from = S.y + 100;
    anchors.concat([{ B: { cy: E.y } }]).forEach(function (anchor) {
      var to = anchor.B.cy, count = Math.floor((to - from) / 150);
      for (var k = 1; k <= count; k++) pts.push({ x: x + (rand() - 0.5) * 12, y: from + (to - from) * k / (count + 1) });
      pts.push({ x: x, y: to });
      from = to;
    });
    makeSeg(pts, stops[stops.length - 1], prev[0]);

    anchors.forEach(function (anchor) {
      var B = anchor.B;
      var tx = wide ? (B.cx < x ? B.r + 6 : B.l - 6) : B.l - 3;
      var branch = el('path', 'branch');
      branch.setAttribute('d', 'M' + x + ' ' + B.cy + ' Q' + ((x + tx) / 2).toFixed(1) + ' ' + (B.cy - 9).toFixed(1) + ' ' + tx.toFixed(1) + ' ' + (B.cy + 2).toFixed(1));
      branch.setAttribute('pathLength', 1);
      trail.appendChild(branch);
      var node = el('circle', 'node');
      node.setAttribute('cx', x);
      node.setAttribute('cy', B.cy);
      node.setAttribute('r', 7);
      trail.appendChild(node);
      nodes.push({ el: node, branch: branch, stop: anchor.stop, y: B.cy, on: false });
    });
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

    // Keep what is already drawn across a resize; start afresh when the style changes.
    var prev = builtAs === variant ? segs.map(function (s) { return s.len ? s.cur / s.len : 0; }) : [];
    while (trail.firstChild) trail.removeChild(trail.firstChild);
    stops.forEach(function (s) { s.classList.remove('is-reached'); });
    segs = []; nodes = []; leadEl = null;

    if (variant === 'spine') buildSpine(W, wide, gutter, prev);
    else buildPairs(W, wide, gutter, prev);
    builtAs = variant;

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
    var tip = null, i, j;
    for (i = 0; i < segs.length; i++) {
      var seg = segs[i];
      seg.path.style.strokeDashoffset = (seg.len - seg.cur).toFixed(1);
      seg.path.style.visibility = seg.cur < 0.5 ? 'hidden' : 'visible';
      var done = seg.cur >= seg.len - 1;
      if (done !== seg.done) {
        seg.done = done;
        if (variant !== 'spine') seg.to.classList.toggle('is-reached', done);
        if (seg.lasso) seg.lasso.classList.toggle('on', done);
      }
      if (seg.steps.length) {
        var n = 0;
        while (n < seg.steps.length && seg.steps[n].at <= seg.cur) n++;
        for (j = Math.min(n, seg.shown); j < Math.max(n, seg.shown); j++) seg.steps[j].el.classList.toggle('on', j < n);
        seg.shown = n;
      }
      if (seg.cur > 2 && !done) tip = seg;
    }

    if (nodes.length) {
      var spine = segs[0];
      var depth = spine.cur < 1 ? -Infinity : spine.depth[Math.min(spine.depth.length - 1, Math.floor(spine.cur / SAMPLE))];
      for (i = 0; i < nodes.length; i++) {
        var node = nodes[i], on = depth >= node.y;
        if (on === node.on) continue;
        node.on = on;
        node.el.classList.toggle('on', on);
        node.branch.classList.toggle('on', on);
        node.stop.classList.toggle('is-reached', on);
      }
    }

    var lead = tip && tip.shown > 0 ? tip.steps[tip.shown - 1].el : null;
    if (lead !== leadEl) {
      if (leadEl) leadEl.classList.remove('lead');
      if (lead) lead.classList.add('lead');
      leadEl = lead;
    }

    if (tip && !reduceMotion && variant !== 'steps') {
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

  function setVariant(name, remember) {
    variant = name;
    root.dataset.variant = name;
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.line === name ? 'true' : 'false'); });
    if (remember) {
      try {
        window.localStorage.setItem('line', name);
        window.history.replaceState(null, '', '?line=' + name + window.location.hash);
      } catch (e) { /* not remembered; the switch still works */ }
    }
    build();
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () { setVariant(b.dataset.line, true); });
  });

  var rebuildTimer = 0;
  function rebuildSoon() {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(build, 120);
  }

  setVariant(variant, false);
  window.addEventListener('load', build);
  window.addEventListener('resize', rebuildSoon);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  if (window.ResizeObserver) new ResizeObserver(rebuildSoon).observe(main);
  if (!reduceMotion) window.addEventListener('scroll', onTrailScroll, { passive: true });
})();
