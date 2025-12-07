// web/dashboard.js
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const { db } = require('../lib/db');
const teach = require('../plugins/teach');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.DASHBOARD_SECRET || '';

app.use(bodyParser.json());

function auth(req, res, next) {
  if (!SECRET) return res.status(500).send('DASHBOARD_SECRET not set in env');
  const key = req.headers['x-dashboard-secret'] || req.query.secret;
  if (!key || key !== SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/', auth, (req, res) => {
  const stats = db.prepare('SELECT * FROM analytics').all();
  res.json({ ok: true, stats });
});

// teach endpoints
app.get('/teach/:guildId', auth, (req, res) => {
  const g = req.params.guildId;
  try {
    const rows = teach.listPatterns(g);
    res.json({ ok: true, patterns: rows });
  } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
});
app.post('/teach/:guildId', auth, (req, res) => {
  const g = req.params.guildId;
  const { trigger, response } = req.body;
  if (!trigger || !response) return res.status(400).json({ ok: false, error: 'trigger and response required' });
  try { teach.addPattern(g, trigger, response); res.json({ ok: true }); } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
});
app.delete('/teach/:guildId/:id', auth, (req, res) => {
  const g = req.params.guildId;
  const id = parseInt(req.params.id, 10);
  try { teach.removePattern(g, id); res.json({ ok: true }); } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(PORT, () => console.log(`Dashboard listening on ${PORT}`));
