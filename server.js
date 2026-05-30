const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

app.post('/api/todoist', async (req, res) => {
  try {
    const { path: apiPath, method, body, token } = req.body;
    const opts = {
      method: method || 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`https://api.todoist.com/rest/v2${apiPath}`, opts);
    const text = await r.text();
    res.status(r.status).send(text || '{}');
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
