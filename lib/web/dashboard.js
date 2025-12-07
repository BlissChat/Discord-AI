// web/dashboard.js
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const { db } = require('../lib/db'); // direct DB access for analytics etc.
const teach = require('../plugins/teach'); // plugin code provides list/add/remove

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.DASHBOARD_SECRET || '';

app.use(bodyParser.json());

// simple auth middleware: pass header x-dashboard-secret
function auth(req, res, next) {
  const key = req.headers['x-dashboard-secret'] || req.query.secret;
  if (!SECRET) return res.status(500).send('DASHBOARD_SECRET not set on server');
  if (!key || key !== SECRET) return res.status(401).json({ error: 'Unauthorized' });
  return next();
}

// root: basic analytics
app.get('/', auth, (req, res) => {
  const stats = db.prepare('SELECT * FROM analytics').all();
  res.json({ ok: true, stats });
});

// Teach endpoints
// List patterns for a guild
app.get('/teach/:guildId', auth, (req, res) => {
  const guildId = req.params.guildId;
  try {
    const rows = teach.listPatterns(guildId);
    res.json({ ok: true, patterns: rows });
  } catch (e) {
    console.error('teach list error', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Add new pattern
app.post('/teach/:guildId', auth, (req, res) => {
  const guildId = req.params.guildId;
  const { trigger, response } = req.body;
  if (!trigger || !response) return res.status(400).json({ ok: false, error: 'trigger and response required' });
  try {
    teach.addPattern(guildId, trigger, response);
    res.json({ ok: true });
  } catch (e) {
    console.error('teach add error', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Remove pattern by id
app.delete('/teach/:guildId/:id', auth, (req, res) => {
  const guildId = req.params.guildId;
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'invalid id' });
  try {
    const ok = teach.removePattern(guildId, id);
    if (!ok) return res.status(404).json({ ok: false, error: 'pattern not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('teach remove error', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// minimal health
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(PORT, () => console.log(`Dashboard listening on ${PORT}`));
