/**
 * API client for backend. Expand in Sections E–G.
 * Base URL: same origin (Vite proxies /api to backend).
 */

const API = '/api'

export async function listTemplates(): Promise<{ id: string; name: string; description: string | null; section_count: number }[]> {
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
