import { useEffect, useState } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { AuthService } from '../utils/auth';
import {
  flushNotebookStorage,
  getAppNotebookRepository,
} from '../notebooks/notebookStorage.mjs';
import { GENERATORS, MATERIAL_GENERATORS } from '../notebooks/generators.mjs';
import {
  ingestFileSource,
  ingestPastedSource,
  ingestWebSource,
} from '../notebooks/sourceIngestion.mjs';
import {
  NOTEBOOK_DESCRIPTION_MAX_LENGTH,
  NOTEBOOK_KIND_LABELS,
  NOTEBOOK_KIND_VALUES,
  NOTEBOOK_TITLE_MAX_LENGTH,
} from '../notebooks/notebookSchema.mjs';
import { SOURCE_STATUSES } from '../notebooks/sourceSchema.mjs';
import { validateCitation } from '../notebooks/citations.mjs';
import { revalidateLearningContext } from '../intelligence/learningContext.mjs';
import { checkGatewayStatus } from '../notebooks/groundedChat.mjs';
import { resolveGatewayBaseUrl } from '../notebooks/gatewayClient.mjs';
import { orchestrateLearningRequestAsync } from '../ai/orchestrator.mjs';
import SourceIngestionPanel from '../components/notebooks/SourceIngestionPanel';
import SourceList from '../components/notebooks/SourceList';
import SourceViewer from '../components/notebooks/SourceViewer';
import NotebookContextPanel from '../components/notebooks/NotebookContextPanel';
import ChatPanel from '../components/notebooks/ChatPanel';
import StudyDeskPanel from '../components/notebooks/StudyDeskPanel';
import StudyMaterialsPanel from '../components/notebooks/StudyMaterialsPanel';
import ResearchToolsPanel from '../components/notebooks/ResearchToolsPanel';
import { showToast } from '../components/ui/Toast';
import { recordActivity } from '../utils/learningActivity.mjs';

const TABS = [
  { id: 'chat', label: 'Conversation' },
  { id: 'study', label: 'Study desk' },
  { id: 'materials', label: 'Study materials' },
];

const PANES = [
  { id: 'sources', label: 'Sources' },
  { id: 'center', label: 'Workspace' },
  { id: 'context', label: 'Context' },
];

