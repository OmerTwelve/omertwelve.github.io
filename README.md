# Portfolio — Omer Ahmed

Static personal site. Three files, no build step, no dependencies.

```
index.html      content + structure
styles.css      design tokens at the top, then layout, then components
script.js       theme toggle, Abu Dhabi clock, hero EEG trace, copy-email,
                RAG chat client, scroll reveals, nav state
assets/         avatar.png (48x48, transparent), favicon.png, apple-touch-icon.png

rag/knowledge/  the assistant's source notes (markdown, one topic per "## ")
rag/build_kb.py chunk + embed the notes -> backend/kb.json
backend/        FastAPI service: retrieval + Claude, holds the API key
```

The page itself is still a dependency-free static site. The assistant is a
separate service the page calls — the site works with the backend offline, it
just can't answer questions.

## The RAG assistant

Visitors can ask the site questions about Omer. The flow:

```
browser  --POST /api/ask-->  FastAPI
                               |- embed the question   (bge-small, local, CPU)
                               |- cosine over kb.json   (31 chunks, exact)
                               |- top chunks -> Claude Opus 5
                               '--SSE stream------------> browser
```

**The API key lives only in the backend.** The site is static, in a public
repo, so anything shipped to the browser is public. That is the whole reason
this is a service rather than a `fetch` from `script.js`.

### Running it

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate      # Windows
pip install -r requirements.txt
cp .env.example .env                                 # then paste your key in
python ../rag/build_kb.py                            # writes backend/kb.json
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Then set `ASK_ENDPOINT` near the bottom of `script.js` to the deployed URL. It
already points at `http://localhost:8000` when the page is served from
localhost, so local development needs no edit.

### Adding to the knowledge base

Drop a markdown file in `rag/knowledge/`, one topic per `## ` heading, then
re-run `python rag/build_kb.py` and restart the backend. Each `## ` section
becomes one retrievable chunk, so write each as a self-contained answer to a
question someone would actually ask — the heading is embedded along with the
body, so it carries the topic.

### Retrieval thresholds are measured, not guessed

`config.MIN_SCORE` and `REL_MARGIN` exist because one global cutoff cannot do
the job. bge-small has a compressed similarity range — measured on this corpus,
real questions score **0.56–0.78** against their correct chunk while off-topic
questions ("what is the capital of France?") still reach **0.45–0.46** against
their best one.

- `MIN_SCORE = 0.50` sits in that gap and answers "do we know anything about
  this at all". Set it to 0.62 and *"what did he do at his internship?"* (0.56)
  retrieves nothing — a question worth answering.
- `REL_MARGIN = 0.12` then keeps only chunks close to the best hit. A fixed
  cutoff can't: 0.62 is filler beneath a 0.75 top hit, but the only answer
  beneath a 0.56 one.

Re-measure both if the embedding model or the corpus changes materially.

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
  reply and never calls Claude. Cheaper, and it can't hallucinate.
- **Prompt injection** — the visitor's question is treated as untrusted data.
  Note that retrieval *will* still return chunks for an injection attempt; that
  is expected, since retrieval is semantic. The defence is the system prompt,
  not the retriever.
- **Rate limits** — 6/min and 60/day per IP, in-process. Single instance only:
  run more than one worker and each gets its own counters, so the effective
  limit multiplies. Move to Redis before scaling out.
- **Cost** — `max_tokens` 800 and `effort: low`, suited to short grounded
  answers. Thinking is left on: lowering effort is the documented way to cut
  cost on Opus 5, whereas disabling thinking has its own failure modes.
- **Refusal fallback** — a policy decline retries on `claude-opus-4-8` inside
  the same call so a visitor doesn't get a dead stream. Set
  `USE_REFUSAL_FALLBACK=false` to drop it.

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

Then open http://localhost:4321. (Opening `index.html` directly via `file://`
works too — nothing here needs a server.)

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
