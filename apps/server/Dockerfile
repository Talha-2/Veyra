FROM python:3.12-slim

WORKDIR /app
# generous pip timeout/retries + a BuildKit cache mount: big wheels
# (onnxruntime, pyarrow) on flaky networks are the #1 cause of broken first
# builds, and the cache mount lets a retried build reuse finished downloads
ENV PYTHONUNBUFFERED=1 PIP_DEFAULT_TIMEOUT=180 PIP_RETRIES=10

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

# Pre-bake the embedding model (~100 MB) so the first KB ingest doesn't
# stall for a download at runtime.
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"

COPY app ./app

ENV DATA_DIR=/data
VOLUME /data
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"

# single worker on purpose: the BM25 index is in-process; scale by adding
# replicas behind a shared store (see rag/store.py) rather than --workers N
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
