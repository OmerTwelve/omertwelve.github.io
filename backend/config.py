"""Configuration for the portfolio RAG assistant.

Everything tunable lives here. Secrets come from the environment and are never
committed — see .env.example.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

# Read backend/.env, as knowladge-feed's config.py does. Loaded by explicit path
# so it works whatever directory uvicorn is started from. (Without this the
# .env file was never read at all — every setting had to be exported by hand.)
load_dotenv(BASE_DIR / ".env")

# ── Embeddings ────────────────────────────────────────────────────────────
# Shared by rag/build_kb.py and the live retriever. If these ever differ, the
# query and the documents end up in different vector spaces and retrieval
# silently degrades to noise — so both import this one constant.
# bge-small: 384 dims, ~130 MB, runs on CPU via ONNX with no torch dependency.
EMBED_MODEL = "BAAI/bge-small-en-v1.5"
KB_PATH = BASE_DIR / "kb.json"

# How many chunks to put in front of the model. Five is enough for a focused
# answer without burying the relevant one in filler.
TOP_K = int(os.getenv("TOP_K", "5"))

# Retrieval uses two thresholds. bge-small has a compressed similarity range, and
# on an 18 on-topic / 8 off-topic question set (rag/eval_retrieval.py) the two
# classes OVERLAP: on-topic best scores run 0.48-0.86, off-topic 0.41-0.62
# ("Explain how quantum computing works" scores 0.62, above the weakest real
# question). No single threshold separates them, so this one is chosen by the
# cost of being wrong rather than by finding a gap that doesn't exist:
#
#   false REJECTION  an on-topic question gets "I don't have anything on that" —
#                    the bot looks broken, in front of exactly the person the
#                    site is for. This is the expensive error.
#   false ACCEPTANCE an off-topic question reaches the model, which declines it
#                    (verified against injection and off-topic probes). Costs
#                    about $0.0004. This is the cheap error.
#
# So the floor sits low. At 0.50, "what's his proudest accomplishment?" (0.482)
# and "most impressive thing he shipped?" (0.487) were wrongly rejected; at 0.45
# every on-topic question in the set clears it with margin. Small sample — re-run
# the eval after changing the knowledge base, and don't read 0.45 as precise.
#
# (Anchoring the query, "Omer Ahmed: <question>", was tried and not adopted: it
# lifted on-topic scores but lifted off-topic ones as much — "capital of France"
# went 0.45 -> 0.67 — so separation barely moved.)
MIN_SCORE = float(os.getenv("MIN_SCORE", "0.45"))

# REL_MARGIN then keeps only chunks close to the best one, which is what stops
# a strong match from dragging in weak neighbours. A fixed cutoff can't do this:
# 0.62 is filler under a 0.75 top hit but the only answer under a 0.56 one.
REL_MARGIN = float(os.getenv("REL_MARGIN", "0.12"))

# ── DeepSeek ──────────────────────────────────────────────────────────────
# OpenAI-compatible API, so the standard `openai` package is pointed at it with
# a different base_url — same arrangement as knowladge-feed/chatbot.
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip() or None
DEEPSEEK_BASE_URL = "https://api.deepseek.com"

# `deepseek-flash` is the current documented name. knowladge-feed still uses
# `deepseek-chat`, which DeepSeek's API reports as served by deepseek-flash
# (checked 2026-10-15) but no longer documents or lists in /models — a legacy
# alias that can be withdrawn without notice, so don't copy it forward.
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")

# Answers here are deliberately short — a few sentences on a portfolio page.
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "800"))

# Thinking is OFF by default, and that is a measured decision, not a style one.
# deepseek-flash reasons by default, and the reasoning tokens count against
# max_tokens: with max_tokens=60 the thinking run returned an EMPTY answer
# (finish_reason=length, 329 chars of reasoning, 0 of content), where the
# non-thinking run finished in 42 tokens. At max_tokens=800 the same question
# took 1.8s / 116 tokens with thinking vs 1.1s / 52 without. Grounded Q&A over
# a few retrieved paragraphs gains nothing from reasoning, so it is switched off
# with extra_body={"thinking": {"type": "disabled"}}. (`deepseek-chat` got this
# for free because it was the non-thinking alias.)
THINKING = os.getenv("DEEPSEEK_THINKING", "false").lower() == "true"

# Lower than the API default so answers stick to the retrieved notes rather than
# improvising around them. Tune by feel: this is not a measured value.
TEMPERATURE = float(os.getenv("DEEPSEEK_TEMPERATURE", "0.3"))

# USD per million tokens, used for the terminal's cost meter. These are the
# deepseek-flash PEAK-hours, cache-MISS rates from DeepSeek's pricing page
# (checked 2026-10-15 via a summarised fetch, so verify before relying on them):
# the highest of the published rates, so the meter errs high rather than low.
# DeepSeek bills off-peak at half; cache hits are far cheaper still.
PRICE_IN_PER_M = float(os.getenv("DEEPSEEK_PRICE_IN_PER_M", "0.30"))
PRICE_OUT_PER_M = float(os.getenv("DEEPSEEK_PRICE_OUT_PER_M", "1.20"))

# ── Serving ───────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "https://omertwelve.github.io,http://localhost:4321,http://127.0.0.1:4321",
    ).split(",")
    if o.strip()
]

# Caps on untrusted input. A public endpoint that forwards arbitrary-length
# text to a paid API is a way to lose money.
MAX_QUESTION_CHARS = int(os.getenv("MAX_QUESTION_CHARS", "500"))
MAX_HISTORY_TURNS = int(os.getenv("MAX_HISTORY_TURNS", "6"))

# ── Rate limiting (see ratelimit.py) ──────────────────────────────────────
# Per client: stops one visitor hammering the endpoint or running up a bill.
RATE_PER_MINUTE = int(os.getenv("RATE_PER_MINUTE", "6"))
RATE_PER_DAY = int(os.getenv("RATE_PER_DAY", "60"))

# Global: a ceiling on what EVERYONE can spend per day. This is the limit that
# still holds when the per-client ones are dodged by many addresses. Every
# accepted request can cost a model call, so this is, in effect, your maximum
# daily spend divided by the cost of one answer — read the real per-answer
# figure off the usage meter in the terminal and set it accordingly.
GLOBAL_PER_DAY = int(os.getenv("GLOBAL_PER_DAY", "400"))

# Which request header carries the real client address. EMPTY BY DEFAULT, which
# means "ignore all forwarding headers and use the socket peer" — a header is
# attacker-controlled unless a proxy you run overwrites it, and trusting one by
# default lets a script rotate a fake value to get a fresh quota per request.
#
# Set it ONLY when the backend is reachable exclusively through a proxy that
# sets that header itself, e.g. CLIENT_IP_HEADER=cf-connecting-ip behind a
# Cloudflare tunnel. If the port is also reachable directly, the header is
# attacker-controlled again and this setting makes things worse, not better.
#
# Behind a proxy with this left empty, every visitor shares the proxy's address
# and therefore one bucket. That fails closed (annoying, not costly), and
# main.py logs a warning when it sees it.
CLIENT_IP_HEADER = os.getenv("CLIENT_IP_HEADER", "").strip().lower()
