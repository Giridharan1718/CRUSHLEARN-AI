import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initTheme } from './utils/theme.js'
import { migrateLegacyUser } from './utils/migration.mjs'
import { hydrateNotebookStorage } from './notebooks/notebookStorage.mjs'
import './index.css'

initTheme()

// Lift a profile from the original demo build into a real account before the
// app renders, so an existing learner keeps their notebooks and notes.
migrateLegacyUser()

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

// Source text moved to IndexedDB, but the repository interface is synchronous.
// Hydrate its in-memory cache and migrate legacy localStorage text before the
// first notebook is read. If storage is unavailable the app still renders and
// reports the real fallback state rather than blocking the whole product.
hydrateNotebookStorage()
  .catch(() => null)
  .finally(renderApp)
