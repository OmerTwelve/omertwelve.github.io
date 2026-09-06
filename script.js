/* Omer Ahmed — portfolio interactions.
   Theme toggle, Abu Dhabi clock, hero EEG trace, copy-email,
   scroll reveals, nav state. */

(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.documentElement;

  // Reassigned by the canvas block below; declared here because applyTheme
  // calls it, and applyTheme runs first.
  var onThemeChange = function () {};

  document.getElementById("yr").textContent = new Date().getFullYear();

  /* ── Theme toggle ─────────────────────────────────
     Light is the default; the head script already applied any saved
     preference before paint, so here we only handle the switching. */
  var toggle = document.getElementById("theme-toggle");

  function currentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function applyTheme(theme) {
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    toggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
    try { localStorage.setItem("theme", theme); } catch (e) { /* private mode */ }
    onThemeChange();
  }

  applyTheme(currentTheme()); // sync the button label with whatever loaded

  toggle.addEventListener("click", function () {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
  });

  /* ── Abu Dhabi clock ──────────────────────────────
     Fixed to Asia/Dubai rather than the viewer's clock: the point is to
     show a recruiter what time it is for Omer, not for themselves. */
  var clockEl = document.getElementById("clock-time");
  if (clockEl) {
    var fmt;
    try {
      fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dubai",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
      });
    } catch (e) { fmt = null; }

    if (fmt) {
      var tick = function () { clockEl.textContent = fmt.format(new Date()); };
      tick();
      setInterval(tick, 1000);
    } else {
      // No Intl time zone support — hide rather than show a wrong time.
      clockEl.closest(".clock").hidden = true;
    }
  }

  /* ── Copy email ───────────────────────────────────
     Confirms in the button itself and announces to screen readers. */
  var copyBtn = document.getElementById("copy-email");
  if (copyBtn && navigator.clipboard) {
    var copyLabel = document.getElementById("copy-label");
    var copyStatus = document.getElementById("copy-status");
    var resetTimer;

    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(copyBtn.dataset.email).then(function () {
        copyLabel.textContent = "Copied";
        copyStatus.textContent = "Email address copied to clipboard.";
        clearTimeout(resetTimer);
        resetTimer = setTimeout(function () {
          copyLabel.textContent = "Copy email";
          copyStatus.textContent = "";
        }, 2500);
      }).catch(function () {
        copyStatus.textContent = "Copy failed — select the address to copy it manually.";
      });
    });
  } else if (copyBtn) {
    copyBtn.hidden = true; // no clipboard API: the mailto link still works
  }

  /* ── Hero EEG trace ───────────────────────────────
     Three stacked channels of summed sines plus a little noise.
     Not real data, but it moves the way a scalp trace does.
     Colours come from the CSS theme tokens, re-read on every switch. */
  var canvas = document.getElementById("wave");

  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Each channel: baseline height, stroke width, and a set of
    // [amplitude, frequency, phase-speed] sine components.
    var channels = [
      { y: 0.30, token: "--wave-1", width: 1.4, comps: [[14, 0.013, 0.9], [7, 0.031, -0.6], [4, 0.062, 1.4]] },
      { y: 0.58, token: "--wave-2", width: 1.1, comps: [[11, 0.010, 0.7], [6, 0.026, 1.1], [3, 0.055, -0.9]] },
      { y: 0.82, token: "--wave-3", width: 1.1, comps: [[9, 0.017, -0.5], [5, 0.038, 0.8], [3, 0.071, 1.2]] }
    ];

    function readColors() {
      var cs = getComputedStyle(root);
      channels.forEach(function (ch) {
        ch.color = cs.getPropertyValue(ch.token).trim() || "currentColor";
      });
    }

    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function trace(ch, t) {
      ctx.beginPath();
      ctx.strokeStyle = ch.color;
      ctx.lineWidth = ch.width;
      ctx.lineJoin = "round";
      var baseline = h * ch.y;
      for (var x = 0; x <= w; x += 2) {
        var v = 0;
        for (var i = 0; i < ch.comps.length; i++) {
          var c = ch.comps[i];
          v += c[0] * Math.sin(x * c[1] + t * c[2]);
        }
        v += (Math.random() - 0.5) * 1.6; // sensor noise
        if (x === 0) ctx.moveTo(x, baseline + v);
        else ctx.lineTo(x, baseline + v);
      }
      ctx.stroke();
    }

    function drawAll(t) {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < channels.length; i++) trace(channels[i], t);
    }

    readColors();
    resize();
    window.addEventListener("resize", function () { resize(); if (reduced) drawAll(0); });

    if (reduced) {
      // Static single pass — still a trace, just not animated.
      drawAll(0);
      onThemeChange = function () { readColors(); drawAll(0); };
    } else {
      var t = 0;
      (function frame() {
        drawAll(t);
        t += 0.02;
        requestAnimationFrame(frame);
      })();
      onThemeChange = readColors;
    }

    onThemeChange();
  }

  /* ── Scroll reveals ──────────────────────────────────
     Position sweep rather than IntersectionObserver: a big scroll jump
     (an anchor link, End, a restored scroll position) can move an element
     from below the viewport to above it between two observer samples, and
     it then never fires — leaving that section permanently invisible.
     Checking "is it at or above the fold" each time cannot miss. */
  var pending = Array.prototype.slice.call(document.querySelectorAll(".reveal"));

  if (reduced) {
    pending.forEach(function (el) { el.classList.add("in"); });
    pending = [];
  } else {
    // Deliberately not rAF-coalesced: requestAnimationFrame is suspended
    // whenever the page is throttled or backgrounded, and a suspended sweep
    // means blank sections. The work here is a handful of reads that shrinks
    // to zero as elements reveal, so running it inline is cheaper than the
    // failure mode it avoids.
    var sweep = function () {
      var fold = window.innerHeight * 0.9;
      for (var i = pending.length - 1; i >= 0; i--) {
        if (pending[i].getBoundingClientRect().top < fold) {
          pending[i].classList.add("in");
          pending.splice(i, 1);
        }
      }
      if (!pending.length) {
        window.removeEventListener("scroll", sweep);
        window.removeEventListener("resize", sweep);
        document.removeEventListener("visibilitychange", sweep);
        window.removeEventListener("pageshow", sweep);
      }
    };

    window.addEventListener("scroll", sweep, { passive: true });
    window.addEventListener("resize", sweep);
    // Covers a page scrolled or position-restored while backgrounded, which
    // arrives visible with no scroll event left to fire.
    document.addEventListener("visibilitychange", sweep);
    window.addEventListener("pageshow", sweep);

    sweep();
  }

  /* ── Nav: active section ─────────────────────────── */
  var links = Array.prototype.slice.call(document.querySelectorAll(".nav-links a"));
  var sections = links
    .map(function (a) { return document.querySelector(a.getAttribute("href")); })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id);
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }
})();
