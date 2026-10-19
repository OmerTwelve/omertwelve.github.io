# Portfolio — Omer Ahmed

Static personal site — no build step, no framework. The page has no runtime
dependencies; the assistant is a separate FastAPI service.

```
index.html          content + structure

css/tokens.css      design tokens, both themes — nothing else hardcodes a colour
css/base.css        reset, page defaults, shared utilities
css/nav.css         css/hero.css      css/sections.css
css/contact.css     css/terminal.css  css/motion.css

js/main.js          entry: imports each feature and calls its init
js/config.js        backend URL, token pricing, reduced-motion flag
js/theme.js         theme toggle; emits `themechange`
js/clock.js         js/copy-email.js  js/hero-wave.js
js/reveal.js        js/nav.js
js/terminal/        index.js (shell) · commands.js (text) · client.js (SSE)

assets/             avatar.png (48x48, transparent), favicon.png, apple-touch-icon.png,
                    omer-code.webp (terminal wordmark)

rag/knowledge/      the assistant's source notes (markdown, one topic per "## ")
rag/build_kb.py     chunk + embed the notes -> backend/kb.json
backend/            FastAPI service: retrieval + DeepSeek, holds the API key
                    (llm.py is the only file that knows about the model)
```

### How the frontend is organised

Native ES modules and one stylesheet per component — **no bundler, no build
step.** Each JS module exports a single `initX()` that no-ops when its markup is
absent, so `main.js` is just the wiring order and deleting a feature is one
import and one call.

Two rules keep the pieces from re-tangling:

- **Modules don't call each other's internals.** The hero canvas needs to
  re-read its colours when the theme flips, so `theme.js` emits a
  `themechange` event on `document` and `hero-wave.js` listens. Neither knows
  the other exists. (The single-file version used a mutable `onThemeChange`
  variable declared early purely to satisfy hoisting — the event removes both
  the coupling and the ordering constraint.)
- **Terminal concerns are separated**: `commands.js` is text and knows no DOM,
  `client.js` is transport and knows no DOM, `index.js` owns the DOM. `/help`
  is generated from the command table, so it cannot drift out of date.

Stylesheets are separate `<link>` tags in cascade order, not `@import` —
`@import` chains serialise the requests and delay first paint. Media queries
live beside the component they modify rather than in one responsive file.

Two gotchas this structure introduces, both already handled:

- **`url()` in CSS resolves against the stylesheet, not the document.** Moving
  the CSS into `css/` broke the hero portrait until it became
  `../assets/avatar.png`.
- **ES modules need `http://`.** Opening `index.html` from the filesystem no
  longer works — module loading fails CORS on `file://`. Use the local server
  below; GitHub Pages serves over HTTP so production is unaffected.

The page itself is still a dependency-free static site. The assistant is a
separate service the page calls — the site works with the backend offline, it
just can't answer questions.

## omer-code — the RAG assistant

The assistant lives in a full-screen terminal, opened from the `>_` button in
the nav (next to the theme toggle) or by deep link at `/#terminal`. It is not
on the main page: the page stays a portfolio, and the terminal is a deliberate
second surface.

Terminal behaviour:

- **Slash commands answer locally** — `/help`, `/whoami`, `/projects`,
  `/skills`, `/contact`, `/clear`, `/exit`. Instant, and no API spend.
- Anything that isn't a command is a question and goes to the backend.
- `Tab` completes commands, `↑`/`↓` walk input history, `Esc` closes.
- The token/cost meter is real — the backend returns `usage` from the API
  response and priced by the backend (`config.PRICE_*_PER_M`), which owns the
  rates. It is an estimate, hence the `~$`: DeepSeek bills peak and off-peak
  differently, and the configured rates are the highest published ones.
- It sits *below* the sticky nav. `--nav-h` is measured in JS because the nav
  wraps to two rows on narrow screens; a hardcoded height clips or gaps.

The wordmark is `assets/omer-code.webp` — **480px wide, displayed at a 240px
cap, so exactly 2x for retina.** `width`/`height` are on the `<img>` so the
boot text below doesn't jump when it decodes.

Three things about it are deliberate:

- **Size the asset to the display, not bigger.** The first version shipped at
  720px against a 360px cap, and on narrower screens where the clamp floor
  applied, the browser was downscaling 3.6x at render time — which smeared the
  block edges, bevels and outline into mush. Oversizing is not free. If the CSS
  cap changes, re-export the asset at 2x the new cap.
- **Sharpen after downscaling.** Going 1290px -> 480px softens the hard edges
  that make this read as pixel art, so there's an unsharp pass on **RGB only** —
  sharpening the alpha channel crunches the outline.
