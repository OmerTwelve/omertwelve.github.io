# Portfolio — Omer Ahmed

Static personal site. Three files, no build step, no dependencies.

```
index.html   content + structure
styles.css   design tokens at the top, then layout, then components
script.js    theme toggle, Abu Dhabi clock, hero EEG trace, copy-email,
             scroll reveals, nav state
assets/      avatar.png (48x48, transparent), favicon.png, apple-touch-icon.png
```

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
