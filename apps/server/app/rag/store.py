"""Hybrid retrieval: LanceDB (dense vectors, local/embedded) + BM25 (lexical),
fused with Reciprocal Rank Fusion.

Why hybrid: voice queries arrive through STT, so proper nouns and SKUs get
mangled ("Zendesk" → "send desk"). Dense vectors absorb paraphrase; BM25
rescues exact-token matches when the embedding misses. RRF needs no score
calibration between the two, which keeps this robust as the corpus grows.
"""

from __future__ import annotations

import re
import threading
from functools import lru_cache

import lancedb
from rank_bm25 import BM25Okapi

from ..config import settings

_TABLE = "chunks"
_lock = threading.Lock()


@lru_cache(maxsize=1)
def _embedder():
    from fastembed import TextEmbedding

    return TextEmbedding(model_name=settings.embedding_model)


def embed(texts: list[str]) -> list[list[float]]:
    return [vec.tolist() for vec in _embedder().embed(texts)]


@lru_cache(maxsize=1)
def _db():
    return lancedb.connect(settings.lancedb_path)


def _table():
    db = _db()
    if _TABLE not in db.table_names():
        return None
    return db.open_table(_TABLE)


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


class _Bm25Index:
    """In-memory BM25 over all chunks; rebuilt on writes. Fine for KBs up to
    ~100k chunks — past that, move lexical search to tantivy/SQLite FTS5."""

    def __init__(self) -> None:
        self.rows: list[dict] = []
        self.bm25: BM25Okapi | None = None

    def rebuild(self) -> None:
        table = _table()
        if table is None:
            self.rows, self.bm25 = [], None
            return
        self.rows = table.search().limit(1_000_000).select(
            ["chunk_id", "doc_id", "doc_name", "heading", "text"]
        ).to_list()
        corpus = [_tokenize(r["text"]) for r in self.rows]
        self.bm25 = BM25Okapi(corpus) if corpus else None


_bm25 = _Bm25Index()
_bm25_ready = False


def _ensure_bm25() -> None:
    global _bm25_ready
    with _lock:
        if not _bm25_ready:
            _bm25.rebuild()
            _bm25_ready = True


def index_chunks(doc_id: str, doc_name: str, chunks: list) -> int:
    vectors = embed([c.text for c in chunks])
    rows = [
        {
            "chunk_id": f"{doc_id}:{c.index}",
            "doc_id": doc_id,
            "doc_name": doc_name,
            "heading": c.heading,
            "text": c.text,
            "vector": v,
        }
        for c, v in zip(chunks, vectors)
    ]
    with _lock:
        db = _db()
        if _TABLE in db.table_names():
            table = db.open_table(_TABLE)
            table.delete(f"doc_id = '{doc_id}'")
            if rows:
                table.add(rows)
        elif rows:
            db.create_table(_TABLE, data=rows)
        _bm25.rebuild()
    return len(rows)


def delete_document(doc_id: str) -> None:
    with _lock:
        table = _table()
        if table is not None:
            table.delete(f"doc_id = '{doc_id}'")
        _bm25.rebuild()


def search(query: str, top_k: int | None = None, doc_ids: list[str] | None = None) -> list[dict]:
    top_k = top_k or settings.retrieval_top_k
    table = _table()
    if table is None:
        return []
    _ensure_bm25()

    fetch = max(top_k * 4, 20)

    # dense
    qvec = embed([query])[0]
    vq = table.search(qvec).limit(fetch)
    if doc_ids:
        quoted = ",".join(f"'{d}'" for d in doc_ids)
        vq = vq.where(f"doc_id IN ({quoted})")
    dense = vq.select(["chunk_id", "doc_id", "doc_name", "heading", "text"]).to_list()

    # lexical
    lexical: list[dict] = []
    if _bm25.bm25 is not None:
        scores = _bm25.bm25.get_scores(_tokenize(query))
        ranked = sorted(zip(_bm25.rows, scores), key=lambda x: x[1], reverse=True)
        for row, score in ranked[:fetch]:
            if score <= 0:
                break
            if doc_ids and row["doc_id"] not in doc_ids:
                continue
            lexical.append(row)

    # RRF fusion (k=60 is the standard constant)
    K = 60
    fused: dict[str, dict] = {}
    for rank, row in enumerate(dense):
        entry = fused.setdefault(row["chunk_id"], {"row": row, "score": 0.0})
        entry["score"] += 1.0 / (K + rank + 1)
    for rank, row in enumerate(lexical):
        entry = fused.setdefault(row["chunk_id"], {"row": row, "score": 0.0})
        entry["score"] += 1.0 / (K + rank + 1)

    ranked = sorted(fused.values(), key=lambda e: e["score"], reverse=True)[:top_k]
    return [
        {
            "chunk_id": e["row"]["chunk_id"],
            "doc_id": e["row"]["doc_id"],
            "doc_name": e["row"]["doc_name"],
            "heading": e["row"].get("heading", ""),
            "text": e["row"]["text"],
            "score": round(e["score"], 5),
        }
        for e in ranked
    ]


def chunks_for_doc(doc_id: str) -> list[dict]:
    table = _table()
    if table is None:
        return []
    rows = table.search().where(f"doc_id = '{doc_id}'").limit(10_000).select(
        ["chunk_id", "heading", "text"]
    ).to_list()
    rows.sort(key=lambda r: int(r["chunk_id"].rsplit(":", 1)[1]))
    return rows
