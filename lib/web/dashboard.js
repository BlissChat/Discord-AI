// web/dashboard.js
const express = require('express');
const { db } = require('../lib/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  const stats = db.prepare('SELECT * FROM analytics').all();
  res.send(`<h1>Bot Analytics</h1><pre>${JSON.stringify(stats, null, 2)}</pre>`);
});

app.listen(PORT, () => console.log('Dashboard listening on', PORT));
