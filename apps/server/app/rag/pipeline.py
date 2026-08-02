"""Ingestion orchestration: extract → chunk → embed → index, updating the
Document row as it goes. Runs in a thread offloaded from the event loop
(fastembed + pypdf are CPU-bound)."""

from __future__ import annotations

import anyio
from sqlmodel import Session

from ..db import Document, engine, now
from . import ingest, store


def _ingest_sync(doc_id: str) -> None:
    with Session(engine) as session:
        doc = session.get(Document, doc_id)
        if doc is None:
            return
        try:
            chunks = ingest.chunk_text(doc.content)
            n = store.index_chunks(doc.id, doc.name, chunks)
            doc.n_chunks = n
            doc.status = "ready"
            doc.error = None
        except Exception as exc:  # surface, don't swallow — status shows in UI
            doc.status = "error"
            doc.error = str(exc)[:2000]
        doc.updated_at = now()
        session.add(doc)
        session.commit()


async def ingest_document(doc_id: str) -> None:
    await anyio.to_thread.run_sync(_ingest_sync, doc_id)


async def search(query: str, top_k: int | None = None, doc_ids: list[str] | None = None):
    return await anyio.to_thread.run_sync(lambda: store.search(query, top_k, doc_ids))
