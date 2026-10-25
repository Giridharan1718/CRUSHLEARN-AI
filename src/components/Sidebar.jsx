import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthService } from '../utils/auth';
import { courses } from '../data/mockCourseData';
import { countCompletedLessons } from '../utils/lessonProgress.mjs';
import { getActivitySummary } from '../utils/learningActivity.mjs';
import { getAppNotebookRepository } from '../notebooks/notebookStorage.mjs';
import {
  NOTEBOOK_KIND_LABELS,
  NOTEBOOK_KIND_VALUES,
} from '../notebooks/notebookSchema.mjs';
import { formatGeneratorLabel } from '../notebooks/generators.mjs';

const NAVIGATION_EVENT = 'crushlearn-navigation';
const NAVIGATION_STATE_EVENT = 'crushlearn-navigation-state';
const LIBRARY_EVENT = 'crushlearn-library-change';

const Sidebar = () => {
  const location = useLocation();
  const user = AuthService.getCurrentUser();
  const userId = user?.id || '';
  const completedLessonCount = user ? countCompletedLessons(user, courses) : 0;
  const activity = getActivitySummary();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [library, setLibrary] = useState({
    groups: [],
    threads: [],
    materials: [],
    error: '',
  });
  const closeButtonRef = useRef(null);
  const drawerRef = useRef(null);

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📚' },
    { path: '/notebooks', label: 'Notebooks', icon: '📓' },
    { path: '/visual', label: 'Visual Learning', icon: '🎨' },
    { path: '/interactive', label: 'Interactive Learning', icon: '⚡' },
    { path: '/review', label: 'Active Recall', icon: '🔁' },
    { path: '/skill-passport', label: 'Skill Passport', icon: '🎓' },
    { path: '/about', label: 'About', icon: 'ℹ️' },
    { path: '/profile', label: 'Profile', icon: '👤' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ];

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const refreshLibrary = useCallback(() => {
    if (!userId) {
      setLibrary({ groups: [], threads: [], materials: [], error: '' });
      return;
    }
    try {
      const repository = getAppNotebookRepository();
      const notebooks = repository.listNotebooks(userId);
      const groups = NOTEBOOK_KIND_VALUES.map((kind) => ({
        kind,
        label: NOTEBOOK_KIND_LABELS[kind] || kind,
        notebooks: notebooks.filter((notebook) => notebook.kind === kind),
      })).filter((group) => group.notebooks.length > 0);

      const threads = [];
      const materials = [];
      notebooks.forEach((notebook) => {
        const messages = repository.listChatMessages(userId, notebook.id);
        const latest = [...messages].sort((left, right) =>
          String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
        )[0];
        if (latest) {
          threads.push({
            notebookId: notebook.id,
            notebookTitle: notebook.title,
            message: latest.content,
            role: latest.role,
            createdAt: latest.createdAt,
          });
        }
        repository.listStudyMaterials(userId, notebook.id).forEach((material) => {
          materials.push({
            ...material,
            notebookId: notebook.id,
            notebookTitle: notebook.title,
          });
        });
      });

      threads.sort((left, right) =>
        String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
      );
      materials.sort((left, right) =>
        String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
      );

      setLibrary({
        groups,
        threads: threads.slice(0, 5),
        materials: materials.slice(0, 5),
        error: '',
      });
    } catch (error) {
      setLibrary({
        groups: [],
        threads: [],
        materials: [],
        error:
          error?.message ||
          'Notebook links could not be loaded from this browser’s storage.',
      });
    }
  }, [userId]);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary, location.pathname, location.search]);

  useEffect(() => {
    const handleLibraryChange = () => refreshLibrary();
    const handleStorage = (event) => {
      if (!event.key || String(event.key).startsWith('crushlearn_notebook')) {
        refreshLibrary();
      }
    };
    window.addEventListener(LIBRARY_EVENT, handleLibraryChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(LIBRARY_EVENT, handleLibraryChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refreshLibrary]);

  const closeNavigation = useCallback(({ restoreFocus = true } = {}) => {
    setMobileOpen(false);
    window.dispatchEvent(
      new CustomEvent(NAVIGATION_STATE_EVENT, { detail: { open: false } })
    );
    if (restoreFocus) {
      document.getElementById('app-navigation-trigger')?.focus();
    }
  }, []);

  useEffect(() => {
    const handleToggle = (event) => {
      const open = Boolean(event.detail?.open);
      setMobileOpen(open);
      window.dispatchEvent(
        new CustomEvent(NAVIGATION_STATE_EVENT, { detail: { open } })
      );
      if (!open) {
        document.getElementById('app-navigation-trigger')?.focus();
      }
    };
    window.addEventListener(NAVIGATION_EVENT, handleToggle);
    return () => window.removeEventListener(NAVIGATION_EVENT, handleToggle);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(drawerRef.current?.querySelectorAll(focusableSelector) || [])
        .filter((element) => element.offsetParent !== null);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeNavigation();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!drawerRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const initialFocus = drawerRef.current?.querySelector(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    initialFocus?.focus();
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen, closeNavigation]);

  const groupedNotebooks = useMemo(() => library.groups, [library.groups]);

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
          Navigation
        </h3>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={() => closeNavigation()}
          className="rounded-lg border border-line px-2 py-1 text-xs font-semibold text-ink-muted hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30 lg:hidden"
        >
          Close
        </button>
      </div>

      <nav aria-label="Main navigation" className="mt-2 space-y-1">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => closeNavigation({ restoreFocus: false })}
            className={`flex items-center space-x-3 rounded-lg px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-accent/30 ${
              isActive(item.path)
                ? 'bg-primary-50 font-medium text-primary-700'
                : 'text-ink-muted hover:bg-line-subtle'
            }`}
          >
            <span className="text-lg" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <section className="mt-6 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Notebooks
          </h3>
          <Link
            to="/notebooks"
            onClick={() => closeNavigation({ restoreFocus: false })}
            className="rounded text-xs font-semibold text-accent-strong underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            All
          </Link>
        </div>
        {library.error ? (
          <p role="alert" className="mt-2 text-xs leading-5 text-danger">
            {library.error}{' '}
            <Link
              to="/notebooks"
              onClick={() => closeNavigation({ restoreFocus: false })}
              className="underline underline-offset-2"
            >
              Open notebooks
            </Link>
          </p>
        ) : groupedNotebooks.length === 0 ? (
          <p className="mt-2 text-xs leading-5 text-ink-muted">
            No notebooks yet.{' '}
            <Link
              to="/notebooks"
              onClick={() => closeNavigation({ restoreFocus: false })}
              className="font-semibold text-accent-strong underline-offset-2 hover:underline"
            >
              Create one
            </Link>
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {groupedNotebooks.map((group) => (
              <div key={group.kind}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                  {group.label}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {group.notebooks.map((notebook) => (
                    <li key={notebook.id}>
                      <Link
                        to={`/notebooks/${notebook.id}`}
                        onClick={() => closeNavigation({ restoreFocus: false })}
                        className="block truncate rounded-lg px-2 py-1.5 text-sm text-ink-muted hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
                      >
                        {notebook.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-5 border-t border-line pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
          Recent conversations
        </h3>
        {library.threads.length === 0 ? (
          <p className="mt-2 text-xs leading-5 text-ink-muted">
            No conversation has been saved in the last five notebooks yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {library.threads.map((thread) => (
              <li key={`${thread.notebookId}-${thread.createdAt}-${thread.message.slice(0, 24)}`}>
                <Link
                  to={`/notebooks/${thread.notebookId}?tab=chat`}
                  onClick={() => closeNavigation({ restoreFocus: false })}
                  className="block rounded-lg px-2 py-1.5 hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <span className="block truncate text-xs font-medium text-ink">
                    {thread.message}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-subtle">
                    {thread.notebookTitle} · {thread.role === 'assistant' ? 'answer' : 'question'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5 border-t border-line pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
          Recent materials
        </h3>
        {library.materials.length === 0 ? (
          <p className="mt-2 text-xs leading-5 text-ink-muted">
            Nothing saved yet. Study kits and research briefs appear here.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {library.materials.map((material) => (
              <li key={`${material.notebookId}-${material.id}`}>
                <Link
                  to={`/notebooks/${material.notebookId}?tab=materials`}
                  onClick={() => closeNavigation({ restoreFocus: false })}
                  className="block rounded-lg px-2 py-1.5 hover:bg-line-subtle focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <span className="block truncate text-xs font-medium text-ink">
                    {material.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-subtle">
                    {material.notebookTitle} · {formatGeneratorLabel(material.generator)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="mt-6 border-t border-line pt-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent/30">
          Learning guidance and progress
        </summary>
        <div className="mt-3 rounded-lg bg-gradient-to-br from-accent-soft to-info-soft p-3">
          <div className="flex items-start gap-2">
            <span className="text-xl" aria-hidden="true">
              🧭
            </span>
            <div>
              <h4 className="text-sm font-semibold text-ink">Learning Coach</h4>
              <p className="text-xs leading-5 text-ink-muted">
                Rule-based tips from your local progress. No AI chat provider is connected.
              </p>
            </div>
          </div>
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-ink-muted">Courses Enrolled</dt>
            <dd className="font-semibold text-ink">{user?.enrolledCourses?.length || 0}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-ink-muted">Lessons Completed</dt>
            <dd className="font-semibold text-primary-600">{completedLessonCount}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-ink-muted">Learning Streak</dt>
            <dd className="font-semibold text-warning">
              {activity.streak === null ? 'Off' : `${activity.streak} 🔥`}
            </dd>
          </div>
        </dl>
      </details>
    </>
  );

  return (
    <>
      <aside className="fixed bottom-0 left-0 top-16 hidden w-64 overflow-y-auto border-r border-line bg-surface lg:block">
        <div className="space-y-2 p-4">{content}</div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => closeNavigation()}
            className="absolute inset-0 bg-black/50 focus:outline-none"
          />
          <aside
            ref={drawerRef}
            id="app-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="relative h-full w-[min(20rem,85vw)] overflow-y-auto border-r border-line bg-surface p-4 shadow-soft focus:outline-none"
          >
            {content}
          </aside>
        </div>
      ) : null}
    </>
  );
};

export default Sidebar;
