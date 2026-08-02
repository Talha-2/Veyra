import anyio
from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from .. import richtext
from ..db import Document, Folder, get_session, new_id, now
from ..rag import ingest, pipeline, store

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

ALLOWED_EXT = {".txt", ".md", ".pdf", ".docx", ".doc"}
MAX_UPLOAD = 25 * 1024 * 1024


# ── request models ───────────────────────────────────────────────────────

class CreateDocRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    content: str | None = None       # markdown/plain (agent, legacy)
    content_html: str | None = None  # rich editor HTML
    source_type: str = "created"
    folder_id: str | None = None


class FolderRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_id: str | None = None


class FolderPatch(BaseModel):
    name: str | None = None
    parent_id: str | None = None
    move_to_root: bool = False  # explicit, since parent_id=None is ambiguous with "unchanged"


class MoveRequest(BaseModel):
    folder_id: str | None = None


class BulkRequest(BaseModel):
    doc_ids: list[str] = []
    folder_ids: list[str] = []
    target_folder_id: str | None = None


class ScrapeRequest(BaseModel):
    url: str = Field(min_length=1)
    folder_id: str | None = None


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int | None = Field(default=None, ge=1, le=25)
    doc_ids: list[str] | None = None


# ── serializers ──────────────────────────────────────────────────────────

def _doc_out(doc: Document, include_content: bool = False) -> dict:
    out = {
        "id": doc.id,
        "name": doc.name,
        "source_type": doc.source_type,
        "mime": doc.mime,
        "size_bytes": doc.size_bytes,
        "n_chunks": doc.n_chunks,
        "status": doc.status,
        "error": doc.error,
        "folder_id": doc.folder_id,
        "created_at": doc.created_at.isoformat(),
        "updated_at": doc.updated_at.isoformat(),
    }
    if include_content:
        out["content"] = doc.content
        out["content_rich"] = richtext.ensure_rich(doc.content, doc.content_rich or "")
    return out


def _folder_out(session: Session, folder: Folder) -> dict:
    n_folders = len(session.exec(select(Folder).where(Folder.parent_id == folder.id)).all())
    n_files = len(session.exec(select(Document).where(Document.folder_id == folder.id)).all())
    return {
        "id": folder.id,
        "name": folder.name,
        "parent_id": folder.parent_id,
        "n_folders": n_folders,
        "n_files": n_files,
        "created_at": folder.created_at.isoformat(),
        "updated_at": folder.updated_at.isoformat(),
    }


def _breadcrumb(session: Session, folder_id: str | None) -> list[dict]:
    trail: list[dict] = []
    seen: set[str] = set()
    cur = folder_id
    while cur and cur not in seen:
        seen.add(cur)
        f = session.get(Folder, cur)
        if f is None:
            break
        trail.append({"id": f.id, "name": f.name})
        cur = f.parent_id
    trail.reverse()
    return trail


def _descendant_folder_ids(session: Session, folder_id: str) -> list[str]:
    """folder_id plus every folder nested beneath it (BFS)."""
    out = [folder_id]
    frontier = [folder_id]
    while frontier:
        children = session.exec(
            select(Folder).where(Folder.parent_id.in_(frontier))  # type: ignore[attr-defined]
        ).all()
        frontier = [c.id for c in children]
        out.extend(frontier)
    return out


def _apply_content(req: CreateDocRequest) -> tuple[str, str]:
    """Return (markdown_for_rag, html_for_editor). Editor HTML wins; markdown
    is derived from it so retrieval always chunks clean, heading-aware text."""
    if req.content_html is not None:
        md = richtext.html_to_markdown(req.content_html)
        return md, req.content_html
    if req.content is not None:
        return req.content, ""  # rich derived lazily on read
    raise HTTPException(422, "Provide either 'content' or 'content_html'")


# ── browse (the folder view) ─────────────────────────────────────────────

@router.get("/browse")
def browse(folder_id: str | None = None, session: Session = Depends(get_session)):
    if folder_id is not None and session.get(Folder, folder_id) is None:
        raise HTTPException(404, "Folder not found")
    folders = session.exec(
        select(Folder).where(Folder.parent_id == folder_id).order_by(Folder.name)
    ).all()
    files = session.exec(
        select(Document).where(Document.folder_id == folder_id).order_by(Document.created_at.desc())
    ).all()
    return {
        "folder_id": folder_id,
        "breadcrumb": _breadcrumb(session, folder_id),
        "folders": [_folder_out(session, f) for f in folders],
        "files": [_doc_out(d) for d in files],
    }


# ── folders ──────────────────────────────────────────────────────────────

