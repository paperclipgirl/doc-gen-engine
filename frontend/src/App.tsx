/**
 * Section F+G: Generation form, template select, run status, section outputs, assembled doc;
 * Section G: rerun section, run history, open run, version history.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  createRun,
  getRun,
  getRunVersions,
  getSectionPrompt,
  listRuns,
  listTemplates,
  rerunSection,
  type RunDetail,
  type RunSummary,
  type TemplateSummary,
  type VersionSnapshot,
} from './api'

const POLL_INTERVAL_MS = 1500

/** Section feedback categories for prompt improvement signals. */
const SECTION_FEEDBACK_CATEGORIES = [
  'Legal issue or incorrect legal reasoning',
  'Not compatible with Clio Operate configuration or workflows',
  'Missing important information',
  'Too generic or not actionable',
  'Formatting or clarity issue',
] as const

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [promptCache, setPromptCache] = useState<Record<string, string>>({})
  const [expandedPromptSectionId, setExpandedPromptSectionId] = useState<string | null>(null)
  const [promptLoadingSectionId, setPromptLoadingSectionId] = useState<string | null>(null)
  const [promptErrorBySection, setPromptErrorBySection] = useState<Record<string, string>>({})
  const [sectionFeedback, setSectionFeedback] = useState<Record<string, { category: string; comment?: string; submittedAt: string }>>({})
  const [expandedFeedbackSectionId, setExpandedFeedbackSectionId] = useState<string | null>(null)
  const [feedbackCategory, setFeedbackCategory] = useState('')
  const [feedbackComment, setFeedbackComment] = useState('')
  const [originalGeneratedContent, setOriginalGeneratedContent] = useState<Record<string, string>>({})
  const [currentContent, setCurrentContent] = useState<Record<string, string>>({})
  const [suggestedUpdate, setSuggestedUpdate] = useState<Record<string, string>>({})
  const [sectionEditMode, setSectionEditMode] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

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

  // Initialize original/current section content when run first loads (completed); do not overwrite on rerun
  useEffect(() => {
    if (!runId || !run || run.status !== 'completed') return
    setOriginalGeneratedContent((prev) => {
      const next = { ...prev }
      let changed = false
      run.sections.forEach((s) => {
        const k = `${runId}|${s.section_id}`
        if (!(k in next)) {
          next[k] = s.content
          changed = true
        }
      })
      return changed ? next : prev
    })
    setCurrentContent((prev) => {
      const next = { ...prev }
      let changed = false
      run.sections.forEach((s) => {
        const k = `${runId}|${s.section_id}`
        if (!(k in next)) {
          next[k] = s.content
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [runId, run])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setRun(null)
    setSubmitting(true)
    const useTopicJurisdictionContext =
      templateId === 'implementation_guidance' || templateId === 'workflow_pattern'
    const jurisdictionValue =
      subArea ? `${areaOfLaw} – ${subArea}` : areaOfLaw
    const structured_input: Record<string, string> = useTopicJurisdictionContext
      ? { topic, jurisdiction: jurisdictionValue, context: context || '' }
      : { client_name: clientName, jurisdiction: jurisdictionValue }
    createRun({
      template_id: templateId,
      structured_input,
    })
      .then(({ run_id }) => {
        setRunId(run_id)
        refreshRunHistory()
        setToast({ message: 'Document generation started.', type: 'success' })
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Failed to start run'
        setError(msg)
        setToast({ message: msg, type: 'error' })
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
    setSectionEditMode(null)
  }

  const handleRerunSection = (sectionId: string) => {
    if (!runId) return
    setRerunningSectionId(sectionId)
    setError(null)
    rerunSection(runId, sectionId)
      .then(() => {
        const poll = () => {
          getRun(runId!).then((data) => {
            setRun(data)
            if (data.status === 'running' || data.status === 'pending') {
              setTimeout(poll, POLL_INTERVAL_MS)
            } else {
              if (data.status === 'completed') {
                const section = data.sections.find((sec) => sec.section_id === sectionId)
                if (section) {
                  const key = `${runId}|${sectionId}`
                  setSuggestedUpdate((prev) => ({ ...prev, [key]: section.content }))
                }
              }
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
        const msg = e instanceof Error ? e.message : 'Rerun failed'
        setError(msg)
        setToast({ message: msg, type: 'error' })
        setRerunningSectionId(null)
      })
  }

  const templateName = (id: string) => templates.find((t) => t.id === id)?.name ?? id

  const promptCacheKey = (sectionId: string) => (runId ? `${runId}|${sectionId}` : '')
  const togglePrompt = (sectionId: string) => {
    const key = promptCacheKey(sectionId)
    if (expandedPromptSectionId === sectionId) {
      setExpandedPromptSectionId(null)
      return
    }
    setExpandedPromptSectionId(sectionId)
    setPromptErrorBySection((prev) => ({ ...prev, [key]: '' }))
    if (key && promptCache[key]) return
    if (!runId) return
    setPromptLoadingSectionId(sectionId)
    getSectionPrompt(runId, sectionId)
      .then(({ prompt_text }) => {
        setPromptCache((prev) => (key ? { ...prev, [key]: prompt_text } : prev))
        setPromptLoadingSectionId(null)
      })
      .catch((e) => {
        setPromptErrorBySection((prev) => ({ ...prev, [key]: e instanceof Error ? e.message : 'Could not load prompt' }))
        setPromptLoadingSectionId(null)
      })
  }

  const submitSectionFeedback = (sectionId: string) => {
    if (!runId || !feedbackCategory.trim()) return
    const key = `${runId}|${sectionId}`
    setSectionFeedback((prev) => ({
      ...prev,
      [key]: {
        category: feedbackCategory.trim(),
        comment: feedbackComment.trim() || undefined,
        submittedAt: new Date().toISOString(),
      },
    }))
    setFeedbackCategory('')
    setFeedbackComment('')
    setExpandedFeedbackSectionId(null)
  }

  const sectionContentKey = (sectionId: string) => (runId ? `${runId}|${sectionId}` : '')
  const displayContent = (sectionId: string, fallback: string) =>
    currentContent[sectionContentKey(sectionId)] ?? fallback
  const hasSuggested = (sectionId: string) => sectionContentKey(sectionId) in suggestedUpdate
  const suggestedContent = (sectionId: string) => suggestedUpdate[sectionContentKey(sectionId)] ?? ''
  const isEdited = (sectionId: string) => {
    const k = sectionContentKey(sectionId)
    const orig = originalGeneratedContent[k]
    const cur = currentContent[k]
    return orig !== undefined && cur !== undefined && orig !== cur
  }

  const handleStartEdit = (sectionId: string) => {
    const k = sectionContentKey(sectionId)
    setEditingContent(currentContent[k] ?? '')
    setSectionEditMode(sectionId)
  }
  const handleSaveEdit = (sectionId: string) => {
    const k = sectionContentKey(sectionId)
    setCurrentContent((prev) => ({ ...prev, [k]: editingContent }))
    setSectionEditMode(null)
    setEditingContent('')
  }
  const handleCancelEdit = () => {
    setSectionEditMode(null)
    setEditingContent('')
  }
  const handleResetToGenerated = (sectionId: string) => {
    const k = sectionContentKey(sectionId)
    const orig = originalGeneratedContent[k]
    if (orig !== undefined) setCurrentContent((prev) => ({ ...prev, [k]: orig }))
  }
  const handleAcceptSuggested = (sectionId: string) => {
    const k = sectionContentKey(sectionId)
    const sug = suggestedUpdate[k]
    if (sug !== undefined) {
      setCurrentContent((prev) => ({ ...prev, [k]: sug }))
      setSuggestedUpdate((prev) => {
        const next = { ...prev }
        delete next[k]
        return next
      })
    }
  }
  const handleKeepCurrentVersion = (sectionId: string) => {
    const k = sectionContentKey(sectionId)
    setSuggestedUpdate((prev) => {
      const next = { ...prev }
      delete next[k]
      return next
    })
  }

  const docPreviewState = !runId
    ? 'none'
    : !run
      ? 'generating'
      : run.status === 'running' || run.status === 'pending'
        ? 'generating'
        : run.status === 'failed'
          ? 'failed'
          : run.status === 'completed' && run.assembled
            ? 'completed'
            : 'completed'

  return (
    <div className="app-root">
      {/* Left: run history only */}
      <aside className="app-sidebar-left">
        <h2 className="run-history-title">Run history</h2>
        {runs.length === 0 ? (
          <p className="run-history-empty">No runs yet. Generate a document to get started.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {runs.map((r) => (
              <li key={r.run_id}>
                <button
                  type="button"
                  className={`run-card ${runId === r.run_id ? 'is-selected' : ''}`}
                  onClick={() => handleOpenRun(r.run_id)}
                >
                  <span className="run-card-name">{templateName(r.template_id)}</span>
                  <span className="run-card-meta">{formatDate(r.updated_at)}</span>
                  {runId === r.run_id && run && (
                    <span className={`run-card-status ${run.status}`}>{run.status}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Main: form + document preview */}
      <main className="app-main">
        <h1>Document Generation Engine</h1>

        <form onSubmit={handleSubmit} className="form-card">
          <h2>New document</h2>
          <div className="form-group">
            <label htmlFor="template" className="form-label">Template</label>
            <select
              id="template"
              className="select"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={submitting || !!runId}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {templateId && (
            <>
              <div className="form-group">
                <label htmlFor="areaOfLaw" className="form-label">
                  Area of Law <span className="form-label-optional">(required)</span>
                </label>
                <select
                  id="areaOfLaw"
                  className="select"
                  value={areaOfLaw}
                  onChange={(e) => { setAreaOfLaw(e.target.value); setSubArea('') }}
                  disabled={submitting || !!runId}
                >
                  <option value="">— Select area of law —</option>
                  {AREA_OF_LAW.map(({ area }) => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
              </div>
              {areaOfLaw && (() => {
                const selected = AREA_OF_LAW.find((r) => r.area === areaOfLaw)
                const subs = selected?.subs ?? []
                if (subs.length === 0) return null
                return (
                  <div className="form-group">
                    <label htmlFor="subArea" className="form-label">
                      Jurisdiction <span className="form-label-optional">(optional)</span>
                    </label>
                    <select
                      id="subArea"
                      className="select"
                      value={subArea}
                      onChange={(e) => setSubArea(e.target.value)}
                      disabled={submitting || !!runId}
                    >
                      <option value="">— Select sub-area (optional) —</option>
                      {subs.map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                )
              })()}
            </>
          )}
          {(templateId === 'implementation_guidance' || templateId === 'workflow_pattern') ? (
            <>
              <div className="form-group">
                <label htmlFor="topic" className="form-label">
                  Topic <span className="form-label-optional">(required)</span>
                </label>
                <input
                  id="topic"
                  type="text"
                  className="input"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={submitting || !!runId}
                />
              </div>
              <div className="form-group">
                <label htmlFor="context" className="form-label">
                  Context <span className="form-label-optional">(optional)</span>
                </label>
                <textarea
                  id="context"
                  className="textarea"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  disabled={submitting || !!runId}
                  placeholder="Additional context for the guidance"
                  rows={3}
                />
              </div>
            </>
          ) : templateId ? (
            <>
              <div className="form-group">
                <label htmlFor="clientName" className="form-label">Client name</label>
                <input
                  id="clientName"
                  type="text"
                  className="input"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  disabled={submitting || !!runId}
                />
              </div>
            </>
          ) : null}
          <div className="form-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={
                submitting ||
                !templateId ||
                !areaOfLaw.trim() ||
                ((templateId === 'implementation_guidance' || templateId === 'workflow_pattern') && !topic.trim())
              }
            >
              {submitting && <span className="spinner" />}
              {submitting ? 'Generating…' : 'Generate'}
            </button>
            {runId && (
              <button type="button" className="btn-secondary" onClick={reset}>
                New run
              </button>
            )}
          </div>
        </form>

        {error && <p style={{ color: 'var(--danger)', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }} role="alert">{error}</p>}

        <section className="doc-preview">
          <h2 className="doc-preview-title">Document preview</h2>
          {docPreviewState === 'none' && (
            <div className="doc-preview-empty">
              Select a run from the sidebar or generate a document to see the preview.
            </div>
          )}
          {docPreviewState === 'generating' && (
            <div className="doc-preview-generating">
              <span className="spinner" />
              <span>Generating…</span>
              {run?.progress_message && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{run.progress_message}</span>}
            </div>
          )}
          {docPreviewState === 'failed' && run?.error && (
            <div className="doc-preview-failed" role="alert">
              {run.error}
            </div>
          )}
          {docPreviewState === 'completed' && (
            run?.assembled
              ? <div className="doc-preview-body">{run.assembled.content}</div>
              : <div className="doc-preview-empty">No assembled document.</div>
          )}
        </section>
      </main>

      {/* Right: run metadata (always visible for balanced layout) */}
      <aside className={`app-sidebar-right ${runId && run ? '' : 'is-empty'}`}>
        {runId && run ? (
          <>
            <h2 className="panel-title">Run details</h2>
            <div className="run-status-line">
              <span className={`run-status-dot ${run.status}`} />
              <span>{run.status}</span>
            </div>
            {(run.status === 'running' || run.status === 'pending') && run.progress_message && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{run.progress_message}</p>
            )}
            {run.error && <div className="run-error-alert" role="alert">{run.error}</div>}
            {run.status === 'completed' && (
              <>
                <h3 className="panel-title" style={{ marginTop: 'var(--space-2)' }}>Sections</h3>
                {run.sections.length === 0 ? (
                  <p className="run-history-empty">No sections.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {run.sections.map((s) => {
                      const pKey = promptCacheKey(s.section_id)
                      const fKey = runId ? `${runId}|${s.section_id}` : ''
                      const feedback = fKey ? sectionFeedback[fKey] : undefined
                      const showPrompt = expandedPromptSectionId === s.section_id
                      const showFeedbackForm = expandedFeedbackSectionId === s.section_id
                      const isEditing = sectionEditMode === s.section_id
                      const content = displayContent(s.section_id, s.content)
                      const hasSuggestion = hasSuggested(s.section_id)
                      return (
                        <li key={s.section_id} className="section-item">
                          <div className="section-item-header">
                            <strong style={{ flex: 1, minWidth: 0 }}>{s.section_id}</strong>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => handleRerunSection(s.section_id)}
                              disabled={rerunningSectionId !== null}
                            >
                              {rerunningSectionId === s.section_id ? 'Rerunning…' : 'Rerun'}
                            </button>
                          </div>
                          <div className="section-item-actions">
                            <button
                              type="button"
                              className="section-prompt-toggle"
                              onClick={() => togglePrompt(s.section_id)}
                            >
                              {showPrompt ? 'Hide prompt' : 'View prompt'}
                            </button>
                            {!isEditing && (
                              <>
                                <button
                                  type="button"
                                  className="section-version-action"
                                  onClick={() => handleStartEdit(s.section_id)}
                                >
                                  Edit
                                </button>
                                {isEdited(s.section_id) && (
                                  <button
                                    type="button"
                                    className="section-version-action"
                                    onClick={() => handleResetToGenerated(s.section_id)}
                                  >
                                    Reset to generated
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          {showPrompt && (
                            <div className="section-prompt-wrap">
                              {promptLoadingSectionId === s.section_id && (
                                <div className="section-prompt-loading">Loading prompt…</div>
                              )}
                              {promptErrorBySection[pKey] && (
                                <div className="section-prompt-error">{promptErrorBySection[pKey]}</div>
                              )}
                              {!promptLoadingSectionId && promptCache[pKey] && (
                                <pre className="section-prompt">{promptCache[pKey]}</pre>
                              )}
                            </div>
                          )}
                          {isEditing ? (
                            <div className="section-version-edit">
                              <textarea
                                className="textarea section-version-textarea"
                                value={editingContent}
                                onChange={(e) => setEditingContent(e.target.value)}
                                rows={6}
                              />
                              <div className="section-version-edit-actions">
                                <button
                                  type="button"
                                  className="btn-primary btn-sm"
                                  onClick={() => handleSaveEdit(s.section_id)}
                                >
                                  Save
                                </button>
                                <button type="button" className="btn-secondary btn-sm" onClick={handleCancelEdit}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <pre className="section-item-content">{content}</pre>
                          )}
                          {hasSuggestion && (
                            <div className="section-suggested-update">
                              <div className="section-suggested-title">Suggested update</div>
                              <p className="section-suggested-hint">Compare changes below. Accept to use the new version or keep your current version.</p>
                              <pre className="section-item-content section-suggested-content">{suggestedContent(s.section_id)}</pre>
                              <div className="section-suggested-actions">
                                <button
                                  type="button"
                                  className="btn-primary btn-sm"
                                  onClick={() => handleAcceptSuggested(s.section_id)}
                                >
                                  Accept changes
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => handleKeepCurrentVersion(s.section_id)}
                                >
                                  Keep current version
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="section-feedback">
                            {feedback ? (
                              <div className="section-feedback-recorded">
                                <span>Feedback recorded: {feedback.category}</span>
                                <button
                                  type="button"
                                  className="section-feedback-change"
                                  onClick={() => {
                                    setExpandedFeedbackSectionId(s.section_id)
                                    setFeedbackCategory(feedback.category)
                                    setFeedbackComment(feedback.comment ?? '')
                                  }}
                                >
                                  Change
                                </button>
                              </div>
                            ) : showFeedbackForm ? (
                              <div className="section-feedback-form">
                                <label htmlFor={`feedback-category-${s.section_id}`} className="form-label">Reason</label>
                                <select
                                  id={`feedback-category-${s.section_id}`}
                                  className="select"
                                  value={feedbackCategory}
                                  onChange={(e) => setFeedbackCategory(e.target.value)}
                                >
                                  <option value="">— Select reason —</option>
                                  {SECTION_FEEDBACK_CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                                <label htmlFor={`feedback-comment-${s.section_id}`} className="form-label form-label-optional">Comment (optional)</label>
                                <textarea
                                  id={`feedback-comment-${s.section_id}`}
                                  className="textarea"
                                  rows={2}
                                  placeholder="Add a comment (optional)"
                                  value={feedbackComment}
                                  onChange={(e) => setFeedbackComment(e.target.value)}
                                />
                                <div className="section-feedback-form-actions">
                                  <button
                                    type="button"
                                    className="btn-primary btn-sm"
                                    onClick={() => submitSectionFeedback(s.section_id)}
                                    disabled={!feedbackCategory.trim()}
                                  >
                                    Submit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary btn-sm"
                                    onClick={() => {
                                      setExpandedFeedbackSectionId(null)
                                      setFeedbackCategory('')
                                      setFeedbackComment('')
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="section-feedback-toggle"
                                onClick={() => {
                                  setExpandedFeedbackSectionId(s.section_id)
                                  setFeedbackCategory('')
                                  setFeedbackComment('')
                                }}
                              >
                                Feedback
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {versions.length > 0 && (
                  <>
                    <h3 className="panel-title" style={{ marginTop: 'var(--space-2)' }}>Versions</h3>
                    <ul className="versions-list">
                      {versions.map((v, i) => (
                        <li key={i}>{formatDate(v.updated_at)} — {v.section_count} sections</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <p className="panel-empty-state">Select a run from the sidebar or generate a document to view run details here.</p>
        )}
      </aside>

      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`} role="status">
            <span>{toast.message}</span>
            <button type="button" className="toast-dismiss" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