- **WebP, not PNG.** The artwork is heavily anti-aliased (~90% of pixels carry
  partial alpha), which PNG can't compress: 356 KB as RGBA PNG vs 45 KB as
  WebP q90, with a measured alpha difference of zero. Quantising the PNG to 64
  colours reached 33 KB but shifted alpha by up to 50/255 and left only 17% of
  the background fully transparent instead of 43% — a visible haze over the
  terminal ground. If the wordmark is re-exported, check the alpha survived,
  not just the file size.

Note this artwork has **no consistent pixel grid** (edge-spacing analysis finds
no dominant block size), so the rebuild-to-native-grid trick used for the
portrait does not apply — it has to be resampled smoothly and sharpened.

### Running it

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate      # Windows
pip install -r requirements.txt
cp .env.example .env                                 # then set DEEPSEEK_API_KEY in it
python ../rag/build_kb.py                            # writes backend/kb.json
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --no-proxy-headers
```

Then set `API_BASE` in `js/config.js` to the deployed URL. It already points at
`http://localhost:8000` when the page is served from localhost, so local
development needs no edit.

### Deploying on Cloudflare Workers

See [worker/README.md](worker/README.md) for deployment commands, Worker secrets,
rate limits, and connecting GitHub Pages to the deployed API. The Worker uses all
portfolio notes as context instead of running the local embedding model.

### Adding to the knowledge base

Drop a markdown file in `rag/knowledge/`, one topic per `## ` heading, then
re-run `python rag/build_kb.py` and restart the backend. Each `## ` section
becomes one retrievable chunk, so write each as a self-contained answer to a
question someone would actually ask — the heading is embedded along with the
body, so it carries the topic.

### Retrieval: the relevance floor is a cost decision, not a gap

bge-small has a compressed similarity range, and on a hand-written set of
questions (`rag/eval_retrieval.py`: 18 on-topic, 8 off-topic) the two classes
**overlap**. On-topic best scores run 0.48–0.82, off-topic 0.41–0.62 — *"Explain
how quantum computing works"* scores 0.62, above the weakest real question. No
single threshold separates them, so `MIN_SCORE` is set by what each mistake
costs:

- **False rejection** (a real question gets "I don't have anything on that"):
  the bot looks broken, in front of exactly the person the site is for.
  Expensive.
- **False acceptance** (an off-topic question reaches the model): about $0.0004,
  and the model declines it — checked against injection and off-topic probes.
  Cheap.

So the floor sits low. At the old `0.50`, *"what's his proudest accomplishment?"*
(0.482) and *"most impressive thing he shipped?"* (0.487) were wrongly
rejected; at `0.45` the eval shows **0/18** false rejections, at the price of 3/8
off-topic questions reaching the model. The sample is small — treat 0.45 as a
reasonable setting, not a precise one, and **re-run the eval after any change to
the notes**:

```bash
python rag/eval_retrieval.py      # exits non-zero if a real question would be rejected
```

`REL_MARGIN = 0.12` then keeps only chunks close to the best hit, which a fixed
cutoff can't do: 0.62 is filler beneath a 0.75 top hit but the only answer
beneath a 0.56 one.

Two things that did *not* work, so nobody retries them:

- **Anchoring the query** (`"Omer Ahmed: <question>"`) lifts on-topic scores
  (0.48 → 0.64) but lifts off-topic ones just as much ("capital of France"
  0.45 → 0.67), so separation barely moves (−0.136 → −0.060, still negative).
- **A tighter floor** just trades the cheap error for the expensive one.

**Vague questions need a curated chunk.** "Biggest win", "most impressive thing"
match no specific chunk — every profile chunk scores about the same — so the
actual answer (the 2.5s → 0.02s latency fix) was crowded out of the top 5.
`01-profile.md` carries a section whose *heading* uses the words people actually
type ("biggest achievements, standout results, most impressive work") and whose
body restates the headline numbers, all drawn from the other notes. When a new
kind of question fails, the fix is usually another chunk like that, not a
threshold.

### The embedding model must match on both sides

`rag/build_kb.py` and the live retriever both read `EMBED_MODEL` from
`backend/config.py`. A query embedded by a different model than the documents
lands in a different vector space and retrieval returns confident nonsense with
no error anywhere — so `Retriever.__init__` refuses to start if `kb.json` was
built with a different model than the one configured.

### Guardrails

- **Grounding** — the system prompt allows answers only from retrieved context,
  and requires saying so plainly when the answer isn't there. Inventing a fact
  about a real person's career is the failure mode that matters here.
- **Off-topic** — if nothing clears `MIN_SCORE`, the backend returns a fixed
  reply and never calls the model. Faster (0.3s vs ~1.7s), and it can't
  hallucinate.
- **History** — opening pushes a `#terminal` entry so Back closes the terminal;
  opening *by deep link* pushes nothing, so closing then strips the hash with
  `replaceState`. Calling `history.back()` in that case navigates the visitor
  off the site entirely.
