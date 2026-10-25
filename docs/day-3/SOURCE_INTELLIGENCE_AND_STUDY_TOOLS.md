# Source intelligence and local study tools

## Purpose

This layer makes notebook sources useful without pretending that an AI provider
exists. It adds real document extraction, exact-span retrieval and local
extractive study tools. The output is deliberately labelled **local extractive**
because it quotes existing text rather than generating new explanations.

## Implemented flow

1. A learner uploads `.txt`, `.md`, `.markdown`, `.pdf` or `.docx`.
2. Text formats are read with `File.text()`.
3. PDF bytes are loaded through a dynamically imported PDF.js build. PDF.js is
   configured with `isEvalSupported: false`, and its worker is loaded as an
   asset.
4. DOCX bytes are loaded through a dynamically imported Mammoth build.
5. Extracted text is normalized, bounded and stored as data.
6. PDF page offsets are stored next to the extracted text so a citation can be
   labelled with a page number.
7. Source metadata is stored separately from source text.
8. The Study desk builds a lexical index from ready sources.
9. Search results are returned only after the existing citation verifier checks
   the exact quote against the stored source text.
10. A question uses the same retrieval results to select the highest-overlap exact
    source sentence. It is labelled **extractive source answer** and is never
    described as AI-generated. If nothing matches, the app says so and does not
    answer from general knowledge.
11. A study kit is built from exact source sentences:
    - extractive summary
    - recall cards
    - fill-in-the-blank quiz
12. A study kit can be saved to the study-materials store with its verified
    citations.
13. The browser speech synthesis API can read an answer, result, summary or card
    answer aloud where the browser supports it.
14. If the question matches one of the four curated visual topics, the Study desk
    offers that visual. The visual page labels it as authored content that is not
    derived from the uploaded source, and the back link restores the notebook
    Study desk tab and question.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/notebooks/documentExtraction.mjs` | Lazy PDF/DOCX text extraction and page offset construction |
| `src/notebooks/sourceText.mjs` | Tokenization, sentence splitting, chunking, page lookup |
| `src/notebooks/sourceRetrieval.mjs` | BM25-style lexical search with verified offsets |
| `src/notebooks/sourceAnswers.mjs` | Extractive question answering from verified exact source sentences |
| `src/notebooks/studyTools.mjs` | Extractive summary, recall cards, cloze quiz, storage formatting |
| `src/notebooks/sourceSchema.mjs` | Source types, limits, page offset normalization |
| `src/notebooks/notebookDataStores.mjs` | Source, source-text, chat and material stores |
| `src/components/notebooks/StudyDeskPanel.jsx` | Question/search, study-kit and visual-link UI |
| `src/components/notebooks/ReadAloudButton.jsx` | Browser speech synthesis control |
| `src/components/notebooks/StudyMaterialsPanel.jsx` | Saved study kits and their citations |
| `src/pages/VisualTopic.jsx` | Curated visual page and validated notebook return context |

## Citation rules

- Citations use character offsets into the stored source text.
- A PDF page number is derived from stored page offsets; it is not an invented
  page reference.
- Every search result, extractive answer, summary sentence, card and quiz
  explanation is checked against the source text before display.
- An extractive answer is one exact source sentence with its own offset
  citation. It is not a paraphrase or a model completion.
- Study kits store a deduplicated set of verified citation records.
- Saving a material generates its record ID and timestamp in the repository if
  the UI does not supply them.

## Security and privacy boundaries

- Uploaded documents are parsed as data. Extracted text is never evaluated as
  HTML or script.
- PDF JavaScript evaluation is disabled in the parser.
- The UI renders all source text and generated material through React text nodes,
  not `dangerouslySetInnerHTML`.
- Notebook data remains in browser localStorage in this build.
- The app has no server, real authentication, encryption-at-rest or multi-user
  authorization. The demo user ID is not a security boundary.
- Browser storage quotas apply. PDF/DOCX extraction does not remove the 5 MB
  upload limit or the 500,000-character extracted-text limit.
- Scanned PDFs are rejected with an OCR-unavailable message. There is no OCR.
- The app is not safe to present as a protected multi-user document service.

## Honest limitations

- This is lexical retrieval, not semantic or AI retrieval.
- An extractive answer selects the sentence with the strongest exact-token
  overlap. It may be only a partial answer, may miss a paraphrase and cannot
  combine evidence into a new explanation.
- Summaries are extractive sentence selection. They cannot explain, synthesize or
  answer beyond the source wording.
- Cards and quiz questions are generated with deterministic patterns and may be
  uneven for unusual writing styles.
- Definition detection is heuristic.
- Fill-in-the-blank answers are checked as exact normalized terms, not by a
  language model.
- Read-aloud depends on browser voices; actual voice quality and availability are
  outside the app's control.
- No LLM, embeddings, vector store, OCR, web ingestion, audio overviews, coding
  sandbox or mastery integration was added.
- The four authored visual topics remain the only fully explained visual topics.

## Verification

- Unit tests cover:
  - real PDF text extraction and page offsets using a local two-page fixture
  - real DOCX extraction using a local Mammoth fixture
  - damaged-document error handling
  - sentence/chunk offset integrity
  - BM25 search and citation verification
  - extractive answers include exact offsets, page labels and an explicit
    no-match state
  - summary/card/quiz construction and answer checking
  - page label lookup
  - source-content persistence and page offsets
  - material citation persistence and generated record IDs
  - SSR rendering of the Study desk and honest empty states
  - visual return links reject invalid notebook ids
  - a complete notebook workflow: create, add two sources, extractive answer,
    citation revalidation, curated visual match, quiz, save and reload
- Full suite: **269 passing, 0 failing**.
- Production build: **529 modules transformed**, passing with the existing
  chunk-size warning.
- Manual browser verification:
  - uploaded a two-page PDF and saw `2 pages`, `ready`, and extracted text
  - uploaded a DOCX and saw `ready`
  - asked “What does chlorophyll absorb?” and got the exact sentence
    “Chlorophyll absorbs light in the visible spectrum.” with `page 2`
  - asked “What is the capital of France?” and got the explicit no-source-match
    message instead of an invented answer
  - built a study kit, revealed a card, checked a correct quiz answer and saved
    the kit
  - opened Study materials after reload and saw both saved citations re-verified
  - opened a matching curated electricity visual from the Study desk, saw the
    not-source-grounded notice, and returned to the restored Study desk question
  - read-aloud reported an active speech utterance and changed to “Stop reading”;
    audible output was not independently confirmed
  - notebook Study desk, Study materials and visual topic page had no horizontal
    overflow at a 390 px frame width
  - no application console errors were observed

## Dependency notes

`pdfjs-dist` and `mammoth` were added as runtime dependencies. They are
dynamically imported. `npm audit --omit=dev` reports inherited moderate issues in
React Router and Mammoth's `argparse` dependency; they were not blindly
force-fixed because that would require breaking version changes.

## Next steps

1. Add IndexedDB or server-backed document storage and migration.
2. Add a server-side AI gateway with provider keys kept off the client.
3. Send verified retrieval results to the model and verify returned citations
   against source offsets before display.
4. Add OCR as an explicitly separate, consent-aware pipeline.
5. Add source study guides, section summaries and audio overviews only when a
   real generator is available.
6. Extend visual schema and renderers to concept maps and timelines.
7. Integrate study results with the existing mastery/recall systems, with a clear
   distinction between local practice and verified mastery.
