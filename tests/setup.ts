// Gives Dexie a real (in-memory) IndexedDB implementation under Node, so the
// db/ layer's CRUD + resync logic can be exercised the same way it runs in a
// browser, without needing a browser.
import 'fake-indexeddb/auto'