- **Prompt injection** — the visitor's question is treated as untrusted data.
  Note that retrieval *will* still return chunks for an injection attempt; that
  is expected, since retrieval is semantic. The defence is the system prompt,
  not the retriever.
- **Rate limits** — `backend/ratelimit.py`, three limits checked together:
  6/min and 60/day **per client**, and 400/day **globally**
  (`RATE_PER_MINUTE`, `RATE_PER_DAY`, `GLOBAL_PER_DAY`). The global one is the
  limit that still holds when the per-client ones are dodged by many addresses,
  and it is what actually bounds spend — set it from the cost-per-answer you
  read off the terminal's usage meter. A refusal returns `429` with a
  `Retry-After` header and a message saying how long to wait (or to email Omer
  when the daily cap is spent).

  Details that matter:

  - **Forwarding headers are ignored by default.** The client address is the
    socket peer unless `CLIENT_IP_HEADER` is set. A header is
    attacker-controlled unless a proxy *you run* overwrites it, so trusting one
    by default lets a script send a fresh fake `X-Forwarded-For` per request and
    never hit a limit. Set it only when the backend is reachable *exclusively*
    through that proxy — e.g. `cf-connecting-ip` behind a Cloudflare tunnel. For
    `X-Forwarded-For` the **rightmost** entry is used, because each proxy
    appends; everything left of it was client-supplied. Behind a tunnel with the
    setting left empty, all visitors share one bucket (annoying, not costly),
    and the backend logs a warning saying so.
  - **Run uvicorn with `--no-proxy-headers`.** Uvicorn has its own
    proxy-header handling, on by default: for a peer in `--forwarded-allow-ips`
    (default `127.0.0.1`) it overwrites the request's client address from
    `X-Forwarded-For` *before this app sees it*. That bypasses the
    `CLIENT_IP_HEADER` decision above — found the hard way, when a test client
    on `127.0.0.1` could rotate a fake header and defeat the limiter. With the
    flag, `ratelimit.py` is the single place that decides who a client is.
    **After deploying, verify it:** hit the endpoint from two different
    networks (home Wi-Fi and phone data) and confirm they get separate
    quotas. If they share one, the header isn't reaching the app and the
    backend log will say so.
  - **IPv6 is bucketed by /64**, since one subscriber is routinely handed a
    whole /64 and could otherwise rotate through 2^64 fresh quotas.
  - **Memory is bounded.** Only *accepted* requests create entries, so the
    table can't exceed `GLOBAL_PER_DAY`; a periodic sweep frees clients that
    never return. (The previous version allocated an entry for every rejected
    request and only freed *empty* ones, which a one-time address never became.)
  - **A global refusal doesn't charge the client's own quota.**
  - **In-process state, single worker only.** More than one worker means each
    gets its own counters and every limit multiplies by the worker count. Move
    the counters to Redis before scaling out.

  Tests are stdlib-only with an injected clock, so window boundaries are exact
  and nothing sleeps:

  ```bash
  cd backend && python -m unittest discover -s tests -v
  ```
- **Thinking is off, and that is measured.** `deepseek-flash` reasons by
  default, and the reasoning tokens count against `max_tokens`. Same question,
  `deepseek-flash`: with `max_tokens=60` the thinking run returned an **empty
  answer** (`finish_reason=length`, 329 characters of reasoning, none of
  content) where the non-thinking run finished in 42 tokens; at `max_tokens=800`
  it was 1.8s / 116 tokens with thinking vs 1.1s / 52 without. Grounded Q&A over
  a few retrieved paragraphs gains nothing from reasoning, so it is disabled via
  `extra_body={"thinking": {"type": "disabled"}}`. Set `DEEPSEEK_THINKING=true`
  to restore it.
- **Use `deepseek-flash`, not `deepseek-chat`.** `deepseek-chat` still works but
  DeepSeek's API reports it as *served by* `deepseek-flash`, and it is absent from
  both the docs and `/models` — a legacy alias that can be withdrawn without
  notice. (It was also the non-thinking one, which is why switching names means
  you must switch thinking off explicitly.) knowladge-feed still uses it.
- **Cost** — about $0.0003–0.0005 per answer (roughly 650–1,300 tokens in, 50–140
  out). `GLOBAL_PER_DAY=400` therefore bounds worst-case spend to well under a
  dollar a day; raise it if real traffic ever needs more.

## The portrait

`assets/avatar.png` is **48×48 pixels — under 1 KB** — and the page scales it up
with `image-rendering: pixelated`. The original export was 1024×1024 with 25k
colours (resampled, so the pixel edges were soft); it was rebuilt by detecting
the true 48px grid, taking each block's median colour, and quantising to 16.
Shipping the small file and scaling in CSS is both lighter and sharper than
shipping the 1024px one.

