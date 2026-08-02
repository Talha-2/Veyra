"""Bridge between the rich editor (HTML) and the RAG pipeline (markdown).

The editor round-trips HTML, but retrieval wants clean, heading-aware markdown
(ingest.chunk_text splits on `#` headings). So we store both: `content` is the
markdown that gets chunked/embedded, `content_rich` is the HTML the editor
reloads. Conversions live here so the routers stay thin.
"""

from __future__ import annotations

import re

from markdownify import markdownify as _md
from markdown import markdown as _html


def html_to_markdown(html: str) -> str:
    """Editor HTML → markdown for RAG. Headings become #, tables become pipe
    tables, lists stay lists — exactly what heading-aware chunking wants."""
    if not html or not html.strip():
        return ""
    md = _md(html, heading_style="ATX", bullets="-", strip=["script", "style"])
    # collapse the excess blank lines markdownify tends to emit
    return re.sub(r"\n{3,}", "\n\n", md).strip()


def markdown_to_html(md: str) -> str:
    """Markdown → HTML so the editor can open documents that only have the
    markdown side (uploads, scrapes, agent- and legacy-created docs)."""
    if not md or not md.strip():
        return "<p></p>"
    return _html(md, extensions=["tables", "fenced_code", "sane_lists"])


def _plain_to_html(text: str) -> str:
    """Fallback for extracted plain text with no markdown structure: keep
    paragraph breaks so the editor doesn't show one giant blob."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    return "".join(f"<p>{_escape(p)}</p>" for p in paras) or "<p></p>"


def _escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def ensure_rich(content: str, content_rich: str) -> str:
    """Return HTML for the editor: prefer stored rich HTML, else derive it from
    the markdown/plain content so every document opens with structure."""
    if content_rich and content_rich.strip():
        return content_rich
    if not content:
        return "<p></p>"
    # markdown headings/tables present → convert; otherwise treat as plain text
    if re.search(r"(?m)^#{1,6}\s|\n[-*]\s|\|.*\|", content):
        return markdown_to_html(content)
    return _plain_to_html(content)


def scrape_url(url: str, timeout: float = 15.0) -> tuple[str, str]:
    """Fetch a web page and return (title, markdown). Strips chrome (nav, script,
    footer, aside) and converts the main body to markdown for the KB."""
    import httpx
    from bs4 import BeautifulSoup

    if not re.match(r"^https?://", url):
        url = "https://" + url
    headers = {"User-Agent": "Mozilla/5.0 (compatible; RelayVoiceKB/1.0)"}
    with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as client:
        resp = client.get(url)
        resp.raise_for_status()
        html = resp.text

    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.string.strip() if soup.title and soup.title.string else url)
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript", "form", "svg"]):
        tag.decompose()
    body = soup.find("main") or soup.find("article") or soup.body or soup
    markdown = html_to_markdown(str(body))
    if not markdown.strip():
        raise ValueError("No readable text found at that URL")
    return title, markdown
