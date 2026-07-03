/* ═══════════════════════════════════════════════════════════
   王老师 · MYSKME — INDEX — v2 motion engine
   rail scrollspy · cursor · cover cascade · chapter reveals ·
   sticky atlas scrub · archive filter/accordion · float card
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) document.body.setAttribute('data-motion', 'off');
  function motionOn() { return document.body.getAttribute('data-motion') !== 'off'; }

  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ── progress: rail % + mobile bar ─────────────────── */
  var railPct = document.querySelector('.rail-pct');
  var tbProgress = document.querySelector('.tb-progress');
  function updateProgress() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var p = h > 0 ? window.scrollY / h : 0;
    if (railPct) railPct.textContent = String(Math.round(p * 100)).padStart(2, '0') + '%';
    if (tbProgress) tbProgress.style.transform = 'scaleX(' + p + ')';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  /* ── scrollspy for rail nav ────────────────────────── */
  var chapters = Array.prototype.slice.call(document.querySelectorAll('[data-chapter]'));
  var railLinks = Array.prototype.slice.call(document.querySelectorAll('.rail-nav a'));
  function spy() {
    var mid = window.innerHeight * 0.4;
    var current = chapters[0];
    for (var i = 0; i < chapters.length; i++) {
      if (chapters[i].getBoundingClientRect().top <= mid) current = chapters[i];
    }
    var id = current ? current.id : null;
    railLinks.forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + id);
    });
  }
  window.addEventListener('scroll', spy, { passive: true });
  spy();

  /* ── custom cursor ─────────────────────────────────── */
  if (finePointer) {
    var dot = document.querySelector('.cursor-dot');
    var ring = document.querySelector('.cursor-ring');
    if (dot && ring) {
      var mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, rafId = null;
      function loop() {
        dot.style.transform = 'translate(' + mx + 'px,' + my + 'px) translate(-50%,-50%)';
        rx += (mx - rx) * 0.16;
        ry += (my - ry) * 0.16;
        ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) translate(-50%,-50%)';
        if (Math.abs(mx - rx) > 0.4 || Math.abs(my - ry) > 0.4) rafId = requestAnimationFrame(loop);
        else rafId = null;
      }
      window.addEventListener('mousemove', function (e) {
        mx = e.clientX; my = e.clientY;
        if (!rafId) rafId = requestAnimationFrame(loop);
      }, { passive: true });
      document.addEventListener('mouseleave', function () { dot.style.opacity = '0'; ring.style.opacity = '0'; });
      document.addEventListener('mouseenter', function () { dot.style.opacity = ''; ring.style.opacity = ''; });
      var hoverables = 'a, button, .arch-row, .word, .panel, .toc-row, .tl-stop, .always-cell, .reach-cell';
      document.addEventListener('mouseover', function (e) {
        if (e.target.closest(hoverables)) ring.classList.add('hover');
      });
      document.addEventListener('mouseout', function (e) {
        if (e.target.closest(hoverables)) ring.classList.remove('hover');
      });
    }
  }

  /* ── cover name cascade ────────────────────────────── */
  var coverName = document.querySelector('.cover-name');
  if (coverName) {
    if (motionOn()) setTimeout(function () { coverName.classList.add('lit'); }, 80);
    else coverName.classList.add('lit');
  }

  /* ── chapter head + generic reveals ────────────────── */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.ch-head, .reveal').forEach(function (el) { io.observe(el); });

  /* ── sticky atlas scrub ────────────────────────────── */
  var container = document.querySelector('.timeline-container');
  if (container) {
    var frames = Array.prototype.slice.call(container.querySelectorAll('.tl-frame'));
    var stops = Array.prototype.slice.call(container.querySelectorAll('.tl-stop'));
    var fill = container.querySelector('.tl-route-fill');
    var active = 0;
    if (frames.length) {
      frames[0].classList.add('active');
      if (stops[0]) stops[0].classList.add('active');
      paintRoute(0);
    }
    function paintRoute(idx) {
      if (fill) fill.style.width = ((idx + 0.5) / frames.length * 100) + '%';
      stops.forEach(function (s, i) {
        s.classList.toggle('passed', i < idx);
        s.classList.toggle('active', i === idx);
      });
    }
    function setActive(idx) {
      idx = Math.max(0, Math.min(frames.length - 1, idx));
      if (idx === active) return;
      frames[active].classList.remove('active');
      frames[idx].classList.add('active');
      active = idx;
      paintRoute(idx);
    }
    function onScroll() {
      var rect = container.getBoundingClientRect();
      var total = container.offsetHeight - window.innerHeight;
      if (total <= 0) return;
      var scrolled = -rect.top;
      if (scrolled <= 0) { setActive(0); return; }
      if (scrolled >= total) { setActive(frames.length - 1); return; }
      setActive(Math.min(frames.length - 1, Math.floor(scrolled / total * frames.length * 0.999)));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    stops.forEach(function (s, i) {
      s.addEventListener('click', function () {
        var rect = container.getBoundingClientRect();
        var total = container.offsetHeight - window.innerHeight;
        var y = window.scrollY + rect.top + total * ((i + 0.5) / frames.length);
        window.scrollTo({ top: y, behavior: 'smooth' });
      });
    });
  }

  /* ── archive: tabs filter ──────────────────────────── */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var rows = Array.prototype.slice.call(document.querySelectorAll('.arch-row'));
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var f = tab.getAttribute('data-filter');
      rows.forEach(function (row, i) {
        var show = (f === 'all') || (row.getAttribute('data-cat') === f);
        row.classList.toggle('hidden', !show);
        if (show && motionOn()) {
          row.style.animation = 'none';
          void row.offsetWidth; /* reflow to restart */
          row.style.animation = '';
          row.style.animationDelay = Math.min(i * 0.03, 0.35) + 's';
        }
      });
    });
  });

  /* ── archive: accordion ────────────────────────────── */
  rows.forEach(function (row) {
    row.addEventListener('click', function () { row.classList.toggle('open'); });
  });

  /* ── archive: floating hover card ──────────────────── */
  if (finePointer) {
    var card = document.querySelector('.float-card');
    var glyphEl = card ? card.querySelector('.fc-glyph') : null;
    var metaEl = card ? card.querySelector('.fc-meta') : null;
    if (card && glyphEl && metaEl) {
      var cx = 0, cy = 0, tx = 0, ty = 0, cardRaf = null, cardOn = false;
      function cardLoop() {
        cx += (tx - cx) * 0.2;
        cy += (ty - cy) * 0.2;
        card.style.left = cx + 'px';
        card.style.top = cy + 'px';
        if (cardOn || Math.abs(tx - cx) > 0.5) cardRaf = requestAnimationFrame(cardLoop);
        else cardRaf = null;
      }
      rows.forEach(function (row) {
        row.addEventListener('mouseenter', function () {
          if (!motionOn()) return;
          var g = row.getAttribute('data-glyph') || '·';
          glyphEl.textContent = g;
          glyphEl.classList.toggle('cn-glyph', /[\u4e00-\u9fff]/.test(g));
          metaEl.textContent = (row.getAttribute('data-cat-label') || '') + ' · ' + (row.getAttribute('data-year') || '');
          cardOn = true;
          card.classList.add('on');
          if (!cardRaf) cardRaf = requestAnimationFrame(cardLoop);
        });
        row.addEventListener('mousemove', function (e) { tx = e.clientX; ty = e.clientY - 14; });
        row.addEventListener('mouseleave', function () { cardOn = false; card.classList.remove('on'); });
      });
    }
  }
  /* ── click-to-copy (WeChat id) ─────────────────────── */
  var copyBtn = document.querySelector('[data-copy]');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var txt = copyBtn.getAttribute('data-copy');
      var hint = document.querySelector('.copy-hint');
      function done() {
        if (!hint) return;
        if (hint.dataset.orig === undefined) hint.dataset.orig = hint.textContent;
        hint.textContent = '已 复 制 myskme · copied';
        hint.classList.add('copied');
        setTimeout(function () {
          hint.textContent = hint.dataset.orig;
          hint.classList.remove('copied');
        }, 1800);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, done);
      } else { done(); }
    });
  }
})();
