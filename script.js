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

  /* ── omer-cli ─────────────────────────────────────
     A terminal for the RAG assistant. Slash commands answer locally from
     constants — instant, and no API spend on "/help". Anything else is a
     question: it goes to the FastAPI backend, which does retrieval and
     streams Claude's answer back over SSE. The key lives there, not here. */
  var ASK_ENDPOINT =
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:8000/api/ask"
      : "https://REPLACE-WITH-YOUR-BACKEND-HOST/api/ask";

  var term = document.getElementById("terminal");

  if (term) {
    var termOpenBtn = document.getElementById("term-open");
    var termCloseBtn = document.getElementById("term-close");
    var termScroll = document.getElementById("term-scroll");
    var termOut = document.getElementById("term-out");
    var termForm = document.getElementById("term-form");
    var termInput = document.getElementById("term-input");
    var tokensEl = document.getElementById("term-tokens");
    var costEl = document.getElementById("term-cost");
    var chunksEl = document.getElementById("term-chunks");

    var convo = [];        // conversation sent to the model
    var cmdHistory = [];   // what the user typed, for arrow-key recall
    var cmdIndex = -1;
    var termBusy = false;
    var totalTokens = 0;
    var pushedState = false;   // did *we* push the #terminal history entry?

    // Opus 5 list price, per million tokens.
    var PRICE_IN = 5.0, PRICE_OUT = 25.0;

    var COMMANDS = {
      "/help": function () {
        return (
          "Commands\n" +
          "  /whoami      who Omer is, in one paragraph\n" +
          "  /projects    the things he has built\n" +
          "  /skills      languages, frameworks, tools\n" +
          "  /contact     how to reach him\n" +
          "  /clear       clear the screen\n" +
          "  /exit        close the terminal\n\n" +
          "Anything that isn't a command is treated as a question. It is " +
          "embedded, matched against Omer's notes by cosine similarity, and " +
          "answered by Claude from the retrieved chunks only."
        );
      },
      "/whoami": function () {
        return (
          "Omer Ahmed — AI Engineering graduate, Abu Dhabi, UAE.\n\n" +
          "BSc Artificial Intelligence Engineering (Honours), Cyprus " +
          "International University. Works on real-time signal pipelines, " +
          "models that survive production, and the backends that keep them " +
          "running. Open to AI/ML engineering roles."
        );
      },
      "/projects": function () {
        return (
          "NeuroSense — Real-Time EEG Stress Classification   [flagship]\n" +
          "  8-channel BCI at 250 Hz. Random Forest, 80.5% LOSO accuracy\n" +
          "  across 36 subjects. Python, FastAPI, React, scikit-learn.\n\n" +
          "AI Therapist — Mental Health Classification\n" +
          "  DistilBERT on 42K statements, 82.7% val accuracy, 0.813 macro\n" +
          "  F1. FAISS retrieval. Led a team of 4.\n\n" +
          "Car Rental System — Relational Database\n" +
          "  Normalized schema, role-based access control, Tkinter GUI.\n\n" +
          "Ask about any of them for detail."
        );
      },
      "/skills": function () {
        return (
          "Programming   Python, SQL, C++, C, C#\n" +
          "Frameworks    PyTorch, TensorFlow, scikit-learn, Pandas, NumPy,\n" +
          "              Matplotlib, React, FAISS\n" +
          "Tools         FastAPI, Docker, Git, REST APIs, Streamlit,\n" +
          "              Supabase, Arduino\n" +
          "Languages     Arabic (native), English (fluent)"
        );
      },
      "/contact": function () {
        return (
          "email      amory30900@hotmail.com\n" +
          "phone      +971 56 382 0738\n" +
          "github     github.com/OmerTwelve\n" +
          "linkedin   linkedin.com/in/omertwelve\n" +
          "location   Abu Dhabi, UAE (UTC+4)"
        );
      }
    };

    var COMMAND_NAMES = Object.keys(COMMANDS).concat(["/clear", "/exit"]).sort();

    /* The nav wraps to two rows on narrow screens, so its height is measured
       rather than assumed — otherwise the terminal either clips under it or
       leaves a gap. */
    var nav = document.querySelector(".nav");
    function syncNavHeight() {
      root.style.setProperty("--nav-h", nav.getBoundingClientRect().height + "px");
    }
    syncNavHeight();
    window.addEventListener("resize", syncNavHeight);

    function openTerm(pushHash) {
      if (!term.hidden) return;
      syncNavHeight();
      term.hidden = false;
      document.body.classList.add("term-open");
      termOpenBtn.classList.add("open");
      termOpenBtn.setAttribute("aria-expanded", "true");
      if (pushHash !== false && location.hash !== "#terminal") {
        window.history.pushState(null, "", "#terminal");
        pushedState = true;
      }
      termInput.focus();
      loadStatus();
    }

    // fromPop: the browser already moved us, so don't move it again.
    function closeTerm(fromPop) {
      if (term.hidden) return;
      term.hidden = true;
      document.body.classList.remove("term-open");
      termOpenBtn.classList.remove("open");
      termOpenBtn.setAttribute("aria-expanded", "false");
      if (fromPop) {
        pushedState = false;
      } else if (pushedState) {
        pushedState = false;
        window.history.back();     // we pushed the entry, so undo it
      } else if (location.hash === "#terminal") {
        // Opened by deep link, so there is no entry of ours to go back to —
        // history.back() here would eject the visitor from the site entirely.
        window.history.replaceState(null, "", location.pathname + location.search);
      }
      termOpenBtn.focus();
    }

    // One fetch on first open: proves the backend is reachable and fills in
    // the corpus size, so the boot banner isn't quietly fictional.
    var statusLoaded = false;
    function loadStatus() {
      if (statusLoaded) return;
      statusLoaded = true;
      fetch(ASK_ENDPOINT.replace(/\/ask$/, "/health"))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          chunksEl.textContent = d && d.chunks != null ? d.chunks : "—";
        })
        .catch(function () { chunksEl.textContent = "offline"; });
    }

    function scrollDown() {
      termScroll.scrollTop = termScroll.scrollHeight;
    }

    function printCommand(text) {
      var entry = document.createElement("div");
      entry.className = "t-entry";

      var cmd = document.createElement("p");
      cmd.className = "t-cmd";
      var caret = document.createElement("span");
      caret.className = "term-caret";
      caret.textContent = "›";
      var what = document.createElement("span");
      what.textContent = text;
      cmd.appendChild(caret);
      cmd.appendChild(what);

      var body = document.createElement("div");
      body.className = "t-body";

      entry.appendChild(cmd);
      entry.appendChild(body);
      termOut.appendChild(entry);
      scrollDown();
      return body;
    }

    function setBusy(state) {
      termBusy = state;
      termInput.disabled = state;
      termForm.classList.toggle("busy", state);
      if (!state) termInput.focus();
    }

    function addSources(body, sources) {
      if (!sources || !sources.length) return;
      var ul = document.createElement("ul");
      ul.className = "t-sources";
      sources.forEach(function (s) {
        var li = document.createElement("li");
        li.textContent = s.title;
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }

    function updateMeter(usage) {
      if (!usage) return;
      var i = usage.input_tokens || 0, o = usage.output_tokens || 0;
      totalTokens += i + o;
      tokensEl.textContent =
        totalTokens >= 1000 ? (totalTokens / 1000).toFixed(1) + "k" : totalTokens;
      var cost = parseFloat(costEl.textContent) || 0;
      cost += (i / 1e6) * PRICE_IN + (o / 1e6) * PRICE_OUT;
      costEl.textContent = cost.toFixed(4);
    }

    async function askBackend(question) {
      var body = printCommand(question);
      body.classList.add("streaming");
      setBusy(true);

      var answer = "";
      try {
        var res = await fetch(ASK_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: question, history: convo.slice(-6) })
        });

        if (!res.ok) {
          var msg = "Request failed (" + res.status + ").";
          try {
            var j = await res.json();
            if (j && j.error) msg = j.error;
          } catch (e) { /* non-JSON body — keep the status message */ }
          throw new Error(msg);
        }

        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";

        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });

          // SSE frames end with a blank line; a trailing partial frame stays
          // in the buffer until its terminator arrives.
          var frames = buffer.split("\n\n");
          buffer = frames.pop();

          for (var i = 0; i < frames.length; i++) {
            var line = frames[i].trim();
            if (line.indexOf("data:") !== 0) continue;

            var payload;
            try { payload = JSON.parse(line.slice(5).trim()); }
            catch (e) { continue; }

            if (payload.error) throw new Error(payload.error);

            if (payload.delta) {
              answer += payload.delta;
              body.textContent = answer;   // textContent: a reply can't inject markup
              scrollDown();
            }

            if (payload.done) {
              body.classList.remove("streaming");
              addSources(body, payload.sources);
              updateMeter(payload.usage);
            }
          }
        }

        convo.push({ role: "user", content: question });
        convo.push({ role: "assistant", content: answer });
      } catch (err) {
        body.classList.add("err");
        body.textContent =
          (err && err.message) ||
          "Could not reach the assistant. Omer is on amory30900@hotmail.com.";
      } finally {
        body.classList.remove("streaming");
        setBusy(false);
        scrollDown();
      }
    }

    function run(raw) {
      var input = raw.trim();
      if (!input) return;

      cmdHistory.push(input);
      cmdIndex = cmdHistory.length;

      if (input.charAt(0) === "/") {
        var name = input.split(/\s+/)[0].toLowerCase();

        if (name === "/clear") {
          termOut.textContent = "";
          return;
        }
        if (name === "/exit") {
          closeTerm();
          return;
        }
        if (COMMANDS[name]) {
          printCommand(input).textContent = COMMANDS[name]();
          scrollDown();
          return;
        }

        var body = printCommand(input);
        body.classList.add("err");
        body.textContent =
          "Unknown command: " + name + "\nType /help for the list.";
        scrollDown();
        return;
      }

      askBackend(input);
    }

    termForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (termBusy) return;
      var value = termInput.value;
      termInput.value = "";
      run(value);
    });

    termInput.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (!cmdHistory.length) return;
        e.preventDefault();
        cmdIndex += e.key === "ArrowUp" ? -1 : 1;
        cmdIndex = Math.max(0, Math.min(cmdIndex, cmdHistory.length));
        termInput.value = cmdHistory[cmdIndex] || "";
        // Put the caret at the end, not wherever it happened to be.
        var end = termInput.value.length;
        requestAnimationFrame(function () { termInput.setSelectionRange(end, end); });
        return;
      }

      if (e.key === "Tab") {
        var v = termInput.value.trim();
        if (v.charAt(0) !== "/") return;
        var matches = COMMAND_NAMES.filter(function (c) { return c.indexOf(v) === 0; });
        if (!matches.length) return;
        e.preventDefault();
        if (matches.length === 1) {
          termInput.value = matches[0] + " ";
        } else {
          printCommand(v).textContent = matches.join("  ");
          scrollDown();
        }
      }
    });

    termOpenBtn.setAttribute("aria-expanded", "false");
    termOpenBtn.addEventListener("click", function () {
      term.hidden ? openTerm() : closeTerm();
    });
    termCloseBtn.addEventListener("click", function () { closeTerm(); });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !term.hidden) closeTerm();
    });

    // Clicking the empty area focuses the prompt, the way a terminal does —
    // but not when the user is selecting text to copy.
    termScroll.addEventListener("click", function (e) {
      if (e.target.closest("a, button")) return;
      if (String(window.getSelection())) return;
      termInput.focus();
    });

    // Deep link: /#terminal opens it directly, so it can be shared. popstate
    // (not hashchange) so the Back button closes the terminal rather than
    // navigating away from the site.
    if (location.hash === "#terminal") openTerm(false);
    window.addEventListener("popstate", function () {
      if (location.hash === "#terminal") openTerm(false);
      else closeTerm(true);
    });
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
