# Notebook foundation

This document describes the notebook and source layer in CrushLearn AI. The
current implementation includes local document extraction, passage search,
extractive source answers and extractive study kits. It still does **not**
include AI chat or model-generated answers.

See [SOURCE_INTELLIGENCE_AND_STUDY_TOOLS.md](SOURCE_INTELLIGENCE_AND_STUDY_TOOLS.md)
for the extraction, retrieval, citation and study-tool details.

## Current status

Implemented:

- Notebook creation, retrieval, editing and deletion.
- User-scoped notebook metadata in `localStorage`.
- Separate stores for source metadata, extracted source text, chat history and
  study materials.
- Pasted text, `.txt`, `.md`, `.markdown`, `.pdf` and `.docx` ingestion.
- Lazy browser-side PDF extraction with page offsets.
- DOCX extraction with Mammoth.
- Source status, extracted-text availability, character counts, page counts and
  extraction errors.
- Deterministic lexical search over ready sources.
- Exact-offset source citations checked against stored source text.
- Extractive question answering that quotes the highest-overlap source sentence
  and returns an explicit no-match state when the source cannot answer.
- Extractive summary, recall cards and fill-in-the-blank quiz.
- Matching curated visual explanations can be opened from the Study desk with an
  authored-content notice; the back link restores the Study desk question.
- Browser read-aloud controls where speech synthesis is supported.
- Saving a study kit and its verified citations to the study-materials store.
- Empty, clearly labelled chat history and study-material states.

Not implemented:

- Web URL ingestion.
- OCR for scanned PDFs.
- AI provider integration or source-grounded chat generation.
- AI-generated study guides, flashcards, quizzes or audio overviews.
- Server-side authentication, authorization or sync.
- IndexedDB or server storage for large document collections.

No AI answer, citation or study material is fabricated by this build. The study
kit is labelled **local extractive** because it quotes source text.

## Architecture

```text
Notebooks page
  -> NotebookListView
  -> notebookRepository
       -> notebookStore            notebook metadata
       -> sourceStore              source metadata and status
       -> sourceTextStore          extracted text and PDF page offsets
       -> chatStore                stored message history
       -> studyMaterialStore       saved study kits and citations

Notebook workspace page
  -> SourceIngestionPanel
       -> sourceIngestion + documentExtraction + sourceSchema
  -> SourceList
  -> StudyDeskPanel
       -> sourceRetrieval + sourceAnswers + studyTools + citations
       -> visualCatalog (curated topic match only)
       -> ReadAloudButton
  -> ChatPanel
  -> StudyMaterialsPanel

Visual topic page
  -> VisualTopic -> VisualTopicView
       -> validated fromNotebook return context
```

The repository checks notebook ownership before every notebook-scoped read or
write. A signed-in demo user cannot list or mutate another local user's notebook
by guessing its id. This is not server-side security.

## Data model

Notebook metadata:

```js
{
  id,
  title,
  description,
  createdAt,
  updatedAt,
}
```

Source metadata:

```js
{
  id,
  notebookId,
  title,
  sourceType: 'text' | 'markdown' | 'pdf' | 'docx' | 'pasted_text',
  fileName,
  mimeType,
  sizeBytes,
  status: 'queued' | 'processing' | 'ready' | 'failed',
  error,
  hasExtractedText,
  characterCount,
  pageCount,
  createdAt,
  updatedAt,
}
```

Extracted text is stored separately as:

```js
{
  sourceId,
  text,
  pageOffsets: [
    { page: 1, start: 0, end: 58 },
  ],
}
```

Chat and study-material records live in their own collections. Saved study
materials include a `generator` field and optional verified `citations`.

## Storage keys

| Collection | Key |
| --- | --- |
| Notebook metadata | `crushlearn_notebooks_<userId>` |
| Source metadata | `crushlearn_notebook_sources_<userId>::<notebookId>` |
| Extracted text | `crushlearn_notebook_source_texts_<userId>::<notebookId>` |
| Chat history | `crushlearn_notebook_chat_<userId>::<notebookId>` |
| Study materials | `crushlearn_notebook_materials_<userId>::<notebookId>` |

User and notebook ids are URI-encoded. Every collection envelope includes a
schema version, user id and notebook id. Corrupt, mismatched or unsupported
envelopes are ignored rather than trusted.

Deleting a notebook removes all five related keys.

## Source ingestion