@router.get("/folders")
def list_all_folders(session: Session = Depends(get_session)):
    """Flat list of every folder — used to build the 'Move to…' picker."""
    folders = session.exec(select(Folder).order_by(Folder.name)).all()
    return [
        {"id": f.id, "name": f.name, "parent_id": f.parent_id}
        for f in folders
    ]


@router.post("/folders")
def create_folder(req: FolderRequest, session: Session = Depends(get_session)):
    if req.parent_id and session.get(Folder, req.parent_id) is None:
        raise HTTPException(404, "Parent folder not found")
    folder = Folder(id=new_id("fld"), name=req.name.strip(), parent_id=req.parent_id)
    session.add(folder)
    session.commit()
    session.refresh(folder)
    return _folder_out(session, folder)


@router.put("/folders/{folder_id}")
def update_folder(folder_id: str, req: FolderPatch, session: Session = Depends(get_session)):
    folder = session.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(404, "Folder not found")
    if req.name is not None:
        folder.name = req.name.strip()
    if req.move_to_root:
        folder.parent_id = None
    elif req.parent_id is not None:
        if req.parent_id == folder_id:
            raise HTTPException(422, "A folder cannot be its own parent")
        if req.parent_id in _descendant_folder_ids(session, folder_id):
            raise HTTPException(422, "Cannot move a folder into one of its own subfolders")
        if session.get(Folder, req.parent_id) is None:
            raise HTTPException(404, "Target folder not found")
        folder.parent_id = req.parent_id
    folder.updated_at = now()
    session.add(folder)
    session.commit()
    return _folder_out(session, folder)


@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: str, session: Session = Depends(get_session)):
    if session.get(Folder, folder_id) is None:
        raise HTTPException(404, "Folder not found")
    ids = _descendant_folder_ids(session, folder_id)
    docs = session.exec(
        select(Document).where(Document.folder_id.in_(ids))  # type: ignore[attr-defined]
    ).all()
    for doc in docs:
        store.delete_document(doc.id)
        session.delete(doc)
    for fid in session.exec(select(Folder).where(Folder.id.in_(ids))).all():  # type: ignore[attr-defined]
        session.delete(fid)
    session.commit()
    return {"ok": True, "deleted_folders": len(ids), "deleted_files": len(docs)}


# ── bulk + maintenance ───────────────────────────────────────────────────

@router.post("/bulk/delete")
def bulk_delete(req: BulkRequest, session: Session = Depends(get_session)):
    n_docs = n_folders = 0
    for doc_id in req.doc_ids:
        doc = session.get(Document, doc_id)
        if doc:
            store.delete_document(doc.id)
            session.delete(doc)
            n_docs += 1
    for fid in req.folder_ids:
        if session.get(Folder, fid) is None:
            continue
        ids = _descendant_folder_ids(session, fid)
        for doc in session.exec(select(Document).where(Document.folder_id.in_(ids))).all():  # type: ignore[attr-defined]
            store.delete_document(doc.id)
            session.delete(doc)
            n_docs += 1
        for f in session.exec(select(Folder).where(Folder.id.in_(ids))).all():  # type: ignore[attr-defined]
            session.delete(f)
            n_folders += 1
    session.commit()
    return {"ok": True, "deleted_files": n_docs, "deleted_folders": n_folders}


@router.post("/bulk/move")
def bulk_move(req: BulkRequest, session: Session = Depends(get_session)):
    target = req.target_folder_id
    if target is not None and session.get(Folder, target) is None:
        raise HTTPException(404, "Target folder not found")
    for doc_id in req.doc_ids:
        doc = session.get(Document, doc_id)
        if doc:
            doc.folder_id = target
            session.add(doc)
    for fid in req.folder_ids:
        folder = session.get(Folder, fid)
        if folder is None:
            continue
        if target is not None and (target == fid or target in _descendant_folder_ids(session, fid)):
            raise HTTPException(422, f"Cannot move folder '{folder.name}' into itself")
        folder.parent_id = target
        session.add(folder)
    session.commit()
    return {"ok": True}


@router.post("/reindex")
def reindex_all(background: BackgroundTasks, session: Session = Depends(get_session)):
    docs = session.exec(select(Document)).all()
    for doc in docs:
        doc.status = "processing"
        session.add(doc)
    session.commit()
    for doc in docs:
        background.add_task(pipeline.ingest_document, doc.id)
    return {"ok": True, "queued": len(docs)}


# ── documents: list / create / upload / scrape ───────────────────────────

