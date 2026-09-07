/**
 * omer-cli — the terminal shell.
 *
 * Owns the DOM and the interaction model: open/close, history, tab completion,
 * and rendering. Command text lives in ./commands.js and the network in
 * ./client.js, so this file stays about behaviour.
 */

import { PRICE_IN, PRICE_OUT } from "../config.js";
import { syncNavHeight } from "../nav.js";
import { COMMANDS, COMMAND_NAMES, helpText } from "./commands.js";
import { askStream, fetchHealth } from "./client.js";

export function initTerminal() {
  const term = document.getElementById("terminal");
  if (!term) return;

  const openBtn = document.getElementById("term-open");
  const closeBtn = document.getElementById("term-close");
  const scroller = document.getElementById("term-scroll");
  const out = document.getElementById("term-out");
  const form = document.getElementById("term-form");
  const input = document.getElementById("term-input");
  const tokensEl = document.getElementById("term-tokens");
  const costEl = document.getElementById("term-cost");
  const chunksEl = document.getElementById("term-chunks");

  const convo = [];       // conversation sent to the model
  const typed = [];       // what the visitor typed, for arrow-key recall
  let typedIndex = 0;
  let busy = false;
  let totalTokens = 0;
  let totalCost = 0;
  let pushedState = false; // did *we* push the #terminal history entry?
  let statusLoaded = false;

  /* ── rendering ──────────────────────────────────── */

  const scrollDown = () => {
    scroller.scrollTop = scroller.scrollHeight;
  };

  /** Echo the command and return the body element to write the answer into. */
  function printEntry(text) {
    const entry = document.createElement("div");
    entry.className = "t-entry";

    const cmd = document.createElement("p");
    cmd.className = "t-cmd";
    const caret = document.createElement("span");
    caret.className = "term-caret";
    caret.textContent = "›";
    const what = document.createElement("span");
    what.textContent = text;
    cmd.append(caret, what);

    const body = document.createElement("div");
    body.className = "t-body";

    entry.append(cmd, body);
    out.append(entry);
    scrollDown();
    return body;
  }

  function printError(text, message) {
    const body = printEntry(text);
    body.classList.add("err");
    body.textContent = message;
    scrollDown();
  }

  function addSources(body, sources) {
    if (!sources?.length) return;
    const ul = document.createElement("ul");
    ul.className = "t-sources";
    for (const s of sources) {
      const li = document.createElement("li");
      li.textContent = s.title;
      ul.append(li);
    }
    body.append(ul);
  }

  function updateMeter(usage) {
    if (!usage) return;
    const input_ = usage.input_tokens || 0;
    const output = usage.output_tokens || 0;

    totalTokens += input_ + output;
    tokensEl.textContent =
      totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens;

    totalCost += (input_ / 1e6) * PRICE_IN + (output / 1e6) * PRICE_OUT;
    costEl.textContent = totalCost.toFixed(4);
  }

  function setBusy(state) {
    busy = state;
    input.disabled = state;
    form.classList.toggle("busy", state);
    if (!state) input.focus();
  }

  /* ── open / close ───────────────────────────────── */

  function open(pushHash = true) {
    if (!term.hidden) return;
    syncNavHeight();
    term.hidden = false;
    document.body.classList.add("term-open");
    openBtn.classList.add("open");
    openBtn.setAttribute("aria-expanded", "true");

    if (pushHash && location.hash !== "#terminal") {
      window.history.pushState(null, "", "#terminal");
      pushedState = true;
    }

    input.focus();
    loadStatus();
  }

  /** @param {boolean} fromPop the browser already moved us; don't move it again */
  function close(fromPop = false) {
    if (term.hidden) return;
    term.hidden = true;
    document.body.classList.remove("term-open");
    openBtn.classList.remove("open");
    openBtn.setAttribute("aria-expanded", "false");

    if (fromPop) {
      pushedState = false;
    } else if (pushedState) {
      pushedState = false;
      window.history.back(); // we pushed the entry, so undo it
    } else if (location.hash === "#terminal") {
      // Opened by deep link, so there is no entry of ours to go back to —
      // history.back() here would eject the visitor from the site entirely.
      window.history.replaceState(null, "", location.pathname + location.search);
    }

    openBtn.focus();
  }

  /** One call on first open, so the boot banner isn't quietly fictional. */
  async function loadStatus() {
    if (statusLoaded) return;
    statusLoaded = true;
    const health = await fetchHealth();
    chunksEl.textContent = health?.chunks ?? "offline";
  }

  /* ── running input ──────────────────────────────── */

  async function ask(question) {
    const body = printEntry(question);
    body.classList.add("streaming");
    setBusy(true);

    let answer = "";
    try {
      await askStream(question, convo, {
        onDelta: (text) => {
          answer += text;
          body.textContent = answer; // textContent: a reply can't inject markup
          scrollDown();
        },
        onDone: ({ sources, usage }) => {
          body.classList.remove("streaming");
          addSources(body, sources);
          updateMeter(usage);
        },
      });

      convo.push({ role: "user", content: question });
      convo.push({ role: "assistant", content: answer });
    } catch (err) {
      body.classList.add("err");
      body.textContent =
        err?.message ||
        "Could not reach the assistant. Omer is on amory30900@hotmail.com.";
    } finally {
      body.classList.remove("streaming");
      setBusy(false);
      scrollDown();
    }
  }

  function run(raw) {
    const value = raw.trim();
    if (!value) return;

    typed.push(value);
    typedIndex = typed.length;

    if (!value.startsWith("/")) {
      ask(value);
      return;
    }

    const name = value.split(/\s+/)[0].toLowerCase();

    if (name === "/clear") {
      out.replaceChildren();
      return;
    }
    if (name === "/exit") {
      close();
      return;
    }
    if (name === "/help") {
      printEntry(value).textContent = helpText();
      scrollDown();
      return;
    }
    if (COMMANDS[name]) {
      printEntry(value).textContent = COMMANDS[name].run();
      scrollDown();
      return;
    }

    printError(value, `Unknown command: ${name}\nType /help for the list.`);
  }

  /* ── wiring ─────────────────────────────────────── */

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) return;
    const value = input.value;
    input.value = "";
    run(value);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!typed.length) return;
      e.preventDefault();
      typedIndex += e.key === "ArrowUp" ? -1 : 1;
      typedIndex = Math.max(0, Math.min(typedIndex, typed.length));
      input.value = typed[typedIndex] || "";
      // Put the caret at the end, not wherever it happened to be.
      const end = input.value.length;
      requestAnimationFrame(() => input.setSelectionRange(end, end));
      return;
    }

    if (e.key === "Tab") {
      const value = input.value.trim();
      if (!value.startsWith("/")) return;
      const matches = COMMAND_NAMES.filter((c) => c.startsWith(value));
      if (!matches.length) return;
      e.preventDefault();
      if (matches.length === 1) input.value = `${matches[0]} `;
      else {
        printEntry(value).textContent = matches.join("  ");
        scrollDown();
      }
    }
  });

  openBtn.setAttribute("aria-expanded", "false");
  openBtn.addEventListener("click", () => (term.hidden ? open() : close()));
  closeBtn.addEventListener("click", () => close());

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !term.hidden) close();
  });

  // Clicking empty space focuses the prompt, the way a terminal does — but not
  // while the visitor is selecting text to copy.
  scroller.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) return;
    if (String(window.getSelection())) return;
    input.focus();
  });

  // Deep link: /#terminal opens it directly, so it can be shared. popstate
  // (not hashchange) so Back closes the terminal rather than leaving the site.
  if (location.hash === "#terminal") open(false);
  window.addEventListener("popstate", () => {
    if (location.hash === "#terminal") open(false);
    else close(true);
  });
}
