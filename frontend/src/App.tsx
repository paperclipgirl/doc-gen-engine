/**
 * Section F+G: Generation form, template select, run status, section outputs, assembled doc;
 * Section G: rerun section, run history, open run, version history.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createRun,
  getRun,
  getRunFeedback,
  getRunVersions,
  getSectionPrompt,
  listRuns,
  listTemplates,
  rerunSection,
  submitSectionFeedbackToApi,
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

/** North America component menu: grouped by domain for the Component form field. */
const COMPONENT_GROUPS: { domain: string; components: string[] }[] = [
  {
    domain: 'Procedural',
    components: [
      'Procedural Step Framework',
      'Proceedings / Hearing Container',
      'Court Filing Workflow Pattern',
      'Service of Process Management',
      'Hearings Management',
      'Witness Management',
      'Evidence & Bundling Overlay',
      'Limitation & Deadline Tracker',
      'Enforcement / Recovery Workflow',
      'Settlement Negotiation Workflow',
      'Mediation / ADR',
      'Case Strategy Planning',
      'Procedural Timeline View',
      'Document Submission Tracker',
      'Investigation Management',
      'Interview Management',
      'Regulatory Response Management',
    ],
  },
  {
    domain: 'Governance',
    components: [
      'Security / Case Lockdown Pattern',
      'Conflict & Compliance Review Module',
      'AML / Identity Verification Module',
      'Commercial Approval Pattern',
      'Delegated Authority Pattern',
      'Supervisory Review Pattern',
      'Hold / Suspension Pattern',
      'Complaints Handling',
      'Matter Closure Governance',
      'Budget / Reserve',
      'Costs Tracking',
      'Financial Exposure Aggregator',
      'Billing Milestone Tracker',
      'Settlement / Damages Calculator',
      'Renewal & Deadline Management',
      'Post-Completion Obligations Tracker',
      'Filing Deadline Compliance',
    ],
  },
  {
    domain: 'Foundation',
    components: [
      'Instruction Intake Framework',
      'Matter Lifecycle Framework',
      'Task Governance Pattern',
      'Participant Role Framework',
      'Key Date Engine',
      'Document Governance Framework',
      'Portal Framework',
      'Data Capture Framework',
      'Workflow Automation Framework',
      'Reporting & KPI Overlay',
      'Party and Counterparty Container',
      'Client Reporting Framework',
      'Collaboration Workspace',
      'Document Expectation & Chase Engine',
      'Integration Connector Framework',
      'Notification & Escalation Engine',
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
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [solutionType, setSolutionType] = useState<'reusable_accelerator' | 'client_practice_solution'>('reusable_accelerator')
  const [advancedConfigOpen, setAdvancedConfigOpen] = useState(false)
  const [templateId, setTemplateId] = useState<string>('')
  const [component, setComponent] = useState<string>('')
  const [componentPickerOpen, setComponentPickerOpen] = useState(false)
  const [componentSearchQuery, setComponentSearchQuery] = useState('')
  const componentPickerContainerRef = useRef<HTMLDivElement>(null)
  const [clientName, setClientName] = useState('')
  const [topic, setTopic] = useState('')
  const [areaOfLaw, setAreaOfLaw] = useState('')
  const [subArea, setSubArea] = useState('')
  const [areaLawPickerOpen, setAreaLawPickerOpen] = useState(false)
  const [areaLawSearchQuery, setAreaLawSearchQuery] = useState('')
  const areaLawPickerContainerRef = useRef<HTMLDivElement>(null)
  const [context, setContext] = useState('')
  const [scopeBoundary, setScopeBoundary] = useState('')
  const [matterWorkTypeKnown, setMatterWorkTypeKnown] = useState('')
  const [assumptionsDependencies, setAssumptionsDependencies] = useState('')
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
  const [formExpanded, setFormExpanded] = useState(true)
  const [generationMode, setGenerationMode] = useState<'mock' | 'quick' | 'production'>('quick')
  const previewEditableRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Load templates once on mount (GET /api/templates)
  useEffect(() => {
    let cancelled = false
    console.log('[templates] load start')
    setTemplatesLoading(true)
    setTemplatesError(null)
    listTemplates()
      .then((list) => {
        if (cancelled) return
        const arr = Array.isArray(list) ? list : []
        console.log('[templates] load resolved', arr.length, 'templates')
        setTemplates(arr)
        setTemplatesLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'Failed to load templates'
        console.error('[templates] load error', e)
        setTemplatesError(msg)
        setError(msg)
        setTemplatesLoading(false)
      })
    return () => { cancelled = true }
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

  // Load persisted section feedback when run is loaded
  useEffect(() => {
    if (!runId || !run) return
    getRunFeedback(runId)
      .then((feedback) => {
        const next: Record<string, { category: string; comment?: string; submittedAt: string }> = {}
        Object.entries(feedback).forEach(([sectionId, entry]) => {
          next[`${runId}|${sectionId}`] = {
            category: entry.category,
            comment: entry.comment,
            submittedAt: entry.submitted_at,
          }
        })
        setSectionFeedback((prev) => ({ ...prev, ...next }))
      })
      .catch(() => {})
  }, [runId, run])

  // Auto-collapse form only after successful generation (not while loading)
  useEffect(() => {
    if (run?.status === 'completed') setFormExpanded(false)
  }, [run?.status])

  // Close component picker when clicking outside
  useEffect(() => {
    if (!componentPickerOpen) return
    const handle = (e: MouseEvent) => {
      const el = componentPickerContainerRef.current
      if (el && !el.contains(e.target as Node)) setComponentPickerOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [componentPickerOpen])

  // Close area of law picker when clicking outside
  useEffect(() => {
    if (!areaLawPickerOpen) return
    const handle = (e: MouseEvent) => {
      const el = areaLawPickerContainerRef.current
      if (el && !el.contains(e.target as Node)) setAreaLawPickerOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [areaLawPickerOpen])

  const selectedAreaForJurisdiction = AREA_OF_LAW.find((x) => x.area === areaOfLaw)
  const hldJurisdictionRequired = templateId === 'hld' && (selectedAreaForJurisdiction?.subs?.length ?? 0) > 0
  const hldJurisdictionMissing = hldJurisdictionRequired && !subArea.trim()

  useEffect(() => {
    if (templateId === 'hld' && hldJurisdictionRequired) setAdvancedConfigOpen(true)
  }, [templateId, hldJurisdictionRequired])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setRun(null)
    if (hldJurisdictionMissing) {
      setError('Jurisdiction is required for High-Level Design when the practice area has sub-areas.')
      return
    }
    setSubmitting(true)
    const useTopicJurisdictionContext =
      templateId === 'implementation_guidance' || templateId === 'workflow_pattern' || templateId === 'hld'
    const jurisdictionValue =
      subArea ? `${areaOfLaw} – ${subArea}` : areaOfLaw
    const structured_input: Record<string, string> = useTopicJurisdictionContext
      ? { topic, jurisdiction: jurisdictionValue, context: context || '' }
      : { client_name: clientName, jurisdiction: jurisdictionValue }
    if (component.trim()) structured_input.component = component.trim()
    if (templateId === 'hld') {
      structured_input.scope_boundary = scopeBoundary.trim()
      structured_input.matter_work_type_known = matterWorkTypeKnown.trim()
      structured_input.assumptions_dependencies = assumptionsDependencies.trim()
    }
    createRun({
      template_id: templateId,
      structured_input,
      generation_mode: generationMode,
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
    setFormExpanded(true)
    refreshRunHistory()
  }

  const clearForm = () => {
    setSolutionType('reusable_accelerator')
    setAdvancedConfigOpen(false)
    setTemplateId(templates[0]?.id ?? '')
    setComponent('')
    setAreaOfLaw('')
    setSubArea('')
    setTopic('')
    setContext('')
    setScopeBoundary('')
    setMatterWorkTypeKnown('')
    setAssumptionsDependencies('')
    setClientName('')
    setGenerationMode('quick')
    setError(null)
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
    const category = feedbackCategory.trim()
    const comment = feedbackComment.trim() || ''
    const key = `${runId}|${sectionId}`
    submitSectionFeedbackToApi(runId, sectionId, category, comment)
      .then(() => {
        setSectionFeedback((prev) => ({
          ...prev,
          [key]: {
            category,
            comment: comment || undefined,
            submittedAt: new Date().toISOString(),
          },
        }))
        setFeedbackCategory('')
        setFeedbackComment('')
        setExpandedFeedbackSectionId(null)
      })
      .catch((e) => {
        setToast({ message: e instanceof Error ? e.message : 'Failed to save feedback', type: 'error' })
      })
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

  const showCollapsedRunSummary = !!(runId && run && run.status === 'completed' && !formExpanded)
  const isReviewMode = showCollapsedRunSummary

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

  const getSectionContentForPreview = (sectionId: string) =>
    currentContent[sectionContentKey(sectionId)] ??
    run?.sections?.find((s) => s.section_id === sectionId)?.content ??
    ''

  /** Full document text for copy-to-clipboard (sections joined with --- separator, or assembled content). */
  const getDocumentPreviewFullText = (): string | null => {
    if (docPreviewState !== 'completed' || !run) return null
    if (run.section_ids && run.section_ids.length > 0) {
      return run.section_ids
        .map((id) => getSectionContentForPreview(id).trim())
        .join('\n\n---\n\n')
    }
    if (run.assembled?.content) return run.assembled.content
    return null
  }

  const handleCopyDocumentToClipboard = () => {
    const text = getDocumentPreviewFullText()
    if (text == null) return
    navigator.clipboard.writeText(text).then(
      () => setToast({ message: 'Copied to clipboard.', type: 'success' }),
      () => setToast({ message: 'Copy failed.', type: 'error' })
    )
  }

  const updateSectionContentFromPreview = (sectionId: string, value: string) => {
    const k = sectionContentKey(sectionId)
    setCurrentContent((prev) => ({ ...prev, [k]: value }))
  }

  const resizePreviewSectionTextareas = useCallback(() => {
    previewEditableRef.current?.querySelectorAll<HTMLTextAreaElement>('.doc-preview-section-input').forEach((ta) => {
      ta.style.height = 'auto'
      ta.style.height = `${ta.scrollHeight}px`
    })
  }, [])

  useEffect(() => {
    if (!runId || !run?.section_ids?.length) return
    const timer = setTimeout(resizePreviewSectionTextareas, 0)
    return () => clearTimeout(timer)
  }, [runId, run?.section_ids, currentContent, resizePreviewSectionTextareas])

  // Single-selection: deduplicate by run_id so only one row can ever match runId (avoids multiple highlighted rows)
  const runsDisplay = useMemo(() => {
    const seen = new Set<string>()
    return runs.filter((r) => {
      const id = String(r.run_id)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  }, [runs])

  return (
    <div className="app-root">
      {/* Left: run history only */}
      <aside className="app-sidebar-left">
        <h2 className="run-history-title">Run history</h2>
        {runsDisplay.length === 0 ? (
          <p className="run-history-empty">No runs yet. Generate a document to get started.</p>
        ) : (
          <ul className="run-history-list">
            {runsDisplay.map((r) => {
              const isActive = runId != null && String(runId) === String(r.run_id)
              return (
                <li key={r.run_id} className="run-history-item">
                  <button
                    type="button"
                    className={`run-item ${isActive ? 'is-selected' : ''}`}
                    onClick={() => handleOpenRun(r.run_id)}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <span className="run-item-title">{templateName(r.template_id)}</span>
                    <span className="run-item-meta">
                      <span className="run-item-date">{formatDate(r.updated_at)}</span>
                      {isActive && run && (
                        <span className={`run-item-status run-item-status--${run.status}`}>{run.status}</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>

      {/* Main: form or run summary + document preview */}
      <main className={`app-main ${isReviewMode ? 'app-main--review-mode' : ''}`}>
        <h1>Clio Operate Solution Factory</h1>

        {!showCollapsedRunSummary && (
          <div className="form-tabs" role="tablist" aria-label="Solution type">
            <button
              type="button"
              role="tab"
              aria-selected={solutionType === 'reusable_accelerator'}
              className={`form-tab ${solutionType === 'reusable_accelerator' ? 'form-tab--active' : ''}`}
              onClick={() => {
                setSolutionType('reusable_accelerator')
              }}
            >
              Accelerator
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={solutionType === 'client_practice_solution'}
              className={`form-tab ${solutionType === 'client_practice_solution' ? 'form-tab--active' : ''}`}
              onClick={() => {
                setSolutionType('client_practice_solution')
                setComponent('')
              }}
            >
              Client Solution
            </button>
          </div>
        )}

        {showCollapsedRunSummary && run ? (
          <div className="run-context-panel">
            <div className="run-context-panel-body">
              <div className="run-context-row run-context-row--template">
                <span className="run-context-label">Output type</span>
                <span className="run-context-value">{templateName(run.template_id)}</span>
              </div>
              {run.structured_input && typeof run.structured_input === 'object' && Object.keys(run.structured_input).length > 0 && (
                <div className="run-context-fields">
                  {Object.entries(run.structured_input).map(([key, val]) => {
                    if (val == null || String(val).trim() === '') return null
                    const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                    return (
                      <div key={key} className="run-context-row">
                        <span className="run-context-label">{label}</span>
                        <span className="run-context-value">{String(val)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="run-context-panel-actions">
              <button type="button" className="run-context-action run-context-action--primary" onClick={() => setFormExpanded(true)}>
                Edit inputs
              </button>
              <button type="button" className="run-context-action run-context-action--secondary" onClick={reset}>
                New run
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form-card">
            <h2 className="form-section-label">Solution Definition</h2>

            <div className="form-group">
              <label htmlFor="topic" className="form-label">What solution are you building?</label>
              <input
                id="topic"
                type="text"
                className="input input--large"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={submitting || !!runId}
                placeholder="e.g. Mortgage enforcement workflow for a regional law firm; Corporate transaction management system; Litigation case intake automation"
              />
            </div>

            <div className="form-group form-group--tight" ref={areaLawPickerContainerRef}>
              <label htmlFor="area-law-picker" className="form-label">Practice Area</label>
              <div className="component-picker">
                <button
                  id="area-law-picker"
                  type="button"
                  className="component-picker-trigger"
                  onClick={() => !(submitting || !!runId) && setAreaLawPickerOpen((o) => !o)}
                  disabled={submitting || !!runId}
                  aria-haspopup="listbox"
                  aria-expanded={areaLawPickerOpen}
                  aria-label={areaOfLaw ? (subArea ? `${areaOfLaw} – ${subArea}` : areaOfLaw) : 'Select all'}
                >
                  <span className="component-picker-trigger-text">
                    {areaOfLaw ? (subArea ? `${areaOfLaw} – ${subArea}` : areaOfLaw) : 'Select all'}
                  </span>
                  <span className="component-picker-trigger-icon" aria-hidden>▾</span>
                </button>
                {areaLawPickerOpen && (
                  <div
                    className="component-picker-popover"
                    role="listbox"
                    aria-label="Practice area list"
                  >
                    <div className="component-picker-search-wrap">
                      <input
                        type="text"
                        className="component-picker-search"
                        placeholder="Search practice area…"
                        value={areaLawSearchQuery}
                        onChange={(e) => setAreaLawSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setAreaLawPickerOpen(false)
                            e.preventDefault()
                          }
                        }}
                        autoFocus
                      />
                    </div>
                    <div className="component-picker-list">
                      <div className="component-picker-group">
                        <ul className="component-picker-items" role="group" aria-label="Quick select">
                          <li role="option" aria-selected={!areaOfLaw && !subArea}>
                            <button
                              type="button"
                              className={`component-picker-item ${!areaOfLaw && !subArea ? 'is-selected' : ''}`}
                              onClick={() => {
                                setAreaOfLaw('')
                                setSubArea('')
                                setAreaLawPickerOpen(false)
                                setAreaLawSearchQuery('')
                              }}
                            >
                              Select all
                            </button>
                          </li>
                        </ul>
                      </div>
                      {AREA_OF_LAW.map(({ area, subs }) => {
                        const q = areaLawSearchQuery.trim().toLowerCase()
                        const areaMatches = !q || area.toLowerCase().includes(q)
                        const matchingSubs = !q ? subs : subs.filter((sub) => sub.toLowerCase().includes(q))
                        const hasAreaItem = subs.length === 0 ? areaMatches : areaMatches
                        const hasSubItems = matchingSubs.length > 0
                        if (!hasAreaItem && !hasSubItems) return null
                        return (
                          <div key={area} className="component-picker-group">
                            <div className="component-picker-group-label">{area}</div>
                            <ul className="component-picker-items" role="group" aria-label={area}>
                              {subs.length === 0 ? (
                                <li role="option" aria-selected={areaOfLaw === area && !subArea}>
                                  <button
                                    type="button"
                                    className={`component-picker-item ${areaOfLaw === area && !subArea ? 'is-selected' : ''}`}
                                    onClick={() => {
                                      setAreaOfLaw(area)
                                      setSubArea('')
                                      setAreaLawPickerOpen(false)
                                      setAreaLawSearchQuery('')
                                    }}
                                  >
                                    {q && areaMatches ? (() => {
                                      const matchStart = area.toLowerCase().indexOf(q)
                                      return matchStart >= 0 ? (
                                        <>
                                          {area.slice(0, matchStart)}
                                          <mark className="component-picker-match">{area.slice(matchStart, matchStart + q.length)}</mark>
                                          {area.slice(matchStart + q.length)}
                                        </>
                                      ) : area
                                    })() : area}
                                  </button>
                                </li>
                              ) : (
                                <>
                                  {areaMatches && (
                                    <li role="option" aria-selected={areaOfLaw === area && !subArea}>
                                      <button
                                        type="button"
                                        className={`component-picker-item ${areaOfLaw === area && !subArea ? 'is-selected' : ''}`}
                                        onClick={() => {
                                          setAreaOfLaw(area)
                                          setSubArea('')
                                          setAreaLawPickerOpen(false)
                                          setAreaLawSearchQuery('')
                                        }}
                                      >
                                        {area}
                                      </button>
                                    </li>
                                  )}
                                  {matchingSubs.map((sub) => {
                                    const isSelected = areaOfLaw === area && subArea === sub
                                    return (
                                      <li key={sub} role="option" aria-selected={isSelected}>
                                        <button
                                          type="button"
                                          className={`component-picker-item ${isSelected ? 'is-selected' : ''}`}
                                          onClick={() => {
                                            setAreaOfLaw(area)
                                            setSubArea(sub)
                                            setAreaLawPickerOpen(false)
                                            setAreaLawSearchQuery('')
                                          }}
                                        >
                                          {q ? (() => {
                                            const matchStart = sub.toLowerCase().indexOf(q)
                                            return matchStart >= 0 ? (
                                              <>
                                                {sub.slice(0, matchStart)}
                                                <mark className="component-picker-match">{sub.slice(matchStart, matchStart + q.length)}</mark>
                                                {sub.slice(matchStart + q.length)}
                                              </>
                                            ) : sub
                                          })() : sub}
                                        </button>
                                      </li>
                                    )
                                  })}
                                </>
                              )}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="form-group" role="radiogroup" aria-label="Output type">
              <span className="form-label form-label--block">Output Type</span>
              <div className="form-radios">
                {templatesLoading ? (
                  <p className="form-helper form-helper--standalone form-helper--diagnostic" role="status">
                    Loading output types…
                  </p>
                ) : templatesError ? (
                  <p className="form-helper form-helper--standalone form-helper--error" role="alert">
                    Failed to load output types: {templatesError}
                  </p>
                ) : templates.length > 0 ? (
                  templates.map((t) => (
                    <label key={t.id} className="form-radio-label">
                      <input
                        type="radio"
                        name="outputType"
                        className="form-radio"
                        value={t.id}
                        checked={templateId === t.id}
                        onChange={() => setTemplateId(t.id)}
                        disabled={submitting || !!runId}
                      />
                      <span className="form-radio-text">{t.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="form-helper form-helper--standalone" role="status">
                    No output types available. Check template configuration.
                  </p>
                )}
              </div>
            </div>

            <div className="form-advanced-section">
              <button
                type="button"
                className="form-advanced-toggle"
                onClick={() => setAdvancedConfigOpen((o) => !o)}
                aria-expanded={advancedConfigOpen}
              >
                <span className="form-advanced-toggle-icon" aria-hidden>{advancedConfigOpen ? '▼' : '▶'}</span>
                Advanced Configuration
              </button>
              {advancedConfigOpen && (
                <div className="form-advanced-fields">
                  {solutionType === 'reusable_accelerator' && (
                    <div className="form-group" ref={componentPickerContainerRef}>
                      <label htmlFor="component-picker" className="form-label">Component <span className="form-label-optional">(optional)</span></label>
                      <div className="component-picker">
                        <button
                          id="component-picker"
                          type="button"
                          className="component-picker-trigger"
                          onClick={() => !(submitting || !!runId) && setComponentPickerOpen((o) => !o)}
                          disabled={submitting || !!runId}
                          aria-haspopup="listbox"
                          aria-expanded={componentPickerOpen}
                          aria-label={component || 'Select component'}
                        >
                          <span className="component-picker-trigger-text">{component || 'Select component'}</span>
                          <span className="component-picker-trigger-icon" aria-hidden>▾</span>
                        </button>
                        {componentPickerOpen && (
                          <div
                            className="component-picker-popover"
                            role="listbox"
                            aria-label="Component list"
                          >
                            <div className="component-picker-search-wrap">
                              <input
                                type="text"
                                className="component-picker-search"
                                placeholder="Search components…"
                                value={componentSearchQuery}
                                onChange={(e) => setComponentSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    setComponentPickerOpen(false)
                                    e.preventDefault()
                                  }
                                }}
                                autoFocus
                              />
                            </div>
                            <div className="component-picker-list">
                              {COMPONENT_GROUPS.map((group) => {
                                const q = componentSearchQuery.trim().toLowerCase()
                                const filtered = q
                                  ? group.components.filter((name) => name.toLowerCase().includes(q))
                                  : group.components
                                if (filtered.length === 0) return null
                                return (
                                  <div key={group.domain} className="component-picker-group">
                                    <div className="component-picker-group-label">{group.domain}</div>
                                    <ul className="component-picker-items" role="group" aria-label={group.domain}>
                                      {filtered.map((name) => {
                                        const isSelected = component === name
                                        const matchStart = q ? name.toLowerCase().indexOf(q) : -1
                                        const label =
                                          matchStart >= 0 && q
                                            ? [
                                                name.slice(0, matchStart),
                                                name.slice(matchStart, matchStart + q.length),
                                                name.slice(matchStart + q.length),
                                              ]
                                            : [name]
                                        return (
                                          <li key={name} role="option" aria-selected={isSelected}>
                                            <button
                                              type="button"
                                              className={`component-picker-item ${isSelected ? 'is-selected' : ''}`}
                                              onClick={() => {
                                                setComponent(name)
                                                setComponentPickerOpen(false)
                                                setComponentSearchQuery('')
                                              }}
                                            >
                                              {label.length === 3 ? (
                                                <>
                                                  {label[0]}
                                                  <mark className="component-picker-match">{label[1]}</mark>
                                                  {label[2]}
                                                </>
                                              ) : (
                                                name
                                              )}
                                            </button>
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="context" className="form-label">Intended Business Area / Additional Context <span className="form-label-optional">(optional)</span></label>
                    <textarea
                      id="context"
                      className="textarea textarea--large"
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      disabled={submitting || !!runId}
                      placeholder={solutionType === 'client_practice_solution' ? 'e.g. Mid-sized firm, litigation focus; Cross-border regulatory work; Corporate transactions intake' : 'e.g. Client is a mid-sized law firm implementing Clio Operate for litigation matters; Workflow must support cross-border regulatory investigations'}
                      rows={3}
                    />
                  </div>
                  {templateId === 'hld' && (
                    <>
                      <div className="form-group">
                        <label htmlFor="scope-boundary" className="form-label">Expected Scope Boundary <span className="form-label-optional">(optional)</span></label>
                        <input
                          id="scope-boundary"
                          type="text"
                          className="input input--large"
                          value={scopeBoundary}
                          onChange={(e) => setScopeBoundary(e.target.value)}
                          disabled={submitting || !!runId}
                          placeholder="e.g. Instruction and Matter levels only; Single jurisdiction; Phase 1 intake and triage"
                        />
                      </div>
                      <div className="form-group form-group--tight">
                        <label htmlFor="matter-work-type-known" className="form-label">Matter / Work Type Hierarchy Known <span className="form-label-optional">(optional)</span></label>
                        <select
                          id="matter-work-type-known"
                          className="input"
                          value={matterWorkTypeKnown}
                          onChange={(e) => setMatterWorkTypeKnown(e.target.value)}
                          disabled={submitting || !!runId}
                        >
                          <option value="">Not indicated; please confirm</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                          <option value="Not yet">Not yet</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="assumptions-dependencies" className="form-label">Known Assumptions, Dependencies, or Open Questions <span className="form-label-optional">(optional)</span></label>
                        <textarea
                          id="assumptions-dependencies"
                          className="textarea textarea--large"
                          value={assumptionsDependencies}
                          onChange={(e) => setAssumptionsDependencies(e.target.value)}
                          disabled={submitting || !!runId}
                          placeholder="e.g. Relying on shared matter taxonomy; Pending sign-off on phase boundaries"
                          rows={2}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {templateId && templateId !== 'implementation_guidance' && templateId !== 'workflow_pattern' && templateId !== 'hld' && (
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
            )}
            <div className="form-group form-group--tight" style={{ marginBottom: 'var(--space-2)' }}>
              <span className="form-label form-label--block" style={{ marginBottom: 'var(--space-1)' }}>Generation mode</span>
              <div className="form-radios" role="radiogroup" aria-label="Generation mode">
                <label className="form-radio-label">
                  <input
                    type="radio"
                    name="generationMode"
                    className="form-radio"
                    value="mock"
                    checked={generationMode === 'mock'}
                    onChange={() => setGenerationMode('mock')}
                    disabled={submitting || !!runId}
                  />
                  <span className="form-radio-text">Mock draft</span>
                </label>
                <label className="form-radio-label">
                  <input
                    type="radio"
                    name="generationMode"
                    className="form-radio"
                    value="quick"
                    checked={generationMode === 'quick'}
                    onChange={() => setGenerationMode('quick')}
                    disabled={submitting || !!runId}
                  />
                  <span className="form-radio-text">Quick draft</span>
                </label>
                <label className="form-radio-label">
                  <input
                    type="radio"
                    name="generationMode"
                    className="form-radio"
                    value="production"
                    checked={generationMode === 'production'}
                    onChange={() => setGenerationMode('production')}
                    disabled={submitting || !!runId}
                  />
                  <span className="form-radio-text">Production run</span>
                </label>
              </div>
              {generationMode === 'mock' && (
                <p className="form-helper" style={{ marginTop: 'var(--space-1)', marginBottom: 0 }}>
                  No AI call. Uses placeholder output for testing flows.
                </p>
              )}
              {generationMode === 'quick' && (
                <p className="form-helper" style={{ marginTop: 'var(--space-1)', marginBottom: 0 }}>
                  Uses a lower-cost model for fast iteration.
                </p>
              )}
              {generationMode === 'production' && (
                <p className="form-helper" style={{ marginTop: 'var(--space-1)', marginBottom: 0 }}>
                  Uses a higher-quality model and knowledge retrieval.
                </p>
              )}
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  submitting ||
                  !!runId ||
                  !templateId ||
                  ((templateId === 'implementation_guidance' || templateId === 'workflow_pattern' || templateId === 'hld') && !topic.trim()) ||
                  hldJurisdictionMissing
                }
              >
                {submitting && <span className="spinner" />}
                {submitting ? 'Generating…' : 'Generate'}
              </button>
              <button type="button" className="btn-secondary" onClick={clearForm} disabled={submitting || !!runId}>
                Clear
              </button>
              {runId && (
                <button type="button" className="btn-secondary" onClick={reset}>
                  New run
                </button>
              )}
            </div>
          </form>
        )}

        {error && <p style={{ color: 'var(--danger)', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }} role="alert">{error}</p>}

        <section className="doc-preview">
          <div className="doc-preview-header">
            <h2 className="doc-preview-title">Document preview</h2>
            {getDocumentPreviewFullText() != null && (
              <button
                type="button"
                className="doc-preview-copy"
                onClick={handleCopyDocumentToClipboard}
                title="Copy full document to clipboard (retains formatting)"
              >
                Copy to clipboard
              </button>
            )}
          </div>
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
          {docPreviewState === 'completed' && run && (
            run.section_ids && run.section_ids.length > 0 ? (
              <div ref={previewEditableRef} className="doc-preview-body doc-preview-editable">
                {run.section_ids.map((sectionId, idx) => (
                  <div key={sectionId} className="doc-preview-section-block">
                    {idx > 0 && <div className="doc-preview-separator">---</div>}
                    <textarea
                      className="doc-preview-section-input"
                      value={getSectionContentForPreview(sectionId)}
                      onChange={(e) => {
                        const ta = e.target
                        updateSectionContentFromPreview(sectionId, ta.value)
                        ta.style.height = 'auto'
                        ta.style.height = `${ta.scrollHeight}px`
                      }}
                      aria-label={`Section: ${sectionId}`}
                    />
                  </div>
                ))}
              </div>
            ) : run.assembled ? (
              <div className="doc-preview-body">{run.assembled.content}</div>
            ) : (
              <div className="doc-preview-empty">No assembled document.</div>
            )
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
                            {!isEditing && isEdited(s.section_id) && (
                              <span className="section-edited-label">Edited</span>
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
                          <div className="section-output-wrap">
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
                            <div className="section-output-actions">
                              {!isEditing && isEdited(s.section_id) && (
                                <div className="section-reset-wrap">
                                  <button
                                    type="button"
                                    className="section-version-action"
                                    onClick={() => handleResetToGenerated(s.section_id)}
                                  >
                                    Reset to generated
                                  </button>
                                </div>
                              )}
                              <div className="section-icon-bar">
                                <button
                                  type="button"
                                  className={`section-icon-btn ${rerunningSectionId === s.section_id ? 'is-active' : ''}`}
                                  onClick={() => handleRerunSection(s.section_id)}
                                  disabled={rerunningSectionId !== null}
                                  data-tooltip={rerunningSectionId === s.section_id ? 'Rerunning…' : 'Rerun this section'}
                                  aria-label={rerunningSectionId === s.section_id ? 'Rerunning…' : 'Rerun this section'}
                                >
                                  {rerunningSectionId === s.section_id ? (
                                    <span className="spinner" style={{ width: 16, height: 16 }} aria-hidden />
                                  ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className={`section-icon-btn ${showPrompt ? 'is-active' : ''}`}
                                  onClick={() => togglePrompt(s.section_id)}
                                  data-tooltip={showPrompt ? 'Hide prompt' : 'View the prompt used to generate this section'}
                                  aria-label={showPrompt ? 'Hide prompt' : 'View the prompt used to generate this section'}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                                </button>
                                {!isEditing && (
                                  <button
                                    type="button"
                                    className="section-icon-btn"
                                    onClick={() => handleStartEdit(s.section_id)}
                                    data-tooltip="Edit this section's content inline"
                                    aria-label="Edit this section's content inline"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={`section-icon-btn ${showFeedbackForm || feedback ? 'is-active' : ''}`}
                                  onClick={() => {
                                    if (feedback) {
                                      setExpandedFeedbackSectionId(s.section_id)
                                      setFeedbackCategory(feedback.category)
                                      setFeedbackComment(feedback.comment ?? '')
                                    } else {
                                      setExpandedFeedbackSectionId(s.section_id)
                                      setFeedbackCategory('')
                                      setFeedbackComment('')
                                    }
                                  }}
                                  data-tooltip={feedback ? 'View or change your feedback for this section' : 'Give feedback on this section (e.g. accuracy, tone)'}
                                  aria-label={feedback ? 'View or change your feedback for this section' : 'Give feedback on this section'}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                </button>
                              </div>
                            </div>
                          </div>
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
                            ) : null}
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
