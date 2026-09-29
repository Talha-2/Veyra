---
title: Knowledge
description: Give the agent documents to search, check what it would find, and understand how it answers from them.
---

**Studio → Knowledge** holds what the agent can look up during a conversation: prices, policies, service areas, opening hours. The agent searches it when a customer asks something specific, and it only states facts it actually finds. Use Knowledge for anything longer than a sentence or two. Short facts the agent must always know belong in the [business profile](/docs/studio/identity#business-profile) or in [Memory](/docs/studio/memory).

## Add knowledge

Press **Add** at the top of the page. It adds to the folder you are in.

### Write a document

1. Choose **Add → Write a document**.
2. Enter a **Title**, for example "Service area and call-out fees".
3. Write the **Content** in plain text or Markdown, up to 500,000 characters.
4. Press **Create**. The document is searchable at once.

Write it the way you would explain it to a new hire, with one topic per paragraph. Paragraphs are what the agent retrieves.

### Upload files

Choose **Add → Upload files**, or drop files anywhere on the page. You can upload up to 20 files at a time, 20 MB each, in these formats: TXT, MD, CSV, HTML, PDF and DOCX.

Text, Markdown, CSV and HTML files are searchable as soon as they upload. HTML tags are removed first.

> [!SOON]
> Reading text out of PDF and Word (DOCX) files is coming soon. Today these files upload and show as **Processing**, but the agent cannot search them. To use their content now, copy the text into **Write a document**.

### Import a web page

1. Choose **Add → Import a web page**.
2. Paste the page's **URL** and press **Import**.

Veyra fetches the page once, removes navigation, headers and footers, and indexes the text. The page title becomes the document name. Only that one page is imported: links are not followed, and later changes to the page are not picked up. To refresh it, import it again.

## Folders

Folders are for you. The agent searches every document, whatever folder it is in.

- **Add → New folder** creates a folder inside the one you are in.
- Use a folder's menu to **Rename** it or **Delete folder**. Deleting a folder does not delete its documents; they move up one level.
- To move documents, tick them and press **Move to…** in the bar that appears. The same bar has **Delete**.

## Document status

Each document shows a status:

| Status | Meaning |
| --- | --- |
| **Searchable · N chunks** | The agent can find it. |
| **Processing** | Uploaded, but the text is not available yet. |
| **Failed** | No text could be extracted. The agent cannot see it. |
| **Not searchable** | The agent cannot find it. Open it and re-index. |

The header counts documents that are searchable, processing and failed.

## Edit a document

Click a document to open it.

- Edit the title and the text, then press **Save and re-index**. The agent uses the new text from the next conversation.
- **What the agent retrieves** shows the saved chunks. Paragraphs are packed into chunks of about 1,200 characters and never split in the middle. The last paragraph of a full chunk is repeated at the start of the next one, so a fact near the boundary can be found from either side.
- **Details** shows the source, type, size, number of chunks and folder.
- **Re-index** rebuilds the chunks from the saved text. Saving already does this; use it after a failed or stale index.
- **Delete document** removes the document and its chunks. The agent stops finding it on the next call.

## Test retrieval

At the bottom of **Studio → Knowledge**, under **Test retrieval**, type what a customer might say and press **Search**. This runs the exact search the agent runs during a conversation, across every folder, and shows the passages it would read, best first, with the matching words highlighted.

If nothing matches, the page says **Nothing matched**. In a conversation the agent would say it does not know. If it should know, write it down in a document.

## How the agent searches

The search matches words, not meaning. It looks for the words in the customer's question in the text and titles of your documents. It also understands word forms (price, prices, pricing) and some everyday synonyms, for example:

- price, cost, fee, charge, rate, quote
- area, service, cover, county, zone, location
- book, schedule, appointment, slot, availability
- hours, open, closed
- cancel, refund, reschedule

Passages that cover more of the question rank higher. The agent reads the top five.

> [!TIP]
> Use the words your customers use. If callers say "call-out fee" and your document only says "dispatch charge", add both.

## Grounded answers

The agent is instructed to state a price, fee, service area, time, availability or policy only when it appears in the business profile, in memory, or in a search or tool result from the same conversation. If a first search finds nothing, it searches again with other words. If it still finds nothing, it tells the customer it will have the answer confirmed. It does not estimate, round, or quote a typical figure.

Both halves of the agent can search: the talker answers simple questions from knowledge itself, and the worker searches while it carries out a task. Automations can search too, if you allow it. See [Automations](/docs/studio/automations).

## Knowledge from other sources

The library also lists documents from other places, labelled by source:

- **Agent memory**: notes from [Memory](/docs/studio/memory).
- **Added by API**: documents created through the REST API. See the [Knowledge API reference](/docs/api-reference/knowledge).

A publishable API key can search your knowledge from a web page. See [API keys and webhooks](/docs/studio/developer).
