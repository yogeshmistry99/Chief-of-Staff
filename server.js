import express from 'express'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'dist'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    }
  },
}))

app.post('/api/todoist', async (req, res) => {
  try {
    const { path: apiPath, method, body } = req.body
    const key = process.env.TODOIST_API_KEY
    if (!key) return res.status(500).json({ error: 'TODOIST_API_KEY not configured' })
    const opts = {
      method: method || 'GET',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    }
    if (body) opts.body = JSON.stringify(body)
    const url = `https://api.todoist.com/api/v1/${apiPath.replace(/^\//, '')}`
    const r = await fetch(url, opts)
    const text = await r.text()
    res.status(r.status).send(text || '{}')
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/ai', async (req, res) => {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify(req.body),
    })
    const text = await r.text()
    res.status(r.status).send(text)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Running on ${PORT}`))