The background was flood-filled to transparency **from the border inward**, not
by colour-keying every light pixel — the eye whites are near-white too, and a
plain key would punch them out. The fill only reaches pixels connected to the
edge, so the 4 enclosed eye pixels survive.

### In the hero

It sits behind the type as a large ghosted watermark bleeding off the right
edge (`.hero-portrait`), running the full height of the hero — the stat row is
deliberately left transparent so the figure reads as one continuous shape
instead of being sliced at the rule. Two things there are load-bearing:

- **`grayscale()`, not `brightness(0)`.** A flat silhouette loses the hair,
  brows and eyes and just reads as a smudge. Dark mode adds `invert(1)` so the
  near-black figure doesn't disappear into the ground.
- **`.stat-row span` uses `--fg-dim`, not `--muted`.** Those captions sit right
  on top of the figure. Muted grey measures **3.94:1** light / **4.07:1** dark
  against the watermark's darkest pixels — both under the 4.5:1 floor. The
  dimmer ink measures **6.98:1** and **6.54:1**, which is what lets the
  watermark stay behind the text rather than being masked out. If the
  watermark's opacity goes up, re-check this.

### Favicons

Whole figure, transparent background. The 48px art is **centred in a 60×60
canvas** so there is even padding on all four sides: the raw sprite runs edge to
edge at the bottom (the shoulder row is the full 46px wide) with only 2px above
it, which in a browser tab reads as bottom-aligned and cropped rather than
centred like other sites' icons. 60×60 also scales to the 180px
`apple-touch-icon` at exactly ×3, so the pixels stay square.

Regenerate after changing the source:

```bash
python -c "from PIL import Image; s=Image.open('assets/avatar.png').convert('RGBA'); c=s.crop(s.getbbox()); cv=Image.new('RGBA',(60,60),(0,0,0,0)); cv.paste(c,((60-c.width)//2,(60-c.height)//2)); cv.save('assets/favicon.png',optimize=True); cv.resize((180,180),Image.NEAREST).save('assets/apple-touch-icon.png',optimize=True)"
```

Note: on a dark browser chrome the near-black hair blends into the tab bar —
unavoidable with a transparent background and this artwork. Giving the icon a
solid ground would fix it, at the cost of the transparency.

## Run locally

```bash
python -m http.server 4321
```

Then open http://localhost:4321. A server is required — the page uses native
ES modules, which browsers refuse to load over `file://`.

## Deploy to GitHub Pages

```bash
git init && git add -A && git commit -m "Portfolio site"
gh repo create omertwelve.github.io --public --source=. --push
```

A repo named `<username>.github.io` publishes at `https://<username>.github.io`
automatically. For any other repo name, enable Pages in
**Settings → Pages → Source: main / root**, and the site lands at
`https://<username>.github.io/<repo>`.

Netlify and Cloudflare Pages also work — drag the folder in, no build command,
publish directory `.`.

## Design system

Editorial: high-contrast serif for display type, a grotesque for body, mono for
metadata. Hard hairline rules, square corners (`--radius: 0` is deliberate),
paper ground with a faint grid in the hero.

**Type roles** — each family has one job, don't mix them:

| Family | Role |
|---|---|
| Playfair Display | Display headings, wordmark, project titles |
| Space Grotesk | Body copy, buttons, navigation |
| JetBrains Mono | Dates, tags, stats, email, clock, section numbers |

**Two accents**, splitting emphasis from labelling:

- `--chip` — the lime highlight fill (Flagship, Honours badges). Black text on it.
- `--label` — warm rust for micro-labels, eyebrows, bullet dashes, active nav.

## Theming

Light is the default. Dark is opt-in via the nav toggle, stored in
`localStorage` and applied by a small script in `<head>` before first paint so
there is no flash on reload.

Both palettes live in `styles.css`: light on bare `:root`, dark on
`:root[data-theme="dark"]`. Nothing below that block hardcodes a colour, so
adding a component means using the tokens and getting both themes for free.

All text/background pairs clear WCAG AA (4.5:1). Tightest pairs: 5.05:1 light
(muted metadata on paper), 5.36:1 dark (muted on a card). Text over the hero
watermark is measured against the figure's darkest pixels, not clean paper —
see "The portrait".

## Editing

- **Colors and type** — the two token blocks at the top of `styles.css`.
  Change an accent there and every use of it follows.
- **Content** — all in `index.html`. Adding a project means copying one
  `<article class="block card">` and giving it a `date`, `place`, and optional
  `chip`.
- **Hero animation** — the `channels` array in `script.js`. Each channel is a set
  of `[amplitude, frequency, phase-speed]` sine components. It respects
  `prefers-reduced-motion` and draws a static trace instead.
- **Clock** — pinned to `Asia/Dubai`, not the viewer's timezone: the point is to
  show a recruiter what time it is for Omer. Hides itself if `Intl` has no
  timezone data rather than showing a wrong time.
