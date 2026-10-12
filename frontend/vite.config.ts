import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Reads frontend/.env.local on every request, so adding/changing the key needs no restart.
function readEnv(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(__dirname, '.env.local'), 'utf8')
    return Object.fromEntries(
      raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => {
          const i = l.indexOf('=')
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
        }),
    )
  } catch {
    return {}
  }
}

// Tiny Grok proxy inside the dev server: the API key stays on this machine, never in the browser.
//   GET  /api/grok/status → { configured, model, provider }
//   POST /api/grok        → forwards { messages } to xAI chat completions (JSON mode)
function grokProxy(): Plugin {
  return {
    name: 'grok-proxy',
    configureServer(server) {
      server.middlewares.use('/api/grok', async (req, res) => {
        const env = readEnv()
        const key = env.XAI_API_KEY || env.GROQ_API_KEY || process.env.XAI_API_KEY || ''
        // Provider is picked from the key prefix: gsk_ = Groq (groq.com), otherwise xAI Grok. Both are OpenAI-compatible.
        const isGroq = key.startsWith('gsk_')
        const provider = isGroq ? 'Groq' : 'Grok'
        const model = env.GROK_MODEL || (isGroq ? 'openai/gpt-oss-120b' : 'grok-4.20-0309-non-reasoning')
        const baseUrl = env.GROK_API_URL || (isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions')
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          res.end(JSON.stringify({ configured: Boolean(key), model, provider }))
          return
        }
        if (!key) {
          res.statusCode = 503
          res.end(JSON.stringify({ error: 'XAI_API_KEY not set in frontend/.env.local' }))
          return
        }

        let body = ''
        for await (const chunk of req) body += chunk
        try {
          const { messages } = JSON.parse(body)
          const r = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model, messages, temperature: 0.4, response_format: { type: 'json_object' } }),
          })
          const data = await r.json()
          if (!r.ok) {
            res.statusCode = r.status
            res.end(JSON.stringify({ error: data?.error?.message ?? data?.error ?? `Grok API error ${r.status}` }))
            return
          }
          res.end(JSON.stringify({ content: data.choices?.[0]?.message?.content ?? '' }))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(e) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), grokProxy()],
  server: {
    // FastAPI backend (backend/main.py). /api/grok stays in the grok-proxy plugin above.
    proxy: { '/api/v1': 'http://127.0.0.1:8000' },
  },
})
