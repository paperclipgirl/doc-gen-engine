/**
 * Section F+G: Generation form, template select, run status, section outputs, assembled doc;
 * Section G: rerun section, run history, open run, version history.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  createRun,
  getRun,
  getRunVersions,
  listRuns,
  listTemplates,
  rerunSection,
  type RunDetail,
  type RunSummary,
  type TemplateSummary,
  type VersionSnapshot,
} from './api'

const POLL_INTERVAL_MS = 1500

/** Area of Law (first level) and optional sub-areas (second level) for jurisdiction dropdown. */
const AREA_OF_LAW: { area: string; subs: string[] }[] = [
  { area: 'Agriculture Law', subs: [] },
  {
    area: 'Banking Law',
    subs: [
      'Bank Secrecy and Anti-Money Laundering Law',
      'Banking Operations Law',
      'Cryptocurrency Law',
    ],
  },
  {
    area: 'Bankruptcy, Insolvency, and Restructuring Law',
    subs: ['Corporate Insolvency Law', 'Personal Insolvency Law'],
  },
  { area: 'Cannabis Law', subs: [] },
  {
    area: 'Commercial and Trade Law',
    subs: [
      'Admiralty and Maritime Law',
      'Antitrust and Competition Law',
      'Commercial Transactions Law',
      'Consumer Protection Law',
      'Franchise Law',
      'Trade Law',
    ],
  },
  {
    area: 'Constitutional and Civil Rights Law',
    subs: [
      'Discrimination Law',
      'Environmental, Social, and Governance Law',
      'Individual Rights Law',
      'Political Rights Law',
    ],
  },
  {
    area: 'Contract Law',
    subs: [
      'Civil Contract Law',
      'Commercial Transactions Law',
      'Employment Contracts Law',
      'Government Contracts Law',
      'Independent Contractor Law',
      'Property Rights and Transactions Law',
    ],
  },
  {
    area: 'Corporate Law',
    subs: [
      'Business Organizations Law',
      'Corporate Governance Law',
      'Mergers and Acquisitions Law',
    ],
  },
  {
    area: 'Criminal Law',
    subs: [
      'Anti-Corruption Law',
      'Asset Forfeiture Law',
      'Business and Financial Crimes Law',
      'Cybercrime Law',
      'Organized Crime Law',
      'Prison Law',
    ],
  },
  { area: 'Education Law', subs: [] },
  {
    area: 'Energy Law',
    subs: [
      'Energy Sales and Transmission Law',
      'Nuclear Law',
      'Oil and Gas Law',
      'Renewable Energy Law',
    ],
  },
  {
    area: 'Environmental and Natural Resource Law',
    subs: [
      'Air Quality Law',
      'Chemical Safety Law',
      'Contaminant Cleanup Law',
      'Environmental, Social, and Governance Law',
      'Fish and Game Law',
      'Forest Resources Law',
      'Impact Assessment Law',
      'Mineral Resources Law',
      'Waste Management Law',
      'Water Quality Law',
      'Water Resources and Wetlands Law',
      'Wildlife and Plants Law',
    ],
  },
  {
    area: 'Finance and Lending Law',
    subs: [
      'Commercial Finance Law',
      'Debt Collection Law',
      'Lender Liability Law',
      'Structured Finance Law',
    ],
  },
]

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function App() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [clientName, setClientName] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [topic, setTopic] = useState('')
  const [areaOfLaw, setAreaOfLaw] = useState('')
  const [subArea, setSubArea] = useState('')
  const [context, setContext] = useState('')
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<RunDetail | null>(null)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [versions, setVersions] = useState<VersionSnapshot[]>([])
  const [rerunningSectionId, setRerunningSectionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Load templates on mount
  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load templates'))
  }, [])

  // Set default template when list loads
  useEffect(() => {
    if (templates.length > 0 && !templateId) setTemplateId(templates[0].id)
  }, [templates, templateId])

  // Load run history on mount and when creating a new run (reset)
  const refreshRunHistory = useCallback(() => {
    listRuns()
      .then(setRuns)
      .catch(() => {})
  }, [])
  useEffect(() => {
    refreshRunHistory()
  }, [refreshRunHistory])

  // When we have a run, load its versions (prototype: one entry)
  useEffect(() => {
    if (!runId) {
      setVersions([])
      return
    }
    getRunVersions(runId)
      .then(setVersions)
      .catch(() => setVersions([]))
  }, [runId])

  // Poll run status when we have a run_id
  useEffect(() => {
    if (!runId) return
    let cancelled = false
    const poll = () => {
      getRun(runId)
        .then((data) => {
          if (cancelled) return
          setRun(data)
          if (data.status === 'running' || data.status === 'pending') {
            id = window.setTimeout(poll, POLL_INTERVAL_MS)
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to fetch run')
        })
    }
    let id = window.setTimeout(poll, 0)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [runId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setRun(null)
    setSubmitting(true)
    const useTopicJurisdictionContext =
      templateId === 'implementation_guidance' || templateId === 'workflow_pattern'
    const jurisdictionValue =
      subArea ? `${areaOfLaw} – ${subArea}` : areaOfLaw
    const structured_input = useTopicJurisdictionContext
      ? { topic, jurisdiction: jurisdictionValue, context: context || '' }
      : { client_name: clientName, effective_date: effectiveDate }
    createRun({
      template_id: templateId,
      structured_input,
    })
      .then(({ run_id }) => {
        setRunId(run_id)
        refreshRunHistory()
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to start run')
        setSubmitting(false)
      })
      .finally(() => setSubmitting(false))
  }

  const reset = () => {
    setRunId(null)
    setRun(null)
    setError(null)
    refreshRunHistory()
  }

  const handleOpenRun = (id: string) => {
    setError(null)
    setRunId(id)
  }

  const handleRerunSection = (sectionId: string) => {
    if (!runId) return
    setRerunningSectionId(sectionId)
    setError(null)
        rerunSection(runId, sectionId)
      .then(() => {
        // Poll until run is completed or failed
        const poll = () => {
          getRun(runId).then((data) => {
            setRun(data)
            if (data.status === 'running' || data.status === 'pending') {
              setTimeout(poll, POLL_INTERVAL_MS)
            } else {
              setRerunningSectionId(null)
              refreshRunHistory()
            }
          }).catch((e) => {
            setError(e instanceof Error ? e.message : 'Rerun failed')
            setRerunningSectionId(null)
          })
        }
        poll()
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Rerun failed')
        setRerunningSectionId(null)
      })
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: '48rem' }}>
      <h1>Document Generation Engine</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="template" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Template
          </label>
          <select
            id="template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={submitting || !!runId}
            style={{ padding: '0.35rem', minWidth: '12rem' }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {(templateId === 'implementation_guidance' || templateId === 'workflow_pattern') ? (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="topic" style={{ display: 'block', marginBottom: '0.25rem' }}>
                Topic <span style={{ color: '#888' }}>(required)</span>
              </label>
              <input
                id="topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={submitting || !!runId}
                style={{ padding: '0.35rem', width: '100%', maxWidth: '20rem' }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="areaOfLaw" style={{ display: 'block', marginBottom: '0.25rem' }}>
                Area of Law <span style={{ color: '#888' }}>(required)</span>
              </label>
              <select
                id="areaOfLaw"
                value={areaOfLaw}
                onChange={(e) => {
                  setAreaOfLaw(e.target.value)
                  setSubArea('')
                }}
                disabled={submitting || !!runId}
                style={{ padding: '0.35rem', width: '100%', maxWidth: '20rem' }}
              >
                <option value="">— Select area of law —</option>
                {AREA_OF_LAW.map(({ area }) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
            {areaOfLaw && (() => {
              const selected = AREA_OF_LAW.find((r) => r.area === areaOfLaw)
              const subs = selected?.subs ?? []
              if (subs.length === 0) return null
              return (
                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="subArea" style={{ display: 'block', marginBottom: '0.25rem' }}>
                    Jurisdiction <span style={{ color: '#888' }}>(optional)</span>
                  </label>
                  <select
                    id="subArea"
                    value={subArea}
                    onChange={(e) => setSubArea(e.target.value)}
                    disabled={submitting || !!runId}
                    style={{ padding: '0.35rem', width: '100%', maxWidth: '20rem' }}
                  >
                    <option value="">— Select sub-area (optional) —</option>
                    {subs.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })()}
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="context" style={{ display: 'block', marginBottom: '0.25rem' }}>
                Context <span style={{ color: '#888' }}>(optional)</span>
              </label>
              <textarea
                id="context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                disabled={submitting || !!runId}
                placeholder="Additional context for the guidance"
                rows={3}
                style={{ padding: '0.35rem', width: '100%', maxWidth: '20rem', resize: 'vertical' }}
              />
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="clientName" style={{ display: 'block', marginBottom: '0.25rem' }}>
                Client name
              </label>
              <input
                id="clientName"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                disabled={submitting || !!runId}
                style={{ padding: '0.35rem', width: '100%', maxWidth: '20rem' }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="effectiveDate" style={{ display: 'block', marginBottom: '0.25rem' }}>
                Effective date
              </label>
              <input
                id="effectiveDate"
                type="text"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                placeholder="e.g. 2025-01-15"
                disabled={submitting || !!runId}
                style={{ padding: '0.35rem', width: '100%', maxWidth: '20rem' }}
              />
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="submit"
            disabled={
              submitting ||
              !templateId ||
              ((templateId === 'implementation_guidance' || templateId === 'workflow_pattern') &&
                (!topic.trim() || !areaOfLaw.trim()))
            }
          >
            {submitting ? 'Starting…' : 'Generate'}
          </button>
          {runId && (
            <button type="button" onClick={reset}>
              New run
            </button>
          )}
        </div>
      </form>

      {/* Section G: run history */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Run history</h2>
        {runs.length === 0 ? (
          <p style={{ color: '#666', fontSize: '0.9rem' }}>No runs yet. Generate a document above.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {runs.map((r) => (
              <li key={r.run_id} style={{ marginBottom: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => handleOpenRun(r.run_id)}
                  style={{
                    padding: '0.35rem 0.5rem',
                    textAlign: 'left',
                    width: '100%',
                    maxWidth: '32rem',
                    background: runId === r.run_id ? '#e0e0e0' : 'transparent',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  {r.template_id} — {formatDate(r.updated_at)} ({r.run_id.slice(0, 8)})
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <p style={{ color: 'crimson', marginBottom: '1rem' }} role="alert">
          {error}
        </p>
      )}

      {runId && run && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>Run status</h2>
          <p>
            <strong>Status:</strong> {run.status}
            {run.progress_message && (
              <span style={{ marginLeft: '0.5rem', color: '#555' }}>{` — ${run.progress_message}`}</span>
            )}
            {run.error && (
              <span style={{ color: 'crimson', marginLeft: '0.5rem' }}>{run.error}</span>
            )}
          </p>

          {run.status === 'completed' && (
            <>
              <h3>Section outputs</h3>
              {run.sections.length === 0 ? (
                <p>No sections.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {run.sections.map((s) => (
                    <li key={s.section_id} style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <strong>{s.section_id}</strong>
                        <button
                          type="button"
                          onClick={() => handleRerunSection(s.section_id)}
                          disabled={rerunningSectionId !== null}
                          style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                        >
                          {rerunningSectionId === s.section_id ? 'Rerunning…' : 'Rerun'}
                        </button>
                      </div>
                      <pre
                        style={{
                          marginTop: '0.25rem',
                          padding: '0.75rem',
                          background: '#f5f5f5',
                          borderRadius: '4px',
                          overflow: 'auto',
                          fontSize: '0.9rem',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {s.content}
                      </pre>
                    </li>
                  ))}
                </ul>
              )}

              <h3>Assembled document</h3>
              {run.assembled ? (
                <pre
                  style={{
                    padding: '1rem',
                    background: '#f5f5f5',
                    borderRadius: '4px',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {run.assembled.content}
                </pre>
              ) : (
                <p>No assembled document.</p>
              )}

              {/* Section G: version history (prototype: one entry per run) */}
              {versions.length > 0 && (
                <>
                  <h3>Versions</h3>
                  <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.9rem' }}>
                    {versions.map((v, i) => (
                      <li key={i} style={{ marginBottom: '0.25rem', color: '#555' }}>
                        {formatDate(v.updated_at)} — {v.section_count} sections
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}

export default App