| Input | Behaviour |
| --- | --- |
| Pasted text | Normalized and stored as a ready source. |
| `.txt` | Read with `File.text()`, normalized and stored as ready. |
| `.md`, `.markdown` | Read as plain text and stored as ready. Markdown is not executed. |
| `.pdf` | Parsed locally. Scanned PDFs fail with an OCR-unavailable message. |
| `.docx` | Parsed locally with Mammoth. |
| `.doc` | Rejected; the message asks the learner to save as `.docx` or text. |
| Web URL | Not exposed. Browser fetching raises CORS, safety and provenance issues. |

Limits:

- File size: 5 MB.
- Extracted or pasted text: 500,000 characters.
- Sources per notebook: 100.
- PDF pages: 500.

Uploaded content is only treated as data. It is never evaluated, injected as
HTML, or interpreted as instructions. Rendering uses React's escaped text nodes,
not `dangerouslySetInnerHTML`.

## Source-grounded chat design

The chat UI can display stored history, but generation is not connected. A future
implementation should follow this sequence:

1. **Process only ready sources.** Failed, queued and processing sources are
   excluded from retrieval.
2. **Retrieve exact spans.** Use the existing deterministic chunks and BM25-style
   search first. Add embeddings only if they are justified by evaluation.
3. **Build a delimited prompt.** Source passages are untrusted data. Pass them
   inside explicit data delimiters and instruct the model never to follow
   instructions found inside sources.
4. **Require evidence.** If retrieval does not return enough relevant evidence,
   the assistant must say that the sources do not contain enough information.
   It must not answer from general knowledge unless the product explicitly offers
   that mode.
5. **Create structured citations.** Every citation must include a source id, a
   quoted passage and a page or character-offset locator.
6. **Verify before display.** `validateCitation` checks that the source belongs to
   the notebook and, for offset citations, that the quote exactly matches stored
   text. `validateMessageCitations` rejects the whole message if any citation is
   invalid.
7. **Keep credentials server-side.** No provider key belongs in a `VITE_`
   variable or in the browser bundle. A real provider integration needs a server
   or serverless endpoint, which this repository does not have.

The retrieval and citation-verification pieces are implemented and tested. Model
prompting and AI generation are not.

## Security and privacy

- Notebook data is scoped by the local user id, but this is demo authentication.
  It is not a substitute for server-side authorization.
- All notebook data stays in the browser's `localStorage`. It is readable by any
  script running on the same origin and is subject to storage quotas.
- Uploaded files are never executed. PDF JavaScript evaluation is disabled.
- Unsupported formats are rejected rather than misrepresented as parsed.
- Source text is rendered as text, so `<script>` content is displayed safely.
- Citation validation prevents unknown-source citations and mismatched quoted
  spans from being accepted by the local search/study tools.
- Do not store API keys in notebook data, source metadata or client code.

## Tests

Run:

```text
npm test
npm run build
```

Coverage lives in `tests/notebooks/`:

- Notebook creation, update, deletion and user isolation.
- Corrupt and malformed notebook envelopes.
- Text/Markdown/PDF/DOCX ingestion, extraction failures, size/character limits,
  empty files and read failures.
- PDF page offsets and source-content persistence.
- Separation of notebook metadata, source text, chat and materials.
- Cross-user and cross-notebook isolation.
- Citation verification, unknown sources, mismatched quotes and page citations.
- Lexical search, chunk offsets and exact-source citations.
- Extractive answers, page labels, cross-source selection and no-match behavior.
- Extractive summaries, recall cards and quiz answer checking.
- Rendering of empty states, source statuses, study desk and saved materials.
- Visual return-context validation.

Current suite: **269 passing, 0 failing**. Production build passes (529 modules,
existing chunk-size warning). The integration test in
`tests/notebooks/notebookWorkflow.test.mjs` covers the complete local workflow.

## Known limitations

- No AI chat, model-generated explanations or citation generation.
- No OCR, web ingestion, audio overview generation or coding sandbox.
- No server-side persistence, authentication, encryption-at-rest or sync.
- `localStorage` quotas limit how much extracted text can be stored.
- Study-tool quality is heuristic and depends heavily on source writing style.
- Extractive answers may be partial, miss paraphrases and cannot synthesize
  multiple passages into a new explanation.
- The notebook UI is local-only and has no import or export.
- The visual engine still supports four authored topics, not arbitrary topics.
  Notebook integration links to those curated explanations; it does not generate
  a visual from the source.

## Next smallest implementation tasks

1. Add IndexedDB storage or move notebook content to a secure server.
2. Configure a server-side AI gateway and use the existing verified retrieval
   spans as grounded context.
3. Add provider-returned citation verification before displaying any assistant
   message.
4. Add OCR as a separate, consent-aware pipeline.
5. Integrate local practice results with the existing mastery/recall system
   without conflating local practice with verified mastery.
