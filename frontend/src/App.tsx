/**
 * Section F: Generation request form, template selection, run status, section outputs, assembled document.
 * Minimal UI; uses existing API. No rerun/history UI (Section G).
 */
import { useEffect, useState } from 'react'
import { createRun, getRun, listTemplates, type RunDetail, type TemplateSummary } from './api'

const POLL_INTERVAL_MS = 1500

function App() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [clientName, setClientName] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<RunDetail | null>(null)
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
    createRun({
      template_id: templateId,
      structured_input: { client_name: clientName, effective_date: effectiveDate },
    })
      .then(({ run_id }) => setRunId(run_id))
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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={submitting || !templateId}>
            {submitting ? 'Starting…' : 'Generate'}
          </button>
          {runId && (
            <button type="button" onClick={reset}>
              New run
            </button>
          )}
        </div>
      </form>

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
                      <strong>{s.section_id}</strong>
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
            </>
          )}
        </section>
      )}
    </div>
  )
}

export default App
