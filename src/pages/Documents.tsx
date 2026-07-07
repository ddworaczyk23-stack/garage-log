import { useEffect, useMemo, useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import { db } from '../db/db'
import { buildDocumentIndex } from '../db/documents'
import {
  filterDocuments,
  formatBytes,
  sortDocumentsByDateDesc,
  type DocFileType,
  type DocSource,
  type DocumentIndexEntry,
} from '../domain/documents'
import { DocumentPreviewModal } from '../components/DocumentPreviewModal'
import { EmptyState, Loading } from '../components/ui'

interface Props {
  /** Optional deep-link filter (e.g. from a vehicle page). */
  initialVehicleId?: string
}

const SOURCE_LABELS: Record<DocSource, string> = {
  maintenance: 'Service',
  repair: 'Repair',
  glovebox: 'Glovebox',
}
const FILE_TYPE_LABELS: Record<DocFileType, string> = {
  image: 'Images',
  pdf: 'PDFs',
  other: 'Other files',
}

// Cross-vehicle document browser: filter by vehicle / attachment source / file
// type, free-text search, and open any document in the preview sheet. The whole
// index is rebuilt reactively (liveQuery), and filtering/sorting is pure.
export function Documents({ initialVehicleId }: Props) {
  const entries = useQuery(buildDocumentIndex)
  const vehicles = useQuery(() => db.vehicles.orderBy('name').toArray())

  const [vehicleId, setVehicleId] = useState<string>(initialVehicleId ?? '')
  const [source, setSource] = useState<'' | DocSource>('')
  const [fileType, setFileType] = useState<'' | DocFileType>('')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (initialVehicleId) setVehicleId(initialVehicleId)
  }, [initialVehicleId])

  const results = useMemo(() => {
    if (!entries) return []
    return sortDocumentsByDateDesc(
      filterDocuments(entries, {
        vehicleId: vehicleId || null,
        source: source || null,
        fileType: fileType || null,
        query,
      }),
    )
  }, [entries, vehicleId, source, fileType, query])

  // Keep the open modal's entry in sync with the reactive index (e.g. after a
  // tag edit) and drop it if the document was removed/reassigned away.
  const openEntry = openId ? (entries ?? []).find((e) => e.doc.id === openId) ?? null : null
  useEffect(() => {
    if (openId && entries && !entries.some((e) => e.doc.id === openId)) setOpenId(null)
  }, [openId, entries])

  const total = entries?.length ?? 0

  return (
    <section class="page">
      <h2 class="page-title">Documents</h2>
      <p class="muted">
        {total === 0 ? 'No documents yet.' : `${results.length} of ${total} shown`}
      </p>

      <div class="doc-filters card">
        <input
          class="doc-search"
          type="search"
          placeholder="Search filename, tag, or context…"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        <div class="doc-filter-row">
          <select value={vehicleId} onChange={(e) => setVehicleId((e.target as HTMLSelectElement).value)}>
            <option value="">All vehicles</option>
            {(vehicles ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select value={source} onChange={(e) => setSource((e.target as HTMLSelectElement).value as DocSource | '')}>
            <option value="">All sources</option>
            {(Object.keys(SOURCE_LABELS) as DocSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
          <select value={fileType} onChange={(e) => setFileType((e.target as HTMLSelectElement).value as DocFileType | '')}>
            <option value="">All file types</option>
            {(Object.keys(FILE_TYPE_LABELS) as DocFileType[]).map((t) => (
              <option key={t} value={t}>
                {FILE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!entries ? (
        <Loading />
      ) : results.length === 0 ? (
        <EmptyState
          icon="📄"
          title={total === 0 ? 'No documents yet' : 'No documents match these filters'}
          hint={
            total === 0
              ? 'Attach receipts or photos when you log a service, or add vehicle papers to the Glovebox.'
              : 'Try clearing the search or a filter above.'
          }
        />
      ) : (
        <ul class="doc-result-list">
          {results.map((e) => (
            <DocumentResultRow key={e.doc.id} entry={e} onOpen={() => setOpenId(e.doc.id)} />
          ))}
        </ul>
      )}

      {openEntry && <DocumentPreviewModal entry={openEntry} onClose={() => setOpenId(null)} />}
    </section>
  )
}

function DocumentResultRow({
  entry,
  onOpen,
}: {
  entry: DocumentIndexEntry
  onOpen: () => void
}) {
  const { doc } = entry
  const icon = entry.fileType === 'pdf' ? '📄' : entry.fileType === 'image' ? '🖼️' : '📎'
  return (
    <li>
      <button type="button" class="doc-result" onClick={onOpen}>
        <span class="doc-result-icon" aria-hidden="true">
          {icon}
        </span>
        <span class="doc-result-main">
          <span class="doc-result-name">{doc.filename}</span>
          <span class="muted small">
            {entry.vehicleName} · {entry.context}
          </span>
          {doc.tags && doc.tags.length > 0 && (
            <span class="doc-tag-row">
              {doc.tags.map((t) => (
                <span key={t} class="doc-tag">
                  {t}
                </span>
              ))}
            </span>
          )}
        </span>
        <span class="doc-result-size muted small">{formatBytes(doc.sizeBytes)}</span>
      </button>
    </li>
  )
}
