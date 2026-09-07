"""Configuration for the portfolio RAG assistant.

Everything tunable lives here. Secrets come from the environment and are never
committed — see .env.example.
"""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

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

# Retrieval uses two thresholds, because one global cutoff cannot do the job.
# bge-small has a compressed similarity range: measured on this corpus, real
# questions score 0.56-0.78 on their correct chunk while off-topic questions
# ("what is the capital of France?") still reach 0.45-0.46 on their best one.
#
# MIN_SCORE decides "do we know anything about this at all" — it sits in the
# gap between those two bands. Set it at 0.62 and "what did he do at his
# internship?" (0.56) retrieves nothing, which is a question worth answering.
MIN_SCORE = float(os.getenv("MIN_SCORE", "0.50"))

# REL_MARGIN then keeps only chunks close to the best one, which is what stops
# a strong match from dragging in weak neighbours. A fixed cutoff can't do this:
# 0.62 is filler under a 0.75 top hit but the only answer under a 0.56 one.
REL_MARGIN = float(os.getenv("REL_MARGIN", "0.12"))

# ── Claude ────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-5")

# Answers here are deliberately short — a few sentences on a portfolio page.
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "800"))

# "low" effort suits a chat/Q&A route: the work is grounded summarisation, not
# reasoning. Note we do NOT disable thinking on Opus 5 — lowering effort is the
# documented way to cut cost and latency without the failure modes that come
# with turning thinking off.
EFFORT = os.getenv("EFFORT", "low")

# On a policy decline the API retries the same request on this model inside the
# same call, so a visitor gets an answer instead of a dead stream.
USE_REFUSAL_FALLBACK = os.getenv("USE_REFUSAL_FALLBACK", "true").lower() == "true"
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "claude-opus-4-8")

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

# Per-IP rate limits.
RATE_PER_MINUTE = int(os.getenv("RATE_PER_MINUTE", "6"))
RATE_PER_DAY = int(os.getenv("RATE_PER_DAY", "60"))
