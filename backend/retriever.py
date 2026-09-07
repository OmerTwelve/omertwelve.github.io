"""Vector retrieval over the pre-built knowledge base.

The corpus is small enough (tens of chunks) that an exact dot product against
every vector is microseconds — a vector database here would be infrastructure
without a payoff. The interface is the part that matters: swapping this for
FAISS or pgvector later means replacing search() and nothing else.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import numpy as np

from config import EMBED_MODEL, KB_PATH, MIN_SCORE, REL_MARGIN, TOP_K

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Hit:
    title: str
    text: str
    score: float
    source: str


class Retriever:
    def __init__(self) -> None:
        if not KB_PATH.exists():
            raise FileNotFoundError(
                f"{KB_PATH} not found. Build it first:  python rag/build_kb.py"
            )

        kb = json.loads(KB_PATH.read_text(encoding="utf-8"))

        # A KB built with a different model than the one we embed queries with
        # produces silent garbage, so refuse to start rather than serve it.
        if kb.get("model") != EMBED_MODEL:
            raise RuntimeError(
                f"kb.json was built with {kb.get('model')!r} but the app embeds "
                f"queries with {EMBED_MODEL!r}. Rebuild it: python rag/build_kb.py"
            )

        self.chunks = kb["chunks"]
        # One (n_chunks, dims) matrix so scoring is a single matvec.
        self.matrix = np.asarray([c["vec"] for c in self.chunks], dtype=np.float32)
        self._normalize_rows(self.matrix)

        from fastembed import TextEmbedding

        self.model = TextEmbedding(EMBED_MODEL)
        log.info(
            "Retriever ready: %d chunks, %d dims, built %s",
            len(self.chunks),
            self.matrix.shape[1],
            kb.get("built_at", "unknown"),
        )

    @staticmethod
    def _normalize_rows(m: np.ndarray) -> None:
        """In-place L2 normalization so cosine similarity is a plain dot product."""
        norms = np.linalg.norm(m, axis=1, keepdims=True)
        np.divide(m, np.where(norms == 0, 1.0, norms), out=m)

    def embed_query(self, question: str) -> np.ndarray:
        vec = np.asarray(next(iter(self.model.embed([question]))), dtype=np.float32)
        norm = float(np.linalg.norm(vec))
        return vec / norm if norm else vec

    def search(self, question: str, k: int = TOP_K) -> list[Hit]:
        """Return the chunks worth showing the model, best first.

        Two-stage filter — see config.MIN_SCORE for the measured reasoning:
        the absolute floor answers "is this question about Omer at all", and
        the relative margin answers "which of these are as good as the best".
        """
        scores = self.matrix @ self.embed_query(question)

        # argpartition finds the top k without sorting all n — irrelevant at
        # this size, but it keeps the shape right if the corpus grows.
        k = min(k, len(self.chunks))
        top = np.argpartition(-scores, k - 1)[:k]
        top = top[np.argsort(-scores[top])]

        best = float(scores[top[0]])
        if best < MIN_SCORE:
            return []  # off-topic: better to say so than to answer from filler

        cutoff = max(MIN_SCORE, best - REL_MARGIN)
        return [
            Hit(
                title=self.chunks[i]["title"],
                text=self.chunks[i]["text"],
                score=float(scores[i]),
                source=self.chunks[i].get("source", ""),
            )
            for i in top
            if scores[i] >= cutoff
        ]


def build_context(hits: list[Hit]) -> str:
    """Render hits as the context block the model sees."""
    return "\n\n".join(f"[{i}] {h.title}\n{h.text}" for i, h in enumerate(hits, 1))
