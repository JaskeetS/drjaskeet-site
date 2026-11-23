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

  // 2. Chapters: the line of text nearest the middle of the screen picks the photo.
  document.querySelectorAll('.scrolly').forEach(function (scrolly) {
    var stills = scrolly.querySelectorAll('.still');
    var steps = scrolly.querySelectorAll('.step');

    var stepObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var index = Number(entry.target.dataset.still);
        steps.forEach(function (s) { s.classList.toggle('is-active', s === entry.target); });
        stills.forEach(function (s, i) { s.classList.toggle('is-active', i === index); });
      });
    }, { rootMargin: '-55% 0px -35% 0px', threshold: 0 });

    steps.forEach(function (s) { stepObserver.observe(s); });
    if (steps[0]) steps[0].classList.add('is-active');
  });

  // 3. Interlude: split the sentence into words that light up with the scroll.
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

  // 4. One scroll handler for the progress line, header, hero drift and word reveal.
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
})();
