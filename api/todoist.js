export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const apiKey = process.env.TODOIST_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'TODOIST_API_KEY not configured' })

  const { path = 'tasks', ...params } = req.query
  const url = new URL(`https://api.todoist.com/rest/v2/${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  try {
    const upstream = await fetch(url.toString(), {
      method: req.method === 'POST' ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(req.method === 'POST' && req.body
        ? { body: JSON.stringify(req.body) }
        : {}),
    })

    const text = await upstream.text()
    try {
      const data = text ? JSON.parse(text) : null
      res.status(upstream.status).json(data)
    } catch {
      // Return raw text so we can diagnose what Todoist is actually saying
      res.status(upstream.status).json({ error: 'Todoist returned non-JSON', raw: text, status: upstream.status })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
