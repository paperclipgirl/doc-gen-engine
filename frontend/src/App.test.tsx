/**
 * Frontend tests for the Solution Definition form, especially the Output Type loading flow.
 * Protects the UI from regressions when template loading breaks or returns unexpected data.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as api from './api'
import App from './App'

vi.mock('./api', () => ({
  listTemplates: vi.fn(),
  listRuns: vi.fn(),
  getRun: vi.fn(),
  getRunVersions: vi.fn(),
  getRunFeedback: vi.fn(),
  createRun: vi.fn(),
  getSectionPrompt: vi.fn(),
  rerunSection: vi.fn(),
  submitSectionFeedbackToApi: vi.fn(),
  getTemplate: vi.fn(),
}))

const DEFAULT_TEMPLATES = [
  { id: 'implementation_guidance', name: 'Implementation Guidance', description: null, section_count: 13 },
  { id: 'workflow_pattern', name: 'Workflow Pattern', description: null, section_count: 5 },
  { id: 'hld', name: 'High-Level Design', description: null, section_count: 10 },
]

function renderApp() {
  return render(<App />)
}

/** Output Type section is rendered in both tab panels; scope to the first radiogroup to avoid "multiple elements". */
function getOutputTypeSection() {
  const groups = screen.getAllByRole('radiogroup', { name: 'Output type' })
  expect(groups.length).toBeGreaterThanOrEqual(1)
  return groups[0]
}

describe('Output Type loading flow', () => {
  beforeEach(() => {
    vi.mocked(api.listRuns).mockResolvedValue([])
    vi.mocked(api.getRunVersions).mockResolvedValue([])
    vi.mocked(api.getRunFeedback).mockResolvedValue({})
  })

  it('1. Loading state: Output Type section renders with "Loading output types…" and no radios', async () => {
    vi.mocked(api.listTemplates).mockImplementation(() => new Promise(() => {})) // never resolves
    renderApp()

    const section = getOutputTypeSection()
    expect(within(section).getByText('Output Type')).toBeInTheDocument()
    expect(within(section).getByText(/Loading output types…/)).toBeInTheDocument()
    expect(within(section).queryByRole('radio', { name: /Implementation Guidance/i })).not.toBeInTheDocument()
  })

  it('2. Success state: label and radio options render; expected names appear; selecting updates choice', async () => {
    vi.mocked(api.listTemplates).mockResolvedValue(DEFAULT_TEMPLATES)
    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Implementation Guidance' })).toBeInTheDocument()
    })
    expect(screen.getAllByText('Output Type').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('radio', { name: 'Workflow Pattern' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('radio', { name: 'High-Level Design' }).length).toBeGreaterThanOrEqual(1)

    // Both tab panels render the same radios; interact with the first "Workflow Pattern" radio
    const workflowRadios = screen.getAllByRole('radio', { name: 'Workflow Pattern' })
    await userEvent.click(workflowRadios[0])
    expect(workflowRadios[0]).toBeChecked()
  })

  it('3. Empty success state: section renders with "No output types available" message', async () => {
    vi.mocked(api.listTemplates).mockResolvedValue([])
    renderApp()

    await waitFor(() => {
      expect(screen.getByText(/No output types available\. Check template configuration\./)).toBeInTheDocument()
    })
    const section = getOutputTypeSection()
    expect(within(section).getByText('Output Type')).toBeInTheDocument()
    expect(within(section).queryByRole('radio')).not.toBeInTheDocument()
  })

  it('4. Error state: section renders with "Failed to load output types" and error text', async () => {
    vi.mocked(api.listTemplates).mockRejectedValue(new Error('Network error'))
    renderApp()

    await waitFor(() => {
      expect(screen.getByText(/Failed to load output types: Network error/)).toBeInTheDocument()
    })
    const section = getOutputTypeSection()
    expect(within(section).getByText('Output Type')).toBeInTheDocument()
    expect(within(section).queryByRole('radio')).not.toBeInTheDocument()
  })

  it('5. Malformed response: non-array templates fallback to empty state without crash', async () => {
    vi.mocked(api.listTemplates).mockResolvedValue(null as never) // API returns something that becomes []
    renderApp()

    await waitFor(() => {
      expect(screen.getByText(/No output types available\. Check template configuration\./)).toBeInTheDocument()
    })
    const section = getOutputTypeSection()
    expect(within(section).getByText('Output Type')).toBeInTheDocument()
    expect(within(section).queryByRole('radio')).not.toBeInTheDocument()
  })
})

describe('Output Type section always visible', () => {
  beforeEach(() => {
    vi.mocked(api.listRuns).mockResolvedValue([])
    vi.mocked(api.getRunVersions).mockResolvedValue([])
    vi.mocked(api.getRunFeedback).mockResolvedValue({})
  })

  it('Output Type label is present in every state (loading)', async () => {
    vi.mocked(api.listTemplates).mockImplementation(() => new Promise(() => {}))
    renderApp()
    const section = getOutputTypeSection()
    expect(within(section).getByText('Output Type')).toBeInTheDocument()
  })

  it('Output Type label is present in every state (success)', async () => {
    vi.mocked(api.listTemplates).mockResolvedValue(DEFAULT_TEMPLATES)
    renderApp()
    await waitFor(() => {
      expect(screen.getAllByRole('radio', { name: 'Implementation Guidance' }).length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getAllByText('Output Type').length).toBeGreaterThanOrEqual(1)
  })

  it('Output Type label is present in every state (error)', async () => {
    vi.mocked(api.listTemplates).mockRejectedValue(new Error('Failed'))
    renderApp()
    await waitFor(() => {
      expect(screen.getByText(/Failed to load output types/)).toBeInTheDocument()
    })
    const section = getOutputTypeSection()
    expect(within(section).getByText('Output Type')).toBeInTheDocument()
  })
})
