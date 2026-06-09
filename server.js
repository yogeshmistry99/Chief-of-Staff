const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public', {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }
}));

app.post('/api/todoist', async (req, res) => {
  try {
    const { path: apiPath, method, body, token } = req.body;
    const opts = {
      method: method || 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    const url = `https://api.todoist.com/api/v1/${apiPath.replace(/^\//, '')}`;
    const r = await fetch(url, opts);
    const text = await r.text();
    res.status(r.status).send(text || '{}');
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai', async (req, res) => {
  console.log('AI request received, key present:', !!process.env.ANTHROPIC_API_KEY);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify(req.body)
    });
    console.log('Anthropic status:', r.status);
    const text = await r.text();
    res.status(r.status).send(text);
  } catch(e) {
    console.log('AI error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
