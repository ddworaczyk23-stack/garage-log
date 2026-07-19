import { render } from 'preact'
import { App } from './app'
import { seedIfEmpty } from './db/seed'
import './styles/fonts'
import './styles/app.css'

async function boot() {
  // Best-effort request to make IndexedDB persistent so the browser is less
  // likely to evict maintenance history under storage pressure. Ignored on
  // browsers that don't support it (e.g. some iOS versions).
  if (navigator.storage?.persist) {
    try {
      await navigator.storage.persist()
    } catch {
      /* non-fatal */
    }
  }

  const root = document.getElementById('app')!

  try {
    await seedIfEmpty()
  } catch (err) {
    // IndexedDB can be unavailable (Safari private browsing, storage quota
    // errors, some older iOS versions) — without this, `render()` below
    // never runs and the page stays permanently blank with no explanation.
    console.error('[boot] failed to open/seed the database', err)
    root.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">⚠️</span>
        <p class="empty-title">Coast couldn't start</p>
        <p class="muted small">
          This browser's local storage may be unavailable (private browsing
          mode, or storage is full). Try a normal browsing window, or reload.
        </p>
      </div>
    `
    return
  }

  render(<App />, root)
}

boot()