const NotebookWorkspace = () => {
  const { notebookId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Older links may point at ?tab=sources; sources now live in the left rail,
  // so that alias resolves to the study desk instead of a missing tab.
  const requestedTab = searchParams.get('tab');
  const initialTab = requestedTab === 'sources'
    ? 'chat'
    : TABS.some((tab) => tab.id === requestedTab)
      ? requestedTab
      : 'chat';
  const initialStudyQuery = (searchParams.get('q') || '').slice(0, 300);
  const user = AuthService.getCurrentUser();
  const [repository] = useState(() => {
    try {
      return getAppNotebookRepository();
    } catch {
      return null;
    }
  });

  const [notebook, setNotebook] = useState(null);
  const [sources, setSources] = useState([]);
  const [sourceContents, setSourceContents] = useState({});
  const [openSourceId, setOpenSourceId] = useState(null);
  const [sourceInspection, setSourceInspection] = useState(null);
  const [mobilePane, setMobilePane] = useState('center');
  const [messages, setMessages] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [learningContext, setLearningContext] = useState(null);
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editKind, setEditKind] = useState('subject');
  const [editTags, setEditTags] = useState('');
  const [editErrors, setEditErrors] = useState([]);
  const [gatewayStatus, setGatewayStatus] = useState(null);
  const [retryingSourceId, setRetryingSourceId] = useState(null);

  const notifyLibraryChange = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('crushlearn-library-change'));
    }
  };

  const loadWorkspace = () => {
    if (!repository || !user) {
      setLoading(false);
      setError('Notebook storage is unavailable in this browser.');
      return;
    }

    try {
      const nextNotebook = repository.getNotebook(user.id, notebookId);
      if (!nextNotebook) {
        setNotebook(null);
        setNotFound(true);
        setLoading(false);
        return;
      }

      const nextSources = repository.listSources(user.id, notebookId);
      const nextContents = repository.listSourceContents(user.id, notebookId);
      const storedContext = repository.getLearningContext(user.id, notebookId);
      const nextContext = storedContext
        ? revalidateLearningContext(storedContext, {
            sources: nextSources,
            sourceContents: nextContents,
          })
        : null;

      // If a source was removed, drop unverifiable quotations from storage as
      // well as from the screen. Otherwise a deleted source could remain
      // readable in the local learning-context record.
      const storedEvidenceCount = storedContext?.evidence?.length || 0;
      const nextEvidenceCount = nextContext?.evidence?.length || 0;
      const storedVisualCount = storedContext?.visual?.items?.length || 0;
      const nextVisualCount = nextContext?.visual?.items?.length || 0;
      const citationsWereDropped =
        storedContext &&
        (Boolean(storedContext.answer) !== Boolean(nextContext?.answer) ||
          Boolean(storedContext.practice) !== Boolean(nextContext?.practice) ||
          nextEvidenceCount < storedEvidenceCount ||
          nextVisualCount < storedVisualCount);

      if (citationsWereDropped) {
        try {
          if (nextContext) {
            repository.saveLearningContext(user.id, notebookId, nextContext);
          } else {
            repository.clearLearningContext(user.id, notebookId);
          }
        } catch {
          // The in-memory context is still sanitized and will be revalidated on
          // the next load even if storage cannot be rewritten.
        }
      }

      setNotebook(nextNotebook);
      setSources(nextSources);
      setSourceContents(nextContents);
      setLearningContext(nextContext);
      setMessages(repository.listChatMessages(user.id, notebookId));
      setMaterials(repository.listStudyMaterials(user.id, notebookId));
      setEditTitle(nextNotebook.title);
      setEditDescription(nextNotebook.description);
      setEditKind(nextNotebook.kind);
      setEditTags((nextNotebook.tags || []).join(', '));
      setNotFound(false);
      setError('');
    } catch {
      setError('This notebook could not be loaded from browser storage.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
    // The repository is stable for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, user?.id, notebookId]);

  // The source open in the reader panel, if it still exists.
  const openSource = openSourceId
    ? sources.find((source) => source.id === openSourceId) || null
    : null;

  const handleOpenSource = (source) => {
    setOpenSourceId((current) => (current === source?.id ? null : source?.id || null));
    if (source?.id) {
      setMobilePane('sources');
      setSourceInspection(null);
    }
  };

  const handleOpenSourceFromContext = (source) => {
    if (!source?.id) return;
    setOpenSourceId(source.id);
    setSourceInspection(null);
    setMobilePane('sources');
  };

  const handleInspectCitation = (citation) => {
    if (!citation || typeof citation.sourceId !== 'string') return;
    const source = sources.find((item) => item.id === citation.sourceId);
    if (!source) {
      setError(
        'The cited source is no longer in this notebook, so the quotation cannot be inspected.'
      );
      return;
    }
    setError('');
    setOpenSourceId(source.id);
    setSourceInspection({
      ...citation,
      requestId: `${Date.now()}-${citation.sourceId}-${citation.locator?.start ?? ''}`,
    });
    setMobilePane('sources');
  };

  // The AI gateway is optional. Probe it once so the chat panel can say
  // truthfully whether answers come from a model or from local extraction.
  useEffect(() => {
    let cancelled = false;
    checkGatewayStatus({ baseUrl: resolveGatewayBaseUrl() })
      .then((status) => {
        if (!cancelled) setGatewayStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setGatewayStatus({
            available: false,
            providerConfigured: false,
            model: null,
            error: 'The AI gateway could not be reached.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Answers a learner question and stores both turns in this notebook.
   *
   * The answer itself is produced by `answerGroundedQuestion`, which verifies
   * every citation against the stored source text before returning. This
   * function only persists what that layer already approved.
   */
  const handleAsk = async (question) => {
    if (!repository || !user || !notebook) {
      return {
        ok: false,
        errors: ['Notebook storage is unavailable.'],
      };
    }

    const envelope = await orchestrateLearningRequestAsync({
      task: 'ask',
      question,
      userId: user.id,
      notebookId: notebook.id,
      sources,
      sourceContents,
      messages,
      sessionId: `${user.id}:${notebook.id}`,
      baseUrl: resolveGatewayBaseUrl(),
    });
    const citation = envelope.data?.citation || null;
    const result = {
      ok: envelope.ok,
      answered: Boolean(envelope.data?.answer),
      answer: envelope.data?.answer || null,
      citations:
        envelope.data?.result?.citations ||
        (citation ? [citation] : []),
      generator: envelope.data?.generator || GENERATORS.LOCAL_EXTRACTIVE,
      note:
        envelope.data?.note ||
        envelope.limitations?.[0] ||
        envelope.errors?.[0] ||
        'No answer was produced.',
      errors: envelope.ok ? [] : envelope.errors || [envelope.limitations?.[0]].filter(Boolean),
      orchestration: envelope,
    };

    try {
      repository.appendChatMessage(user.id, notebook.id, {
        role: 'user',
        content: question,
        citations: [],
      });

      const assistantContent = result.answered
        ? `${result.answer}\n\n${result.note}`
        : result.note;

      if (assistantContent.trim()) {
        repository.appendChatMessage(user.id, notebook.id, {
          role: 'assistant',
          content: assistantContent,
          citations: result.citations || [],
        });
      }
    } catch (saveError) {
      return {
        ok: false,
        errors: [
          saveError?.message ||
            'The answer could not be stored. Browser storage may be full.',
        ],
      };
    }

    setMessages(repository.listChatMessages(user.id, notebook.id));
    notifyLibraryChange();
    recordActivity('question_asked', notebook.title || 'Notebook');

    if (!result.answered && result.errors?.length) {
      return { ok: false, errors: result.errors };
    }

    return { ok: true, result };
  };

  const handleSaveDetails = (event) => {
    event.preventDefault();
    if (!repository || !user || !notebook) return;

    try {
      const updated = repository.updateNotebook(user.id, notebook.id, {
        title: editTitle,
        description: editDescription,
        kind: editKind,
        tags: editTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setNotebook(updated);
      setEditErrors([]);
      setIsEditing(false);
      setError('');
    } catch (saveError) {
      setEditErrors(
        saveError?.errors || ['The notebook details could not be saved.']
      );
    }
  };

  const handleDeleteNotebook = () => {
    if (!repository || !user || !notebook) return;
    if (
      !window.confirm(
        `Delete "${notebook.title}" and all of its sources, chat history and study materials?`
      )
    ) {
      return;
    }

    try {
      repository.deleteNotebook(user.id, notebook.id);
      showToast('Notebook deleted.', { tone: 'info' });
      navigate('/notebooks');
    } catch {
      setError('The notebook could not be deleted.');
    }
  };

  const handleArchiveNotebook = () => {
    if (!repository || !user || !notebook) return;
    try {
      const updated = repository.archiveNotebook(user.id, notebook.id);
      setNotebook(updated);
      showToast(
        'Notebook archived. Its sources, chat history and study materials are kept.',
        { tone: 'info' }
      );
    } catch {
      setError('The notebook could not be archived.');
    }
  };

  const handleRestoreNotebook = () => {
    if (!repository || !user || !notebook) return;
    try {
      const updated = repository.restoreNotebook(user.id, notebook.id);
      setNotebook(updated);
      showToast('Notebook restored.', { tone: 'success' });
    } catch {
      setError('The notebook could not be restored.');
    }
  };

  const handleIngest = async (input) => {
    if (!repository || !user || !notebook) {
      return { ok: false, errors: ['Notebook storage is unavailable.'] };
    }

    const result =
      input.kind === 'pasted'
        ? ingestPastedSource({
            notebookId: notebook.id,
            title: input.title,
            text: input.text,
          })
        : input.kind === 'web'
          ? await ingestWebSource({
              notebookId: notebook.id,
              url: input.url,
              baseUrl: resolveGatewayBaseUrl(),
            })
          : await ingestFileSource({
              notebookId: notebook.id,
              file: input.file,
            });

    if (!result.ok) return result;

    try {
      repository.addSource(user.id, notebook.id, {
        source: result.source,
        content: result.content,
      });
      const storageResult = result.content
        ? await flushNotebookStorage()
        : { ok: true };
      loadWorkspace();
      recordActivity('source_added', result.source.title);
      if (!storageResult.ok) {
        showToast(
          `Source "${result.source.title}" was added, but its text is using browser fallback storage: ${
            storageResult.lastError || 'the local database did not confirm the write.'
          }`,
          { tone: 'warning' }
        );
      } else if (result.source.status === SOURCE_STATUSES.FAILED) {
        showToast(
          `Source "${result.source.title}" could not be read: ${
            result.source.error || 'No readable text was found.'
          }`,
          { tone: 'danger' }
        );
      } else {
        showToast(`Source "${result.source.title}" added.`, { tone: 'success' });
      }
      return result;
    } catch (ingestError) {
      return {
        ok: false,
        errors: [
          ingestError?.message ||
            'The source could not be saved. Browser storage may be full.',
        ],
      };
    }
  };

  const handleDeleteSource = (source) => {
    if (!repository || !user || !notebook) return;

    let dependents = [];
    try {
      dependents = repository.listSourceDependents(
        user.id,
        notebook.id,
        source.id
      );
    } catch {
      setError('The source dependencies could not be checked.');
      return;
    }

    const message =
      dependents.length > 0
        ? [
            `Delete the source "${source.title}"?`,
            '',
            'These saved items cite it:',
            ...dependents.map(
              (item) =>
                `• ${item.label}${item.excerpt ? ` — “${item.excerpt}”` : ''}`
            ),
            '',
            'They will stay in the notebook, but their citation will no longer point to stored source text.',
          ].join('\n')
        : `Delete the source "${source.title}"?`;

    if (!window.confirm(message)) return;

    try {
      repository.removeSource(user.id, notebook.id, source.id);
      showToast(`Source "${source.title}" deleted.`, { tone: 'info' });
      loadWorkspace();
    } catch {
      setError('The source could not be deleted.');
    }
  };

  /**
   * Retry a failed source by selecting the file again.
   *
   * The source keeps its id, so existing citations stay attached. The source is
   * moved through queued and processing while extraction runs, then replaced
   * with either the ready text or the real extraction error.
   */
  const handleRetrySource = async (source, file) => {
    if (!repository || !user || !notebook || !source || !file) return;
    if (retryingSourceId) return;

    setRetryingSourceId(source.id);
    setError('');

    let statusChanged = false;
    let replaced = false;

    try {
      const queued = repository.updateSourceStatus(
        user.id,
        notebook.id,
        source.id,
        { status: SOURCE_STATUSES.QUEUED }
      );
      if (!queued) {
        throw new Error(
          `Source "${source.title}" no longer exists. It was not retried.`
        );
      }
      statusChanged = true;

      const processing = repository.updateSourceStatus(
        user.id,
        notebook.id,
        source.id,
        { status: SOURCE_STATUSES.PROCESSING }
      );
      if (!processing) {
        throw new Error(
          `Source "${source.title}" no longer exists. It was not retried.`
        );
      }
      setSources(repository.listSources(user.id, notebook.id));

      const result = await ingestFileSource({
        notebookId: notebook.id,
        file,
      });

      if (!result.ok) {
        const message =
          result.errors?.join(' ') ||
          'The selected file could not be read. Its contents were not imported.';
        const failed = repository.replaceSource(
          user.id,
          notebook.id,
          source.id,
          {
            source: {
              ...source,
              status: SOURCE_STATUSES.FAILED,
              error: message,
              hasExtractedText: false,
            },
            content: null,
          }
        );
        if (!failed) {
          throw new Error(
            `Source "${source.title}" no longer exists. Its retry could not be saved.`
          );
        }
        replaced = true;
        showToast(`Source "${source.title}" is still failed: ${message}`, {
          tone: 'danger',
        });
      } else {
        const replacement = {
          ...result.source,
          id: source.id,
          title: source.title,
        };
        const saved = repository.replaceSource(user.id, notebook.id, source.id, {
          source: replacement,
          content: result.content,
        });
        if (!saved) {
          throw new Error(
            `Source "${source.title}" no longer exists. Its retry could not be saved.`
          );
        }
        replaced = true;

        if (replacement.status === SOURCE_STATUSES.READY) {
          showToast(`Source "${source.title}" is ready.`, { tone: 'success' });
          recordActivity('source_reingested', source.title);
        } else {
          showToast(
            `Source "${source.title}" is still failed: ${
              replacement.error || 'No readable text was found.'
            }`,
            { tone: 'danger' }
          );
        }
      }

      const storageResult = replaced
        ? await flushNotebookStorage()
        : { ok: true };
      if (!storageResult.ok) {
        showToast(
          `Source "${source.title}" was replaced, but its text is using browser fallback storage: ${
            storageResult.lastError || 'the local database did not confirm the write.'
          }`,
          { tone: 'warning' }
        );
      }

      loadWorkspace();
    } catch (retryError) {
      const message =
        retryError?.message || 'The source could not be retried in this browser.';

      // A retry must never leave a source stuck in processing. If extraction
      // or storage threw after the status changed, record the real failure.
      if (statusChanged && !replaced) {
        try {
          repository.replaceSource(user.id, notebook.id, source.id, {
            source: {
              ...source,
              status: SOURCE_STATUSES.FAILED,
              error: message,
              hasExtractedText: false,
            },
            content: null,
          });
        } catch {
          // The visible error below still explains what happened.
        }
      }

      setError(message);
      try {
        loadWorkspace();
      } catch {
        // The error above already explains that storage did not cooperate.
      }
    } finally {
      setRetryingSourceId(null);
    }
  };

  const handleExport = (format) => {
    if (!repository || !user || !notebook) return;

    try {
      const result = repository.exportNotebook(user.id, notebook.id, {
        format,
      });
      if (!result.ok) {
        setError(result.errors?.[0] || 'The notebook could not be exported.');
        return;
      }
      if (
        typeof document === 'undefined' ||
        typeof URL === 'undefined' ||
        typeof URL.createObjectURL !== 'function'
      ) {
        setError('This browser cannot create a download for the export.');
        return;
      }

      const blob = new Blob([result.content], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      showToast(`Exported ${result.filename}.`, { tone: 'success' });
    } catch (exportError) {
      setError(
        exportError?.message || 'The notebook could not be exported.'
      );
    }
  };

  const handleSaveNote = ({ title, body, citations = [], messageId } = {}) => {
    if (!repository || !user || !notebook) {
      return { ok: false, errors: ['Notebook storage is unavailable.'] };
    }

    const material = {
      id: messageId ? `note_message_${messageId}` : undefined,
      title:
        typeof title === 'string' && title.trim()
          ? title
          : 'Saved from chat history',
      kind: 'note',
      body: typeof body === 'string' ? body : '',
      generator: MATERIAL_GENERATORS.AUTHORED,
      citations: Array.isArray(citations) ? citations : [],
    };

    if (material.id && materials.some((item) => item.id === material.id)) {
      return { ok: false, errors: ['This message is already saved as a note.'] };
    }

    try {
      repository.saveStudyMaterials(user.id, notebook.id, [...materials, material]);
      loadWorkspace();
      notifyLibraryChange();
      recordActivity('note_saved', material.title);
      showToast('Note saved to this notebook.', { tone: 'success' });
      return { ok: true };
    } catch (saveError) {
      return {
        ok: false,
        errors: [
          saveError?.message ||
            'The note could not be saved. Browser storage may be full.',
        ],
      };
    }
  };

  const handleSaveStudyKit = (material) => {
    if (!repository || !user || !notebook) {
      return { ok: false, errors: ['Notebook storage is unavailable.'] };
    }

    try {
      repository.saveStudyMaterials(user.id, notebook.id, [
        ...materials,
        material,
      ]);
      loadWorkspace();
      notifyLibraryChange();
      recordActivity('study_material_generated', material.title);
      showToast('Study kit saved to this notebook.', { tone: 'success' });
      return { ok: true };
    } catch (saveError) {
      return {
        ok: false,
        errors: [
          saveError?.message ||
            'The study kit could not be saved. Browser storage may be full.',
        ],
      };
    }
  };

  const handleSaveResearchMaterial = ({ result, generator } = {}) => {
    if (!repository || !user || !notebook) {
      return { ok: false, errors: ['Notebook storage is unavailable.'] };
    }
    const data = result?.data;
    if (!result?.ok || !data) {
      return { ok: false, errors: ['Run a research answer before saving a brief.'] };
    }

    const claims = Array.isArray(data.claims) ? data.claims : [];
    const modelClaims = Array.isArray(data.modelClaims) ? data.modelClaims : [];
    const sourceIds = sources.map((source) => source.id);
    const sourceTexts = {};
    sources.forEach((source) => {
      const text = sourceContents[source.id]?.text;
      if (typeof text === 'string' && text) sourceTexts[source.id] = text;
    });

    const candidateCitations = [
      ...claims.flatMap((claim) => claim.citations || (claim.citation ? [claim.citation] : [])),
      ...modelClaims.flatMap((claim) =>
        claim.citations || (claim.citation ? [claim.citation] : [])
      ),
    ];
    const seenCitations = new Set();
    let omittedCitations = 0;
    const citations = [];
    candidateCitations.forEach((citation) => {
      const verification = validateCitation(citation, {
        sourceIds,
        sourceTexts,
        requireSourceText: true,
      });
      if (!verification.ok || !verification.verified) {
        omittedCitations += 1;
        return;
      }
      const key = `${verification.citation.sourceId}:${verification.citation.locator.start}-${verification.citation.locator.end}`;
      if (seenCitations.has(key)) return;
      seenCitations.add(key);
      if (citations.length < 20) citations.push(verification.citation);
    });

    const question = data.question || 'Research question';
    const lines = [
      `Research brief: ${question}`,
      '',
      `Grounding: ${citations.length} verified source citation${
        citations.length === 1 ? '' : 's'
      } from this notebook. No external literature search was performed.`,
    ];

    if (modelClaims.length > 0) {
      lines.push('', 'MODEL INTERPRETATION (model-written, not source evidence)');
      modelClaims.slice(0, 6).forEach((claim, index) => {
        lines.push(
          `${index + 1}. [${claim.classification}] ${claim.text}`,
          `   ${claim.classificationReason || ''}`
        );
      });
    }

    if (claims.length > 0) {
      lines.push('', 'NOTEBOOK EVIDENCE (exact verified quotations)');
      claims.slice(0, 8).forEach((claim, index) => {
        const location = Number.isInteger(claim.page)
          ? `page ${claim.page}`
          : `characters ${claim.citation?.locator?.start}-${claim.citation?.locator?.end}`;
        lines.push(
          `${index + 1}. “${claim.text}”`,
          `   ${claim.sourceTitle || 'Source'}, ${location}`
        );
      });
    }

    const gaps = Array.isArray(data.cannotEstablish) ? data.cannotEstablish : [];
    if (gaps.length > 0) {
      lines.push('', 'WHAT THE SOURCES CANNOT ESTABLISH');
      gaps.slice(0, 6).forEach((gap) => {
        lines.push(`- ${gap.title}: ${gap.detail}`);
      });
    }

    if (data.externalInformation?.note) {
      lines.push('', 'EXTERNAL INFORMATION', data.externalInformation.note);
    }
    if (omittedCitations > 0) {
      lines.push(
        '',
        `${omittedCitations} citation${
          omittedCitations === 1 ? '' : 's'
        } failed verification while saving and were omitted.`
      );
    }
    lines.push(
      '',
      `Generated by: ${
        generator === MATERIAL_GENERATORS.AI_ASSISTED
          ? 'AI-assisted material; model wording is not source evidence.'
          : 'local extractive research tool; claims are exact source quotations.'
      }`
    );

    const material = {
      title: `Research brief: ${question}`.slice(0, 120),
      kind: 'research_brief',
      body: lines.join('\n'),
      citations,
      generator:
        generator === MATERIAL_GENERATORS.AI_ASSISTED
          ? MATERIAL_GENERATORS.AI_ASSISTED
          : MATERIAL_GENERATORS.LOCAL_EXTRACTIVE,
    };

    try {
      repository.saveStudyMaterials(user.id, notebook.id, [...materials, material]);
      loadWorkspace();
      notifyLibraryChange();
      recordActivity('study_material_generated', material.title);
      showToast('Research brief saved to this notebook.', { tone: 'success' });
      return { ok: true };
    } catch (saveError) {
      const message =
        saveError?.message ||
        'The research brief could not be saved. Browser storage may be full.';
      setError(message);
      return { ok: false, errors: [message] };
    }
  };

  const handleSaveLearningContext = (context) => {
    if (!repository || !user || !notebook) {
      return { ok: false, errors: ['Notebook storage is unavailable.'] };
    }
    if (!context) return { ok: true };

    try {
      const saved = repository.saveLearningContext(
        user.id,
        notebook.id,
        context
      );
      setLearningContext(saved);
      return { ok: true };
    } catch (saveError) {
      return {
        ok: false,
        errors: [
          saveError?.message ||
            'The learning session could not be saved.',
        ],
      };
    }
  };

  const handleClearLearningContext = () => {
    if (!repository || !user || !notebook) {
      return { ok: false, errors: ['Notebook storage is unavailable.'] };
    }

    try {
      repository.clearLearningContext(user.id, notebook.id);
      setLearningContext(null);
      return { ok: true };
    } catch {
      return { ok: false, errors: ['The learning session could not be cleared.'] };
    }
  };

  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    setMobilePane('center');
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('tab', nextTab);
        if (nextTab !== 'study') next.delete('q');
        return next;
      },
      { replace: true }
    );
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div
          role="status"
          className="rounded-2xl border border-line bg-surface p-8 text-ink-muted"
        >
          Loading notebook…
        </div>
      </div>
    );
  }

  if (notFound || !notebook) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-2xl border border-line bg-surface p-8">
          <h1 className="text-2xl font-bold text-ink">
            Notebook not found
          </h1>
          <p className="mt-2 text-ink-muted">
            This notebook does not exist for the signed-in learner, or it was
            deleted.
          </p>
          <Link
            to="/notebooks"
            className="mt-5 inline-block rounded-lg bg-primary-600 px-4 py-2 font-semibold text-ink-inverse hover:bg-accent-strong"
          >
            Back to notebooks
          </Link>
        </div>
      </div>
    );
  }

  const counts = {
    sources: sources.length,
    chat: messages.length,
    materials: materials.length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        to="/notebooks"
        className="text-sm font-semibold text-primary-700 hover:text-primary-800"
      >
        ← All notebooks
      </Link>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-danger/40 bg-danger-soft p-4 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <header className="mt-4 mb-6 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        {isEditing ? (
          <form onSubmit={handleSaveDetails}>
            <h1 className="text-2xl font-bold text-ink">Edit notebook</h1>

            {editErrors.length > 0 && (
              <div
                role="alert"
                className="mt-3 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger"
              >
                <ul className="list-disc space-y-1 pl-4">
                  {editErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="edit-notebook-title"
                  className="block text-sm font-medium text-ink-muted mb-2"
                >
                  Title
                </label>
                <input
                  id="edit-notebook-title"
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  maxLength={NOTEBOOK_TITLE_MAX_LENGTH}
                  className="w-full rounded-lg border border-line px-4 py-3 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-notebook-description"
                  className="block text-sm font-medium text-ink-muted mb-2"
                >
                  Description
                </label>
                <textarea
                  id="edit-notebook-description"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  maxLength={NOTEBOOK_DESCRIPTION_MAX_LENGTH}
                  rows={3}
                  className="w-full rounded-lg border border-line px-4 py-3 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-notebook-kind"
                  className="block text-sm font-medium text-ink-muted mb-2"
                >
                  This notebook is for
                </label>
                <select
                  id="edit-notebook-kind"
                  value={editKind}
                  onChange={(event) => setEditKind(event.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
                >
                  {NOTEBOOK_KIND_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {NOTEBOOK_KIND_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="edit-notebook-tags"
                  className="block text-sm font-medium text-ink-muted mb-2"
                >
                  Tags
                </label>
                <input
                  id="edit-notebook-tags"
                  type="text"
                  value={editTags}
                  onChange={(event) => setEditTags(event.target.value)}
                  placeholder="exam, genetics, week 3"
                  className="w-full rounded-lg border border-line px-4 py-3 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary-500"
                />
                <p className="mt-1 text-xs text-ink-subtle">
                  Separate tags with commas.
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                className="rounded-lg bg-primary-600 px-4 py-2 font-semibold text-ink-inverse hover:bg-accent-strong"
              >
                Save changes
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditErrors([]);
                  setEditTitle(notebook.title);
                  setEditDescription(notebook.description);
                  setEditKind(notebook.kind);
                  setEditTags((notebook.tags || []).join(', '));
                }}
                className="rounded-lg bg-line-subtle px-4 py-2 font-medium text-ink-muted hover:bg-line"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-primary-700">
                Notebook workspace
              </p>
              <h1 className="mt-1 text-3xl font-bold text-ink">
                {notebook.title}
              </h1>
              <p className="mt-2 max-w-3xl text-ink-muted">
                {notebook.description || 'No description added yet.'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-line-subtle px-3 py-1 font-medium text-ink-muted">
                  {NOTEBOOK_KIND_LABELS[notebook.kind] || 'Subject'}
                </span>
                {notebook.archivedAt && (
                  <span className="rounded-full bg-warning-soft px-3 py-1 font-medium text-warning">
                    Archived
                  </span>
                )}
                {(notebook.tags || []).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-line px-3 py-1 text-ink-muted"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/20 [&::-webkit-details-marker]:hidden">
                  Export
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-line bg-surface p-2 shadow-soft">
                  <button
                    type="button"
                    onClick={() => handleExport('markdown')}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-line-subtle"
                  >
                    Markdown (.md)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('json')}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-line-subtle"
                  >
                    JSON (re-importable)
                  </button>
                  <p className="px-3 pb-1 pt-2 text-xs text-ink-subtle">
                    Downloads locally. Nothing is uploaded.
                  </p>
                </div>
              </details>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-lg bg-line-subtle px-4 py-2 text-sm font-medium text-ink-muted hover:bg-line"
              >
                Edit details
              </button>
              {notebook.archivedAt ? (
                <button
                  type="button"
                  onClick={handleRestoreNotebook}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle"
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleArchiveNotebook}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:bg-line-subtle"
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                onClick={handleDeleteNotebook}
                className="rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft"
              >
                Delete notebook
              </button>
            </div>
          </div>
        )}
      </header>

      <nav
        className="mb-5 flex flex-wrap gap-2"
        aria-label="Notebook sections"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleTabChange(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === item.id
                ? 'bg-accent text-ink-inverse'
                : 'bg-surface text-ink-muted ring-1 ring-line hover:bg-line-subtle'
            }`}
          >
            {item.label}
            {Number.isFinite(counts[item.id]) ? ` (${counts[item.id]})` : ''}
          </button>
        ))}
      </nav>

      <nav
        aria-label="Visible workspace pane"
        className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-muted p-1 xl:hidden"
      >
        {PANES.map((pane) => (
          <button
            key={pane.id}
            type="button"
            aria-pressed={mobilePane === pane.id}
            onClick={() => setMobilePane(pane.id)}
            className={`rounded-lg px-2 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent/30 ${
              mobilePane === pane.id
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-muted hover:bg-surface/70'
            }`}
          >
            {pane.label}
          </button>
        ))}
      </nav>

      <div className="grid gap-6 xl:grid-cols-[19rem_minmax(0,1fr)_20rem]">
        {/* Left rail: sources are always visible at xl; one pane at a time below it. */}
        <aside
          aria-labelledby="sources-rail-heading"
          className={`min-w-0 xl:sticky xl:top-24 xl:block xl:max-h-[calc(100vh-6.5rem)] xl:self-start xl:overflow-y-auto ${
            mobilePane === 'sources' ? 'block' : 'hidden'
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="sources-rail-heading" className="text-lg font-semibold text-ink">
              Sources
            </h2>
            <span className="text-sm text-ink-subtle">{sources.length} total</span>
          </div>
          <div className="mb-4">
            <SourceList
              sources={sources}
              onDelete={handleDeleteSource}
              onOpen={handleOpenSource}
              onRetry={handleRetrySource}
              retryingSourceId={retryingSourceId}
              openSourceId={openSourceId}
            />
          </div>
          {openSource && (
            <div className="mb-4">
              <SourceViewer
                source={openSource}
                sourceContents={sourceContents}
                inspection={sourceInspection}
              />
            </div>
          )}
          <details className="rounded-2xl border border-line bg-surface shadow-sm">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-accent-strong hover:bg-line-subtle">
              + Add a source
            </summary>
            <div className="px-4 pb-4">
              <SourceIngestionPanel onIngest={handleIngest} />
            </div>
          </details>
        </aside>

        {/* Center: the current workspace tab. */}
        <div
          className={`min-w-0 xl:block ${
            mobilePane === 'center' ? 'block' : 'hidden'
          }`}
        >
          {tab === 'study' && (
            <StudyDeskPanel
              sources={sources}
              sourceContents={sourceContents}
              notebookId={notebook.id}
              userId={user.id}
              initialQuery={initialStudyQuery}
              initialContext={learningContext}
              onSaveStudyKit={handleSaveStudyKit}
              onSaveLearningContext={handleSaveLearningContext}
              onClearLearningContext={handleClearLearningContext}
            />
          )}

          {tab === 'chat' && (
            <div className="space-y-4">
              <ChatPanel
                messages={messages}
                sources={sources}
                sourceContents={sourceContents}
                notebookId={notebook.id}
                userId={user.id}
                onSaveNote={handleSaveNote}
                onAsk={handleAsk}
                onInspectCitation={handleInspectCitation}
                gatewayStatus={gatewayStatus}
              />
              <ResearchToolsPanel
                sources={sources}
                sourceContents={sourceContents}
                gatewayStatus={gatewayStatus}
                onInspectCitation={handleInspectCitation}
                onSaveMaterial={handleSaveResearchMaterial}
              />
            </div>
          )}

          {tab === 'materials' && (
            <StudyMaterialsPanel
              materials={materials}
              sources={sources}
              sourceContents={sourceContents}
              onInspectCitation={handleInspectCitation}
            />
          )}
        </div>

        {/* Right rail: contextual facts. It is one selectable pane below xl. */}
        <div
          className={`min-w-0 xl:sticky xl:top-24 xl:block xl:self-start ${
            mobilePane === 'context' ? 'block' : 'hidden'
          }`}
        >
          <NotebookContextPanel
            notebook={notebook}
            sources={sources}
            sourceContents={sourceContents}
            materials={materials}
            learningContext={learningContext}
            activeTab={tab}
            onJumpTab={handleTabChange}
            onOpenSource={handleOpenSourceFromContext}
            onInspectCitation={handleInspectCitation}
            headingId="workspace-context-heading"
          />
        </div>
      </div>
    </div>
  );
};

export default NotebookWorkspace;
