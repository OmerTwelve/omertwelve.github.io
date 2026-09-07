"""Build the RAG knowledge base.

    rag/knowledge/*.md  ->  chunk on "## " headings  ->  embed  ->  backend/kb.json

The embedding model here MUST match the one the backend uses at query time
(see backend/config.py). A query embedded by a different model than the
documents lands in a different vector space, and retrieval then returns
plausible-looking nonsense with no error anywhere — so both sides read the
model name from the same constant.

Usage:
    python rag/build_kb.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
KNOWLEDGE_DIR = HERE / "knowledge"
OUT_FILE = ROOT / "backend" / "kb.json"

sys.path.insert(0, str(ROOT / "backend"))
from config import EMBED_MODEL  # noqa: E402  (needs the path insert above)


def chunk_markdown(text: str, source: str) -> list[dict]:
    """Split a markdown file into one chunk per '## ' section.

    The knowledge files are written so that each '## ' section is a single
    self-contained answer to a plausible question — that is the unit worth
    retrieving. Splitting on a fixed token count instead would cut sentences
    in half and strand facts from the heading that gives them meaning.
    """
    doc_title = ""
    heading: str | None = None
    body: list[str] = []
    chunks: list[dict] = []

    def flush() -> None:
        nonlocal body
        if heading is None:
            return
        content = "\n".join(body).strip()
        if content:
            chunks.append(
                {
                    "id": f"{source}#{len(chunks)}",
                    "source": source,
                    "title": heading,
                    # The heading is prepended to the embedded text so the
                    # vector carries the topic, not just the prose beneath it.
                    "text": f"{heading}\n\n{content}",
                }
            )
        body = []

    for line in text.splitlines():
        if line.startswith("## "):
            flush()
            heading = line[3:].strip()
        elif line.startswith("# "):
            doc_title = line[2:].strip()
        else:
            body.append(line)
    flush()

    for c in chunks:
        c["doc"] = doc_title
    return chunks


def main() -> int:
    files = sorted(KNOWLEDGE_DIR.glob("*.md"))
    if not files:
        print(f"No .md files found in {KNOWLEDGE_DIR}", file=sys.stderr)
        return 1

    chunks: list[dict] = []
    for path in files:
        found = chunk_markdown(path.read_text(encoding="utf-8"), path.name)
        chunks.extend(found)
        print(f"  {path.name:<28} {len(found):>3} chunks")

    print(f"\nEmbedding {len(chunks)} chunks with {EMBED_MODEL} ...")
    from fastembed import TextEmbedding

    model = TextEmbedding(EMBED_MODEL)
    vectors = list(model.embed([c["text"] for c in chunks]))

    if len(vectors) != len(chunks):
        raise RuntimeError(
            f"Embedding count mismatch: {len(vectors)} vectors for {len(chunks)} chunks"
        )

    kb = {
        "model": EMBED_MODEL,
        "dims": int(vectors[0].shape[0]),
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "chunks": [
            {
                "id": c["id"],
                "doc": c["doc"],
                "title": c["title"],
                "text": c["text"],
                # Rounded to 6 decimals: the precision loss is far below what
                # cosine ranking can distinguish, and it roughly halves the file.
                "vec": [round(float(v), 6) for v in vec],
            }
            for c, vec in zip(chunks, vectors)
        ],
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(kb), encoding="utf-8")

    size_kb = OUT_FILE.stat().st_size / 1024
    print(
        f"\nWrote {OUT_FILE}\n"
        f"  {len(kb['chunks'])} chunks, {kb['dims']} dims, {size_kb:.0f} KB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
