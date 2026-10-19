"""Check retrieval against a fixed question set, and show where MIN_SCORE falls.

    python rag/eval_retrieval.py

Run it after changing the knowledge base or the embedding model. It reports,
for the floor currently in backend/config.py:

  * which on-topic questions would be wrongly REJECTED (nothing clears the floor)
  * which off-topic questions would be ACCEPTED (they reach the model)

and prints the score ranges, so you can see how much the two classes overlap.
With bge-small they overlap, which is why the floor is set by the cost of each
kind of error rather than by finding a gap — see the comment above MIN_SCORE.

This is a small hand-written set, not a benchmark: add the questions real
visitors actually ask before trusting the numbers.
"""

from __future__ import annotations

import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import config  # noqa: E402
from retriever import Retriever  # noqa: E402

# Should retrieve something. Deliberately mixes phrasings with and without the
# name "Omer": pronoun-only questions ("he", "his") score noticeably lower.
ON_TOPIC = [
    "What was the most impressive thing he shipped?",
    "What's his proudest accomplishment?",
    "What's his best project?",
    "Where did he study?",
    "Does he know Docker?",
    "Can I hire him?",
    "How do I reach him?",
    "What did he do at his internship?",
    "Why Random Forest instead of a CNN?",
    "Has he led a team?",
    "What hardware does NeuroSense use?",
    "Tell me about his experience",
    "What languages does he speak?",
    "How accurate is his model?",
    "Is he good with databases?",
    "What's his background?",
    "What did Omer build at Alemdar Teknik?",
    "What is Omer's biggest achievement?",
]

# Should NOT be answered from the notes. Some will still reach the model — that
# is the accepted trade, and the model declines them.
OFF_TOPIC = [
    "What is the capital of France?",
    "Write me a poem about cats",
    "How do I bake sourdough bread?",
    "Who won the 2022 World Cup?",
    "What's the weather like today?",
    "Explain how quantum computing works",
    "What is the best pizza topping?",
    "How do I fix a flat bicycle tyre?",
]


def main() -> int:
    r = Retriever()

    def best(q: str) -> float:
        return float((r.matrix @ r.embed_query(q)).max())

    on = [(q, best(q)) for q in ON_TOPIC]
    off = [(q, best(q)) for q in OFF_TOPIC]
    floor = config.MIN_SCORE

    on_scores = [s for _, s in on]
    off_scores = [s for _, s in off]
    print(f"MIN_SCORE = {floor}   ({len(r.chunks)} chunks)\n")
    print(f"on-topic   best-score range {min(on_scores):.3f} - {max(on_scores):.3f}  "
          f"(median {statistics.median(on_scores):.3f})")
    print(f"off-topic  best-score range {min(off_scores):.3f} - {max(off_scores):.3f}  "
          f"(median {statistics.median(off_scores):.3f})")
    overlap = min(on_scores) < max(off_scores)
    print(f"classes {'OVERLAP' if overlap else 'are separable'} "
          f"(gap {min(on_scores) - max(off_scores):+.3f})\n")

    rejected = [(q, s) for q, s in on if s < floor]
    accepted = [(q, s) for q, s in off if s >= floor]

    print(f"false rejections (on-topic blocked): {len(rejected)}/{len(on)}   <- the expensive error")
    for q, s in rejected:
        print(f"   {s:.3f}  {q}")
    print(f"false acceptances (off-topic reach the model): {len(accepted)}/{len(off)}   <- cheap")
    for q, s in accepted:
        print(f"   {s:.3f}  {q}")

    thinnest = min(s for _, s in on) - floor
    print(f"\nweakest on-topic question clears the floor by {thinnest:+.3f}")

    # Non-zero exit if a real question would be rejected, so this can gate CI.
    return 1 if rejected else 0


if __name__ == "__main__":
    raise SystemExit(main())
