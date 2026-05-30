const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

app.post('/api/todoist', async (req, res) => {
  console.log('Todoist request received:', req.body?.path);
  try {
    const { path: apiPath, method, body, token } = req.body;
    console.log('Token length:', token?.length, 'Path:', apiPath);
    const opts = {
      method: method || 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`https://api.todoist.com/rest/v2${apiPath}`, opts);
    console.log('Todoist response status:', r.status);
    const text = await r.text();
    console.log('Todoist response:', text.substring(0, 100));
    res.status(r.status).send(text || '{}');
  } catch(e) {
    console.log('Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/claude', async (req, res) => {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(req.body)
    });
    const text = await r.text();
    res.status(r.status).send(text);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