@router.get("")
def list_documents(session: Session = Depends(get_session)):
    docs = session.exec(select(Document).order_by(Document.created_at.desc())).all()
    return [_doc_out(d) for d in docs]


@router.post("/upload")
async def upload_document(
    file: UploadFile,
    background: BackgroundTasks,
    folder_id: str | None = Form(default=None),
    session: Session = Depends(get_session),
):
    name = file.filename or "untitled"
    ext = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""
    if ext not in ALLOWED_EXT:
        raise HTTPException(415, f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_EXT)}")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "File exceeds 25 MB limit")
    try:
        text = ingest.extract_text(name, data, file.content_type)
    except Exception as exc:
        raise HTTPException(422, f"Could not parse file: {exc}") from exc
    if not text.strip():
        raise HTTPException(422, "No extractable text found in file")

    doc = Document(
        id=new_id("doc"),
        name=name,
        source_type="upload",
        mime=file.content_type or "application/octet-stream",
        size_bytes=len(data),
        content=text,
        folder_id=folder_id,
    )
    session.add(doc)
    session.commit()
    background.add_task(pipeline.ingest_document, doc.id)
    return _doc_out(doc)


@router.post("/scrape")
async def scrape_website(req: ScrapeRequest, background: BackgroundTasks, session: Session = Depends(get_session)):
    try:
        title, markdown = await anyio.to_thread.run_sync(richtext.scrape_url, req.url)
    except Exception as exc:
        raise HTTPException(422, f"Could not scrape URL: {exc}") from exc
    doc = Document(
        id=new_id("doc"),
        name=title[:200],
        source_type="scrape",
        mime="text/markdown",
        size_bytes=len(markdown.encode()),
        content=markdown,
        folder_id=req.folder_id,
    )
    session.add(doc)
    session.commit()
    background.add_task(pipeline.ingest_document, doc.id)
    return _doc_out(doc)


@router.post("")
async def create_document(
    req: CreateDocRequest,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
):
    content, content_rich = _apply_content(req)
    if not content.strip():
        raise HTTPException(422, "Document content is empty")
    doc = Document(
        id=new_id("doc"),
        name=req.name,
        source_type=req.source_type,
        mime="text/markdown",
        size_bytes=len(content.encode()),
        content=content,
        content_rich=content_rich,
        folder_id=req.folder_id,
    )
    session.add(doc)
    session.commit()
    background.add_task(pipeline.ingest_document, doc.id)
    return _doc_out(doc)


# ── documents: single-item (must stay AFTER literal routes above) ────────

@router.get("/{doc_id}")
def get_document(doc_id: str, session: Session = Depends(get_session)):
    doc = session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    return _doc_out(doc, include_content=True)


@router.get("/{doc_id}/chunks")
def get_chunks(doc_id: str, session: Session = Depends(get_session)):
    if session.get(Document, doc_id) is None:
        raise HTTPException(404, "Document not found")
    return store.chunks_for_doc(doc_id)


@router.put("/{doc_id}")
async def update_document(
    doc_id: str,
    req: CreateDocRequest,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
):
    doc = session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    content, content_rich = _apply_content(req)
    if not content.strip():
        raise HTTPException(422, "Document content is empty")
    doc.name = req.name
    doc.content = content
    doc.content_rich = content_rich
    doc.size_bytes = len(content.encode())
    doc.status = "processing"
    doc.updated_at = now()
    session.add(doc)
    session.commit()
    background.add_task(pipeline.ingest_document, doc.id)
    return _doc_out(doc, include_content=True)


@router.post("/{doc_id}/rename")
def rename_document(doc_id: str, req: FolderRequest, session: Session = Depends(get_session)):
    """Rename without re-indexing (content is unchanged)."""
    doc = session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    doc.name = req.name.strip()
    doc.updated_at = now()
    session.add(doc)
    session.commit()
    return _doc_out(doc)


@router.post("/{doc_id}/move")
def move_document(doc_id: str, req: MoveRequest, session: Session = Depends(get_session)):
    doc = session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    if req.folder_id is not None and session.get(Folder, req.folder_id) is None:
        raise HTTPException(404, "Target folder not found")
    doc.folder_id = req.folder_id
    doc.updated_at = now()
    session.add(doc)
    session.commit()
    return _doc_out(doc)


@router.delete("/{doc_id}")
def delete_document(doc_id: str, session: Session = Depends(get_session)):
    doc = session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    store.delete_document(doc_id)
    session.delete(doc)
    session.commit()
    return {"ok": True}


@router.post("/search")
async def search(req: SearchRequest):
    results = await pipeline.search(req.query, req.top_k, req.doc_ids)
    return {"query": req.query, "results": results}
