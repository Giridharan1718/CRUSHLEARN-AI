import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../utils/auth';
import {
  flushNotebookStorage,
  getAppNotebookRepository,
} from '../notebooks/notebookStorage.mjs';
import NotebookListView from '../components/notebooks/NotebookListView';
import { showToast } from '../components/ui/Toast';

const Notebooks = () => {
  const user = AuthService.getCurrentUser();
  const navigate = useNavigate();
  const [repository] = useState(() => {
    try {
      return getAppNotebookRepository();
    } catch {
      return null;
    }
  });
  const [notebooks, setNotebooks] = useState([]);
  const [archivedNotebooks, setArchivedNotebooks] = useState([]);
  const [sourceCounts, setSourceCounts] = useState({});
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = () => {
    if (!repository || !user) {
      setLoading(false);
      return;
    }

    try {
      const nextNotebooks = repository.listNotebooks(user.id);
      const nextArchived = repository.listArchivedNotebooks(user.id);
      const nextCounts = {};
      [...nextNotebooks, ...nextArchived].forEach((notebook) => {
        nextCounts[notebook.id] = repository.listSources(
          user.id,
          notebook.id
        ).length;
      });
      setNotebooks(nextNotebooks);
      setArchivedNotebooks(nextArchived);
      setSourceCounts(nextCounts);
      setError('');
    } catch {
      setError('Notebooks could not be loaded from this browser.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // The repository is stable for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, user?.id]);

  const handleCreate = async (input) => {
    if (!repository || !user) {
      return { ok: false, errors: ['Browser storage is unavailable.'] };
    }
    try {
      const notebook = repository.createNotebook(user.id, input);
      showToast(`Notebook "${notebook.title}" created.`, { tone: 'success' });
      navigate(`/notebooks/${notebook.id}`);
      return { ok: true, notebook };
    } catch (createError) {
      return {
        ok: false,
        errors:
          createError?.errors || [
            'The notebook could not be created. Check browser storage access.',
          ],
      };
    }
  };

  const handleDelete = async (notebookId) => {
    if (!repository || !user) return;
    try {
      repository.deleteNotebook(user.id, notebookId);
      showToast('Notebook deleted.', { tone: 'info' });
      refresh();
    } catch {
      setError('The notebook could not be deleted.');
    }
  };

  const handleArchive = async (notebookId) => {
    if (!repository || !user) return;
    try {
      repository.archiveNotebook(user.id, notebookId);
      showToast('Notebook archived. Its contents are kept.', { tone: 'info' });
      refresh();
    } catch {
      setError('The notebook could not be archived.');
    }
  };

  const handleRestore = async (notebookId) => {
    if (!repository || !user) return;
    try {
      repository.restoreNotebook(user.id, notebookId);
      showToast('Notebook restored.', { tone: 'success' });
      refresh();
    } catch {
      setError('The notebook could not be restored.');
    }
  };

  const handleImport = async (payload) => {
    if (!repository || !user) {
      return { ok: false, errors: ['Browser storage is unavailable.'] };
    }

    const result = repository.importNotebook(user.id, payload);
    if (!result.ok) return result;

    const storageResult = await flushNotebookStorage();
    if (!storageResult.ok) {
      showToast(
        `Imported "${result.notebook.title}", but source text is using browser fallback storage: ${
          storageResult.lastError || 'the local database did not confirm the write.'
        }`,
        { tone: 'warning' }
      );
    } else {
      showToast(
        `Imported "${result.notebook.title}" with ${result.counts.sources} source${
          result.counts.sources === 1 ? '' : 's'
        }.`,
        { tone: 'success' }
      );
    }
    navigate(`/notebooks/${result.notebook.id}`);
    return result;
  };

  if (!user) return null;

  return (
    <NotebookListView
      notebooks={notebooks}
      archivedNotebooks={archivedNotebooks}
      showArchived={showArchived}
      sourceCounts={sourceCounts}
      loading={loading}
      error={error}
      onCreate={handleCreate}
      onDelete={handleDelete}
      onArchive={handleArchive}
      onRestore={handleRestore}
      onToggleArchived={setShowArchived}
      onImport={handleImport}
    />
  );
};

export default Notebooks;
