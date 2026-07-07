import { render } from 'preact'
import { App } from './app'
import { seedIfEmpty } from './db/seed'
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

  await seedIfEmpty()

  render(<App />, document.getElementById('app')!)
}

boot()
