/**
 * API client for backend. Section F: templates, create run, get run.
 * Base URL: same origin (Vite proxies /api to backend).
 */

const API = '/api'

export interface TemplateSummary {
  id: string
  name: string
  description: string | null
  section_count: number
}

export async function listTemplates(): Promise<TemplateSummary[]> {
  const res = await fetch(`${API}/templates`)
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data.templates ?? []
}

export async function getTemplate(templateId: string) {
  const res = await fetch(`${API}/templates/${templateId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export interface CreateRunBody {
  template_id: string
  structured_input: Record<string, string>
}

export async function createRun(body: CreateRunBody): Promise<{ run_id: string }> {
  const res = await fetch(`${API}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

export interface SectionOutput {
  section_id: string
  content: string
  updated_at: string
}

export interface AssembledDoc {
  run_id: string
  content: string
  assembled_at: string
}

export interface RunDetail {
  run_id: string
  template_id: string
  structured_input: Record<string, unknown>
  status: string
  created_at: string
  updated_at: string
  section_ids: string[]
  error: string | null
  sections: SectionOutput[]
  assembled: AssembledDoc | null
}

export async function getRun(runId: string): Promise<RunDetail> {
  const res = await fetch(`${API}/runs/${runId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
