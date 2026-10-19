"""FastAPI backend for the portfolio RAG assistant.

    browser  --POST /api/ask-->  retrieve top-k chunks  -->  DeepSeek  --SSE-->  browser

The API key lives here and only here. The frontend is a static site on GitHub
Pages in a public repo, so anything shipped to the browser is public — this
service exists so the key isn't.
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

import config
import llm
from ratelimit import Decision, RateLimiter, resolve_client_ip
from retriever import Retriever

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("assistant")

NO_CONTEXT_REPLY = (
    "I don't have anything on that in my notes about Omer. I can cover his "
    "experience, his projects, his technical skills and how to reach him — or "
    "you can email him directly at amory30900@hotmail.com."
)


class AskRequest(BaseModel):
    question: str = Field(min_length=1)
    history: list[dict] = Field(default_factory=list)


limiter = RateLimiter(
    per_minute=config.RATE_PER_MINUTE,
    per_day=config.RATE_PER_DAY,
    global_per_day=config.GLOBAL_PER_DAY,
)
state: dict = {}
_warned: set[str] = set()

CONTACT = "amory30900@hotmail.com"


def limit_message(decision: Decision) -> str:
    """What the visitor reads when refused. Specific, and always a way forward."""
    if decision.scope == "minute":
        wait = decision.retry_after
        when = f"{wait} second{'s' if wait != 1 else ''}"
        return f"Too many questions in a short time. Try again in {when}."
    if decision.scope == "day":
        return f"Daily question limit reached. Email Omer directly at {CONTACT}."
    return f"The assistant has reached its daily limit. Email Omer directly at {CONTACT}."


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the model and KB once at startup, not per request — the first
    # embedding call otherwise pays a multi-second model load.
    state["retriever"] = Retriever()
    if not llm.enabled():
        log.warning("DEEPSEEK_API_KEY is not set — on-topic questions will return an error")
    yield


app = FastAPI(title="Omer Ahmed — portfolio assistant", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


PROXY_HEADERS = ("x-forwarded-for", "cf-connecting-ip", "x-real-ip")


def client_ip(request: Request) -> str:
    """The rate-limit key for this request. See ratelimit.resolve_client_ip."""
    peer = request.client.host if request.client else None

    # Loopback peer + proxy headers + no trusted header configured is the
    # signature of "running behind a tunnel but forgot CLIENT_IP_HEADER": every
    # visitor then shares one bucket. Say so once rather than let it look like
    # the limiter is randomly too strict.
    if (
        not config.CLIENT_IP_HEADER
        and peer in ("127.0.0.1", "::1")
        and any(h in request.headers for h in PROXY_HEADERS)
        and "proxy" not in _warned
    ):
        _warned.add("proxy")
        log.warning(
            "Requests arrive via a local proxy but CLIENT_IP_HEADER is unset, so "
            "all visitors share a single rate-limit bucket. Set it (e.g. "
            "cf-connecting-ip behind a Cloudflare tunnel) — but only if the "
            "backend is reachable solely through that proxy."
        )

    return resolve_client_ip(request.headers, peer, config.CLIENT_IP_HEADER)


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.get("/api/health")
async def health():
    r: Retriever = state["retriever"]
    return {
        "status": "ok",
        "chunks": len(r.chunks),
        "model": config.DEEPSEEK_MODEL,
        "thinking": config.THINKING,
        "key_configured": llm.enabled(),
    }


@app.post("/api/ask")
async def ask(req: AskRequest, request: Request):
    decision = limiter.check(client_ip(request))
    if not decision.allowed:
        log.info("rate limited (%s), retry in %ss", decision.scope, decision.retry_after)
        return JSONResponse(
            {"error": limit_message(decision)},
            status_code=429,
            headers={"Retry-After": str(decision.retry_after)},
        )

    question = req.question.strip()[: config.MAX_QUESTION_CHARS]
    if not question:
        return JSONResponse({"error": "Ask me something about Omer."}, status_code=400)

    retriever: Retriever = state["retriever"]
    hits = retriever.search(question)

    # Nothing cleared the relevance floor: answer from the fixed line rather
    # than sending the model an empty context and hoping it declines to invent.
    # Checked before the API key so off-topic questions still get a sane reply
    # if the key is missing or expired.
    if not hits:
        async def empty():
            yield sse({"delta": NO_CONTEXT_REPLY})
            yield sse({"done": True, "sources": []})

        return StreamingResponse(empty(), media_type="text/event-stream")

    if not llm.enabled():
        return JSONResponse(
            {"error": "The assistant is not configured on the server."},
            status_code=503,
        )

    # Only user/assistant text turns, most recent few, so a crafted history
    # can't inject other roles or unbounded content.
    history = [
        {"role": m["role"], "content": str(m.get("content", ""))[:2000]}
        for m in req.history
        if isinstance(m, dict) and m.get("role") in ("user", "assistant")
    ][-config.MAX_HISTORY_TURNS :]

    async def generate():
        async for ev in llm.chat_stream(question, hits, history):
            if ev["type"] == "delta":
                yield sse({"delta": ev["text"]})
            elif ev["type"] == "error":
                yield sse({"error": ev["text"]})
                return
            elif ev["type"] == "done":
                yield sse(
                    {
                        "done": True,
                        "sources": [{"title": h.title, "score": round(h.score, 3)} for h in hits],
                        "usage": ev["usage"],
                    }
                )

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
