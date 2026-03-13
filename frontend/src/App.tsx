/**
 * Minimal scaffold for Section A. Proxy to backend is configured in vite.config.
 * Sections F–G will add generation form, template selection, run status, history.
 */
import { useEffect, useState } from 'react'

function App() {
  const [templates, setTemplates] = useState<{ id: string; name: string; section_count: number }[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then((data) => setTemplates(data.templates ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to fetch'))
  }, [])

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Document Generation Engine</h1>
      <p>Section A/B scaffold. Backend: <code>GET /api/templates</code>.</p>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {!error && (
        <ul>
          {templates.map((t) => (
            <li key={t.id}>{t.name} (id: {t.id}, sections: {t.section_count})</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default App
